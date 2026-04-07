"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphAnalyzer = void 0;
class GraphAnalyzer {
    analyze(nodes, edges) {
        // Calculate clean subtrees
        this.markCleanSubtrees(nodes);
        // Collect statistics and categorized lists
        const cleanSubtrees = [];
        const trivialMerges = [];
        const conflicts = [];
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
            }
            else if (node.isCleanSubtree) {
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
    markCleanSubtrees(nodes) {
        // A node has a clean subtree if:
        // 1. Its own divergence is CLEAN or SAME_CHANGE
        // 2. ALL of its dependencies also have clean subtrees
        const processed = new Set();
        const visiting = new Set(); // Track nodes currently being visited (cycle detection)
        for (const node of nodes.values()) {
            this.markNodeCleanSubtree(node, nodes, processed, visiting);
        }
    }
    markNodeCleanSubtree(node, nodes, processed, visiting) {
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
        // Check all dependencies
        for (const depId of node.dependencies) {
            const dep = nodes.get(depId);
            if (!dep)
                continue;
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
    getMovableTrees(result) {
        const movable = [];
        for (const rootId of result.cleanSubtrees) {
            const files = this.collectSubtree(rootId, result.nodes);
            const breakdown = {
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
    collectSubtree(rootId, nodes) {
        const collected = new Set();
        const queue = [rootId];
        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (collected.has(nodeId))
                continue;
            const node = nodes.get(nodeId);
            if (!node || !node.isCleanSubtree)
                continue;
            collected.add(nodeId);
            for (const depId of node.dependencies) {
                if (!collected.has(depId)) {
                    queue.push(depId);
                }
            }
        }
        return Array.from(collected);
    }
    getDirtyNodes(result) {
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
    getConsolidationPriority(result) {
        const priorities = [];
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
            }
            else if (divType === 'RETAIL_ONLY' || divType === 'RESTAURANT_ONLY') {
                priorities.push({
                    nodeId: node.id,
                    priority: 'medium',
                    reason: `Trivial merge: only ${divType === 'RETAIL_ONLY' ? 'retail' : 'restaurant'} changed`,
                });
            }
            else if (divType === 'CONFLICT') {
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
exports.GraphAnalyzer = GraphAnalyzer;
