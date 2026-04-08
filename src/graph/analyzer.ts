import { FileNode, AnalysisResult, DependencyEdge } from '../config';

export class GraphAnalyzer {
  analyze(
    nodes: Map<string, FileNode>,
    edges: DependencyEdge[]
  ): AnalysisResult {
    // Calculate clean subtrees
    this.markCleanSubtrees(nodes);

    // Collect statistics and categorized lists
    const cleanSubtrees: string[] = [];
    const trivialMerges: string[] = [];
    const conflicts: string[] = [];

    let cleanFiles = 0;
    let retailOnlyFiles = 0;
    let restaurantOnlyFiles = 0;
    let sameChangeFiles = 0;
    let conflictFiles = 0;
    let unmatchedRetail = 0;
    let unmatchedRestaurant = 0;

    for (const node of nodes.values()) {
      const divType = node.divergence?.type;

      switch (divType) {
        case 'CLEAN':
          cleanFiles++;
          break;
        case 'RETAIL_ONLY':
          retailOnlyFiles++;
          trivialMerges.push(node.id);
          break;
        case 'RESTAURANT_ONLY':
          restaurantOnlyFiles++;
          trivialMerges.push(node.id);
          break;
        case 'SAME_CHANGE':
          sameChangeFiles++;
          break;
        case 'CONFLICT':
          conflictFiles++;
          conflicts.push(node.id);
          break;
      }

      if (!node.retailPath) {
        unmatchedRestaurant++;
      }
      if (!node.restaurantPath) {
        unmatchedRetail++;
      }

      // Check if this is a root of a clean subtree
      if (node.isCleanSubtree && node.dependents.length === 0) {
        cleanSubtrees.push(node.id);
      } else if (node.isCleanSubtree) {
        // Check if all dependents are NOT clean subtrees (meaning this is a boundary)
        const allDependentsClean = node.dependents.every(depId => {
          const dep = nodes.get(depId);
          return dep?.isCleanSubtree;
        });

        if (!allDependentsClean) {
          cleanSubtrees.push(node.id);
        }
      }
    }

    return {
      nodes,
      edges,
      cleanSubtrees,
      trivialMerges,
      conflicts,
      stats: {
        totalFiles: nodes.size,
        cleanFiles,
        retailOnlyFiles,
        restaurantOnlyFiles,
        sameChangeFiles,
        conflictFiles,
        unmatchedRetail,
        unmatchedRestaurant,
      },
    };
  }

  private markCleanSubtrees(nodes: Map<string, FileNode>): void {
    // A node has a clean subtree if:
    // 1. Its own divergence is CLEAN or SAME_CHANGE
    // 2. ALL of its dependencies also have clean subtrees

    const processed = new Set<string>();
    const visiting = new Set<string>(); // Track nodes currently being visited (cycle detection)

    for (const node of nodes.values()) {
      this.markNodeCleanSubtree(node, nodes, processed, visiting);
    }
  }

  private markNodeCleanSubtree(
    node: FileNode,
    nodes: Map<string, FileNode>,
    processed: Set<string>,
    visiting: Set<string>
  ): boolean {
    // Already processed
    if (processed.has(node.id)) {
      return node.isCleanSubtree;
    }

    // Cycle detected - treat as not clean to break the cycle
    if (visiting.has(node.id)) {
      return false;
    }

    // Mark as visiting before recursing
    visiting.add(node.id);

    // Check if this node itself is clean
    const selfClean = node.divergence?.type === 'CLEAN' || node.divergence?.type === 'SAME_CHANGE';

    if (!selfClean) {
      node.isCleanSubtree = false;
      visiting.delete(node.id);
      processed.add(node.id);
      return false;
    }

    // Check for unresolved imports - these block clean subtree status
    if (node.unresolvedImports && node.unresolvedImports.length > 0) {
      node.isCleanSubtree = false;
      visiting.delete(node.id);
      processed.add(node.id);
      return false;
    }

    // Check all dependencies
    for (const depId of node.dependencies) {
      const dep = nodes.get(depId);
      if (!dep) continue;

      const depClean = this.markNodeCleanSubtree(dep, nodes, processed, visiting);
      if (!depClean) {
        node.isCleanSubtree = false;
        visiting.delete(node.id);
        processed.add(node.id);
        return false;
      }
    }

    node.isCleanSubtree = true;
    visiting.delete(node.id);
    processed.add(node.id);
    return true;
  }

  getMovableTrees(result: AnalysisResult): Array<{
    rootId: string;
    files: string[];
    totalFiles: number;
    divergenceBreakdown: Record<string, number>;
  }> {
    const movable: Array<{
      rootId: string;
      files: string[];
      totalFiles: number;
      divergenceBreakdown: Record<string, number>;
    }> = [];

    for (const rootId of result.cleanSubtrees) {
      const files = this.collectSubtree(rootId, result.nodes);
      const breakdown: Record<string, number> = {
        CLEAN: 0,
        SAME_CHANGE: 0,
      };

      for (const fileId of files) {
        const node = result.nodes.get(fileId);
        if (node?.divergence?.type) {
          breakdown[node.divergence.type] = (breakdown[node.divergence.type] || 0) + 1;
        }
      }

      movable.push({
        rootId,
        files,
        totalFiles: files.length,
        divergenceBreakdown: breakdown,
      });
    }

    // Sort by total files descending
    movable.sort((a, b) => b.totalFiles - a.totalFiles);

    return movable;
  }

  private collectSubtree(rootId: string, nodes: Map<string, FileNode>): string[] {
    const collected = new Set<string>();
    const queue = [rootId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (collected.has(nodeId)) continue;

      const node = nodes.get(nodeId);
      if (!node || !node.isCleanSubtree) continue;

      collected.add(nodeId);

      for (const depId of node.dependencies) {
        if (!collected.has(depId)) {
          queue.push(depId);
        }
      }
    }

    return Array.from(collected);
  }

  getDirtyNodes(result: AnalysisResult): FileNode[] {
    return Array.from(result.nodes.values())
      .filter(n => n.divergence?.type === 'CONFLICT')
      .sort((a, b) => {
        // Sort by total changes descending
        const aChanges = (a.divergence?.retailChanges.additions || 0) +
                        (a.divergence?.retailChanges.deletions || 0) +
                        (a.divergence?.restaurantChanges.additions || 0) +
                        (a.divergence?.restaurantChanges.deletions || 0);
        const bChanges = (b.divergence?.retailChanges.additions || 0) +
                        (b.divergence?.retailChanges.deletions || 0) +
                        (b.divergence?.restaurantChanges.additions || 0) +
                        (b.divergence?.restaurantChanges.deletions || 0);
        return bChanges - aChanges;
      });
  }

  /**
   * Bottleneck Analysis: Find nodes that, if cleaned, would unlock the largest clean subtrees.
   *
   * For each non-clean node N, we calculate:
   * - How many nodes have N as their ONLY blocking dependency
   * - These are nodes that would become part of clean subtrees if N were resolved
   *
   * Related concepts: Dominator analysis, articulation points, influence maximization
   */
  getBottlenecks(result: AnalysisResult): Array<{
    nodeId: string;
    relativePath: string;
    divergenceType: string;
    unlockCount: number;        // Nodes that would be unlocked
    unlockPaths: string[];      // Sample of paths that would be unlocked
    totalChanges: number;       // Lines changed (effort estimate)
    impactScore: number;        // unlockCount / totalChanges (bang for buck)
  }> {
    const nodes = result.nodes;

    // Step 1: Find all non-clean nodes (blockers)
    const blockers = new Set<string>();
    for (const node of nodes.values()) {
      const divType = node.divergence?.type;
      if (divType && divType !== 'CLEAN' && divType !== 'SAME_CHANGE') {
        blockers.add(node.id);
      }
    }

    // Step 2: For each node, find all blocker ancestors (transitive)
    const blockerAncestors = new Map<string, Set<string>>();

    const getBlockerAncestors = (nodeId: string, visited: Set<string>): Set<string> => {
      if (blockerAncestors.has(nodeId)) {
        return blockerAncestors.get(nodeId)!;
      }
      if (visited.has(nodeId)) {
        return new Set(); // Cycle
      }

      visited.add(nodeId);
      const node = nodes.get(nodeId);
      if (!node) return new Set();

      const ancestors = new Set<string>();

      // If this node itself is a blocker, add it
      if (blockers.has(nodeId)) {
        ancestors.add(nodeId);
      }

      // Add blocker ancestors from dependencies
      for (const depId of node.dependencies) {
        const depAncestors = getBlockerAncestors(depId, visited);
        for (const a of depAncestors) {
          ancestors.add(a);
        }
      }

      blockerAncestors.set(nodeId, ancestors);
      return ancestors;
    };

    for (const node of nodes.values()) {
      getBlockerAncestors(node.id, new Set());
    }

    // Step 3: For each blocker, count nodes where it's the ONLY blocker
    const unlockMap = new Map<string, string[]>(); // blocker -> nodes it solely blocks

    for (const [nodeId, ancestors] of blockerAncestors.entries()) {
      if (ancestors.size === 1) {
        // This node has exactly one blocker - that blocker solely blocks this node
        const [blockerId] = ancestors;
        if (!unlockMap.has(blockerId)) {
          unlockMap.set(blockerId, []);
        }
        unlockMap.get(blockerId)!.push(nodeId);
      }
    }

    // Step 4: Build result with impact scores
    const bottlenecks: Array<{
      nodeId: string;
      relativePath: string;
      divergenceType: string;
      unlockCount: number;
      unlockPaths: string[];
      totalChanges: number;
      impactScore: number;
    }> = [];

    for (const blockerId of blockers) {
      const node = nodes.get(blockerId);
      if (!node) continue;

      const unlocked = unlockMap.get(blockerId) || [];
      const totalChanges = (node.divergence?.retailChanges.additions || 0) +
                          (node.divergence?.retailChanges.deletions || 0) +
                          (node.divergence?.restaurantChanges.additions || 0) +
                          (node.divergence?.restaurantChanges.deletions || 0);

      // Impact score: nodes unlocked per line of change (higher = better ROI)
      const impactScore = totalChanges > 0 ? unlocked.length / totalChanges : unlocked.length;

      bottlenecks.push({
        nodeId: blockerId,
        relativePath: node.relativePath,
        divergenceType: node.divergence?.type || 'unknown',
        unlockCount: unlocked.length,
        unlockPaths: unlocked.slice(0, 5).map(id => nodes.get(id)?.relativePath || id),
        totalChanges,
        impactScore,
      });
    }

    // Sort by unlock count descending (most impactful first)
    bottlenecks.sort((a, b) => b.unlockCount - a.unlockCount);

    return bottlenecks;
  }

  getConsolidationPriority(result: AnalysisResult): Array<{
    nodeId: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }> {
    const priorities: Array<{
      nodeId: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
    }> = [];

    for (const node of result.nodes.values()) {
      const divType = node.divergence?.type;

      if (divType === 'CLEAN' || divType === 'SAME_CHANGE') {
        if (node.isCleanSubtree && node.dependencies.length > 0) {
          priorities.push({
            nodeId: node.id,
            priority: 'high',
            reason: 'Clean subtree root with dependencies',
          });
        }
      } else if (divType === 'RETAIL_ONLY' || divType === 'RESTAURANT_ONLY') {
        priorities.push({
          nodeId: node.id,
          priority: 'medium',
          reason: `Trivial merge: only ${divType === 'RETAIL_ONLY' ? 'retail' : 'restaurant'} changed`,
        });
      } else if (divType === 'CONFLICT') {
        const changes = (node.divergence?.retailChanges.additions || 0) +
                       (node.divergence?.retailChanges.deletions || 0) +
                       (node.divergence?.restaurantChanges.additions || 0) +
                       (node.divergence?.restaurantChanges.deletions || 0);

        priorities.push({
          nodeId: node.id,
          priority: 'low',
          reason: `Conflict with ${changes} total changed lines`,
        });
      }
    }

    return priorities;
  }
}
