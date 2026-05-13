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
  ValidationResult,
  ValidationLeak,
} from './types';
import { DiffResult } from '../diff/types';
import { pathsMatch } from '../utils/paths';

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
   * Validate clean subtrees before migration (Fix 3.3)
   *
   * This is a SAFETY NET that runs before any migration executes.
   * It re-verifies that every file marked isCleanSubtree=true has
   * ALL its dependencies also marked as clean subtrees.
   *
   * If any leak is found, migration should be ABORTED.
   *
   * @param report - The analysis report to validate
   * @returns ValidationResult with any leaks found
   */
  validateBeforeMigration(report: AnalysisReport): ValidationResult {
    const leaks: ValidationLeak[] = [];
    let checkedFiles = 0;
    let checkedDependencies = 0;

    // Build a map for quick lookup
    const fileMap = new Map<string, FileMatch>();
    for (const file of report.files) {
      fileMap.set(file.relativePath, file);
    }

    // Check every file marked as clean subtree
    for (const file of report.files) {
      if (!file.isCleanSubtree) continue;
      checkedFiles++;

      // Verify ALL dependencies are also clean subtrees
      for (const depPath of file.dependencies) {
        checkedDependencies++;

        // Skip external dependencies
        if (depPath.startsWith('external:')) continue;

        // Find the dependency file
        const depFile = fileMap.get(depPath) || this.findFileByPath(fileMap, depPath);

        if (!depFile) {
          // Dependency not in our file list - this is a leak!
          leaks.push({
            file: file.relativePath,
            dependency: depPath,
            dependencyStatus: 'conflict', // Unknown = treat as conflict
            reason: 'Dependency not found in analysis (untracked file)',
          });
          continue;
        }

        if (!depFile.isCleanSubtree) {
          // Dependency is NOT a clean subtree - this is a leak!
          leaks.push({
            file: file.relativePath,
            dependency: depPath,
            dependencyStatus: depFile.status,
            reason: `Dependency has status '${depFile.status}' and isCleanSubtree=false`,
          });
        }
      }

      // Also check for unresolved imports (should block but double-check)
      if (file.hasUnresolvedImports && file.unresolvedImports.length > 0) {
        for (const unresolved of file.unresolvedImports) {
          leaks.push({
            file: file.relativePath,
            dependency: unresolved,
            dependencyStatus: 'conflict',
            reason: 'Unresolved import - cannot verify dependency status',
          });
        }
      }
    }

    return {
      valid: leaks.length === 0,
      leaks,
      checkedFiles,
      checkedDependencies,
    };
  }

  /**
   * Helper to find a file by path with fuzzy matching
   */
  private findFileByPath(fileMap: Map<string, FileMatch>, depPath: string): FileMatch | null {
    // Direct lookup
    if (fileMap.has(depPath)) {
      return fileMap.get(depPath)!;
    }

    // Try pathsMatch for normalized comparison
    for (const [key, file] of fileMap.entries()) {
      if (pathsMatch(key, depPath)) {
        return file;
      }
    }

    return null;
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

    // Cycle detection (Fix 1.4)
    // If we're revisiting a file, it means we're in a circular dependency
    // Return true (optimistic) - the actual cleanliness check happens at function start
    // A cycle between clean files is still a clean subtree
    if (visiting.has(relativePath)) {
      return true;
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

    // Block clean subtree status for files with unresolved imports (Fix 1.2)
    // These files have dependencies we couldn't track - migration would fail
    if (file.hasUnresolvedImports) {
      file.isCleanSubtree = false;
      this.cleanSubtreeCache.set(relativePath, false);
      return false;
    }

    // Block clean subtree for files with ONLY symbolic deps (Fix 1.3)
    // If a file has symbolic deps but zero tracked file deps, we can't verify its dependencies
    if (file.hasSymbolicDependencies && file.dependencies.length === 0) {
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

      // If dependency is not in our files map, it could be:
      // 1. Already migrated to merged (safe)
      // 2. A file we couldn't find (unsafe - blocks clean subtree)
      if (!this.files.has(depPath)) {
        // Try to find a matching file with different path format
        const match = this.findMatchingFile(depPath);
        if (match) {
          // Found a match, check if it's clean
          const matchedFile = this.files.get(match)!;
          if (!this.isCleanSubtree(match, visiting)) {
            file.isCleanSubtree = false;
            this.cleanSubtreeCache.set(relativePath, false);
            visiting.delete(relativePath);
            return false;
          }
          continue;
        }
        // No match found - this is an untracked dependency, block clean status
        // (Better to be safe than to migrate broken subtrees)
        file.isCleanSubtree = false;
        this.cleanSubtreeCache.set(relativePath, false);
        visiting.delete(relativePath);
        return false;
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
   * Try to find a file in the files map that matches the given path
   * STRICT matching to avoid illusory dependencies (Fix 2.3)
   *
   * Strategy: Prefer no match over false match. A missed match just blocks
   * clean subtree (safe). A false match creates illusory dependencies (dangerous).
   */
  private findMatchingFile(depPath: string): string | null {
    const filename = depPath.split('/').pop() || '';
    if (!filename) return null;

    // 1. Try exact match first
    if (this.files.has(depPath)) return depPath;

    // 2. Try centralized path matching (Fix 2.1)
    for (const key of this.files.keys()) {
      if (pathsMatch(key, depPath)) return key;
    }

    // 3. Strict suffix matching - require at least 2 path segments to match
    //    (filename + at least one parent directory)
    const depParts = depPath.split('/').filter(p => p.length > 0);
    if (depParts.length < 2) {
      // If depPath is just a filename, only match if exactly ONE file has that name
      const candidates: string[] = [];
      for (const key of this.files.keys()) {
        if (key.endsWith('/' + filename) || key === filename) {
          candidates.push(key);
        }
      }
      // Only return if unambiguous (exactly one match)
      return candidates.length === 1 ? candidates[0] : null;
    }

    // Require ALL parts of depPath to match the end of key
    for (const key of this.files.keys()) {
      const keyParts = key.split('/').filter(p => p.length > 0);
      if (keyParts.length < depParts.length) continue;

      let allMatch = true;
      for (let i = 1; i <= depParts.length; i++) {
        if (depParts[depParts.length - i] !== keyParts[keyParts.length - i]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return key;
    }

    // No confident match - return null (safe default)
    return null;
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

    // Filter out bottlenecks that unlock nothing (not interesting)
    // Sort by impactScore descending (best bang for buck first)
    return bottlenecks
      .filter(b => b.unlockCount > 0)
      .sort((a, b) => b.impactScore - a.impactScore);
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
