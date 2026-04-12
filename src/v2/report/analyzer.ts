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

      // Skip dependencies that point to merged (already migrated = safe)
      if (depPath.includes('/merged/') || depPath.startsWith('merged:')) continue;

      // If dependency is not in our files map, it might be in merged already
      if (!this.files.has(depPath)) {
        // Check if this looks like an already-migrated file (path to merged)
        // If it's truly missing/broken, that's a different problem
        continue;
      }

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
   *
   * For each dirty node, calculate: if we fix this node, how many currently-blocked
   * clean nodes would become part of clean subtrees (transitively)?
   *
   * Impact score = unlocked files / lines to change (higher = better ROI)
   */
  private findBottlenecks(): BottleneckNode[] {
    const bottlenecks: BottleneckNode[] = [];

    // Find all dirty nodes (potential bottlenecks)
    const dirtyNodes: string[] = [];
    for (const file of this.files.values()) {
      if (file.status !== 'clean' && file.status !== 'same-change') {
        dirtyNodes.push(file.relativePath);
      }
    }

    // Get current baseline: files already in clean subtrees
    const currentlyMovable = new Set<string>();
    for (const file of this.files.values()) {
      if (file.isCleanSubtree) {
        currentlyMovable.add(file.relativePath);
      }
    }

    // For each dirty node, simulate fixing it and count newly unlocked files
    for (const dirtyPath of dirtyNodes) {
      const file = this.files.get(dirtyPath);
      if (!file) continue;

      // Simulate: what if this file were clean?
      const newlyUnlocked = this.simulateFixAndCountUnlocked(dirtyPath, currentlyMovable);

      const linesChanged = file.linesChanged || this.estimateLinesChanged(file);

      // Impact score = files unlocked per line of change
      const impactScore = linesChanged > 0 ? newlyUnlocked.length / linesChanged : 0;

      bottlenecks.push({
        relativePath: dirtyPath,
        status: file.status,
        unlockCount: newlyUnlocked.length,
        unlockedPaths: newlyUnlocked.slice(0, 10),
        linesChanged,
        impactScore,
      });
    }

    // Sort by impactScore descending (best bang for buck first)
    bottlenecks.sort((a, b) => b.impactScore - a.impactScore);

    return bottlenecks;
  }

  /**
   * Simulate fixing a dirty node and return list of files that become movable
   */
  private simulateFixAndCountUnlocked(fixedPath: string, currentlyMovable: Set<string>): string[] {
    const newlyUnlocked: string[] = [];

    // Check each file that's currently NOT movable
    for (const file of this.files.values()) {
      if (currentlyMovable.has(file.relativePath)) continue;

      // File must be clean/same-change to potentially become movable
      if (file.status !== 'clean' && file.status !== 'same-change') continue;

      // Check if this file would be in a clean subtree if fixedPath were clean
      if (this.wouldBeCleanSubtreeIfFixed(file.relativePath, fixedPath, new Set())) {
        newlyUnlocked.push(file.relativePath);
      }
    }

    return newlyUnlocked;
  }

  /**
   * Check if a file would be part of a clean subtree if fixedPath were fixed
   */
  private wouldBeCleanSubtreeIfFixed(
    path: string,
    fixedPath: string,
    visiting: Set<string>
  ): boolean {
    if (visiting.has(path)) return false;

    const file = this.files.get(path);
    if (!file) return false;

    // If this IS the fixed path, treat it as clean
    if (path === fixedPath) return true;

    // If it's already a clean subtree, it stays clean
    if (file.isCleanSubtree) return true;

    // Must be clean or same-change status
    if (file.status !== 'clean' && file.status !== 'same-change') return false;

    visiting.add(path);

    // Check all dependencies
    for (const depPath of file.dependencies) {
      if (depPath.startsWith('external:')) continue;
      if (!this.files.has(depPath)) continue;

      const depFile = this.files.get(depPath)!;

      // If dep is the fixed path, treat as clean
      if (depPath === fixedPath) continue;

      // If dep is already clean subtree, it's fine
      if (depFile.isCleanSubtree) continue;

      // If dep is dirty (not the fixed one), this file can't be unlocked
      if (depFile.status !== 'clean' && depFile.status !== 'same-change') {
        visiting.delete(path);
        return false;
      }

      // Recursively check if dep would be clean subtree
      if (!this.wouldBeCleanSubtreeIfFixed(depPath, fixedPath, visiting)) {
        visiting.delete(path);
        return false;
      }
    }

    visiting.delete(path);
    return true;
  }

  /**
   * Estimate lines changed based on file status
   */
  private estimateLinesChanged(file: FileMatch): number {
    // Default estimates based on status
    switch (file.status) {
      case 'conflict':
        return 50; // Conflicts typically need more work
      case 'retail-only':
      case 'restaurant-only':
        return 20; // One-sided, need to add/review
      default:
        return 10;
    }
  }
}
