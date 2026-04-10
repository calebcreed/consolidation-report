/**
 * Report Analyzer - Computes clean subtrees and bottleneck analysis
 */

import {
  FileMatch,
  FileStatus,
  CleanSubtree,
  BottleneckNode,
  SummaryStats,
  AnalysisReport,
} from './types';
import { DiffResult } from '../diff/types';

export class ReportAnalyzer {
  private files: Map<string, FileMatch> = new Map();
  private cleanSubtreeCache: Map<string, boolean> = new Map();

  /**
   * Build analysis report from file matches
   */
  analyze(fileMatches: FileMatch[]): AnalysisReport {
    // Index files by relativePath
    this.files.clear();
    this.cleanSubtreeCache.clear();
    for (const file of fileMatches) {
      this.files.set(file.relativePath, file);
    }

    // Mark clean subtrees
    this.markCleanSubtrees();

    // Calculate statistics
    const stats = this.calculateStats();

    // Find clean subtrees (ranked by size)
    const cleanSubtrees = this.findCleanSubtrees();

    // Find bottleneck nodes (ranked by impact)
    const bottlenecks = this.findBottlenecks();

    return {
      generatedAt: new Date().toISOString(),
      stats,
      files: fileMatches,
      cleanSubtrees,
      bottlenecks,
    };
  }

  /**
   * Mark which files are part of clean subtrees
   * A file is in a clean subtree if:
   * 1. It is clean or same-change
   * 2. ALL of its dependencies are also in clean subtrees
   */
  private markCleanSubtrees(): void {
    const visiting = new Set<string>();

    for (const file of this.files.values()) {
      this.isCleanSubtree(file.relativePath, visiting);
    }
  }

  private isCleanSubtree(relativePath: string, visiting: Set<string>): boolean {
    // Check cache
    if (this.cleanSubtreeCache.has(relativePath)) {
      return this.cleanSubtreeCache.get(relativePath)!;
    }

    // Cycle detection
    if (visiting.has(relativePath)) {
      return false;
    }

    const file = this.files.get(relativePath);
    if (!file) {
      return false;
    }

    // Check if file itself is clean
    const selfClean = file.status === 'clean' || file.status === 'same-change';
    if (!selfClean) {
      file.isCleanSubtree = false;
      this.cleanSubtreeCache.set(relativePath, false);
      return false;
    }

    visiting.add(relativePath);

    // Check all dependencies
    for (const depPath of file.dependencies) {
      // Skip external dependencies
      if (depPath.startsWith('external:')) continue;

      const depClean = this.isCleanSubtree(depPath, visiting);
      if (!depClean) {
        file.isCleanSubtree = false;
        this.cleanSubtreeCache.set(relativePath, false);
        visiting.delete(relativePath);
        return false;
      }
    }

    file.isCleanSubtree = true;
    this.cleanSubtreeCache.set(relativePath, true);
    visiting.delete(relativePath);
    return true;
  }

  /**
   * Calculate summary statistics
   */
  private calculateStats(): SummaryStats {
    let totalFiles = 0;
    let cleanFiles = 0;
    let retailOnlyFiles = 0;
    let restaurantOnlyFiles = 0;
    let conflictFiles = 0;
    let sameChangeFiles = 0;
    let immediatelyMovable = 0;
    let blockedClean = 0;

    for (const file of this.files.values()) {
      totalFiles++;

      switch (file.status) {
        case 'clean':
          cleanFiles++;
          break;
        case 'retail-only':
          retailOnlyFiles++;
          break;
        case 'restaurant-only':
          restaurantOnlyFiles++;
          break;
        case 'conflict':
          conflictFiles++;
          break;
        case 'same-change':
          sameChangeFiles++;
          break;
      }

      // Check if immediately movable (clean subtree)
      if (file.isCleanSubtree) {
        immediatelyMovable++;
      } else if (file.status === 'clean' || file.status === 'same-change') {
        // Clean but blocked by dirty dependencies
        blockedClean++;
      }
    }

    return {
      totalFiles,
      cleanFiles,
      retailOnlyFiles,
      restaurantOnlyFiles,
      conflictFiles,
      sameChangeFiles,
      immediatelyMovable,
      blockedClean,
    };
  }

  /**
   * Find clean subtrees - groups of files that can be moved together
   * Returns subtrees ranked by size (descending)
   */
  private findCleanSubtrees(): CleanSubtree[] {
    const subtrees: CleanSubtree[] = [];
    const assigned = new Set<string>();

    // Find root nodes of clean subtrees
    // A root is a clean subtree file with no dependents that are also clean subtrees
    // OR all its dependents are NOT clean subtrees
    for (const file of this.files.values()) {
      if (!file.isCleanSubtree) continue;
      if (assigned.has(file.relativePath)) continue;

      // Check if this is a root
      const isRoot = this.isSubtreeRoot(file);
      if (!isRoot) continue;

      // Collect all files in this subtree
      const subtreeFiles = this.collectSubtree(file.relativePath, assigned);

      // Calculate breakdown
      const breakdown: Record<FileStatus, number> = {
        'clean': 0,
        'retail-only': 0,
        'restaurant-only': 0,
        'conflict': 0,
        'same-change': 0,
      };

      for (const path of subtreeFiles) {
        const f = this.files.get(path);
        if (f) {
          breakdown[f.status]++;
        }
      }

      subtrees.push({
        rootPath: file.relativePath,
        files: subtreeFiles,
        totalFiles: subtreeFiles.length,
        breakdown,
      });
    }

    // Sort by size descending
    subtrees.sort((a, b) => b.totalFiles - a.totalFiles);

    return subtrees;
  }

  private isSubtreeRoot(file: FileMatch): boolean {
    // No dependents = definitely a root
    if (file.dependents.length === 0) return true;

    // If any dependent is NOT a clean subtree, this file is a boundary/root
    for (const depPath of file.dependents) {
      const dep = this.files.get(depPath);
      if (!dep || !dep.isCleanSubtree) {
        return true;
      }
    }

    // All dependents are also clean subtrees, so this is not a root
    return false;
  }

  private collectSubtree(rootPath: string, assigned: Set<string>): string[] {
    const collected: string[] = [];
    const queue = [rootPath];

    while (queue.length > 0) {
      const path = queue.shift()!;
      if (assigned.has(path)) continue;

      const file = this.files.get(path);
      if (!file || !file.isCleanSubtree) continue;

      assigned.add(path);
      collected.push(path);

      // Add dependencies (they're part of the same subtree)
      for (const depPath of file.dependencies) {
        if (!depPath.startsWith('external:') && !assigned.has(depPath)) {
          queue.push(depPath);
        }
      }
    }

    return collected;
  }

  /**
   * Find bottleneck nodes - dirty nodes that block the most clean files
   * Returns nodes ranked by unlockCount (descending)
   */
  private findBottlenecks(): BottleneckNode[] {
    const bottlenecks: BottleneckNode[] = [];

    // Find all dirty nodes (blockers)
    const blockers = new Set<string>();
    for (const file of this.files.values()) {
      if (file.status !== 'clean' && file.status !== 'same-change') {
        blockers.add(file.relativePath);
      }
    }

    // For each file, find all blocker ancestors (transitive)
    const blockerAncestors = new Map<string, Set<string>>();

    const getBlockerAncestors = (path: string, visiting: Set<string>): Set<string> => {
      if (blockerAncestors.has(path)) {
        return blockerAncestors.get(path)!;
      }
      if (visiting.has(path)) {
        return new Set(); // Cycle
      }

      const file = this.files.get(path);
      if (!file) return new Set();

      visiting.add(path);
      const ancestors = new Set<string>();

      // If this node itself is a blocker, add it
      if (blockers.has(path)) {
        ancestors.add(path);
      }

      // Add blocker ancestors from dependencies
      for (const depPath of file.dependencies) {
        if (depPath.startsWith('external:')) continue;

        const depAncestors = getBlockerAncestors(depPath, visiting);
        for (const a of depAncestors) {
          ancestors.add(a);
        }
      }

      blockerAncestors.set(path, ancestors);
      visiting.delete(path);
      return ancestors;
    };

    for (const file of this.files.values()) {
      getBlockerAncestors(file.relativePath, new Set());
    }

    // For each blocker, count nodes where it's the ONLY blocker
    const unlockMap = new Map<string, string[]>();

    for (const [path, ancestors] of blockerAncestors.entries()) {
      const file = this.files.get(path);
      if (!file) continue;

      // Only count clean/same-change files that are blocked
      if (file.status !== 'clean' && file.status !== 'same-change') continue;

      if (ancestors.size === 1) {
        // This file has exactly one blocker - resolving that blocker unlocks this file
        const [blockerId] = ancestors;
        if (!unlockMap.has(blockerId)) {
          unlockMap.set(blockerId, []);
        }
        unlockMap.get(blockerId)!.push(path);
      }
    }

    // Build bottleneck results
    for (const blockerPath of blockers) {
      const file = this.files.get(blockerPath);
      if (!file) continue;

      const unlocked = unlockMap.get(blockerPath) || [];

      bottlenecks.push({
        relativePath: blockerPath,
        status: file.status,
        unlockCount: unlocked.length,
        unlockedPaths: unlocked.slice(0, 10), // Sample
        impactScore: unlocked.length, // Simple impact = files unlocked
      });
    }

    // Sort by unlockCount descending
    bottlenecks.sort((a, b) => b.unlockCount - a.unlockCount);

    return bottlenecks;
  }
}
