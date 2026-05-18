/**
 * Leafward Clustering - Topology-first work package generation
 *
 * Algorithm:
 * 1. Find leafward clusters (files that can be safely removed together)
 * 2. Subdivide large clusters by similarity (within topological boundaries)
 * 3. Calculate impact score per cluster
 * 4. Order by impact (highest first)
 */

import * as path from 'path';

/** A file in the dependency graph */
export interface DepFile {
  relativePath: string;
  absolutePath: string;
  dependencies: string[];   // Files this imports (relative paths)
  dependents: string[];     // Files that import this (relative paths)
  content?: string;
  status: 'conflict' | 'clean' | 'same_change' | 'retail_only' | 'restaurant_only';
  linesChanged?: number;
}

/** A work package - a coherent set of files to migrate together */
export interface WorkPackage {
  id: number;
  name: string;
  files: string[];           // Relative paths
  impactScore: number;       // Higher = do this first
  unlockCount: number;       // Files that become migratable after this
  unlockFiles: string[];     // Sample of files unlocked
  totalLines: number;        // Effort estimate
  isLeafCluster: boolean;    // True if all files are leaves
  depth: number;             // 0 = leaves, higher = further from leaves
}

/** Result of leafward clustering */
export interface LeafwardClusteringResult {
  packages: WorkPackage[];
  totalFiles: number;
  totalPackages: number;
}

/**
 * Build leafward clusters from conflict files.
 *
 * Algorithm:
 * 1. Group files by directory (domain clusters)
 * 2. For each cluster, find the "leafward edge" - files with fewest unresolved deps
 * 3. Order clusters by: how many of their deps are already satisfied
 * 4. Within clusters, order files from leaves to roots
 *
 * @param files - Map of relativePath -> DepFile
 * @param conflictPaths - Array of conflict file relative paths
 * @param fileContents - Map of relativePath -> content (for TF-IDF subdivision)
 */
export function buildLeafwardClusters(
  files: Map<string, DepFile>,
  conflictPaths: string[],
  fileContents: Map<string, string>
): LeafwardClusteringResult {
  const conflictSet = new Set(conflictPaths);

  // Step 1: Build conflict-only subgraph
  const conflictDeps = new Map<string, string[]>();
  const conflictDependents = new Map<string, string[]>();

  for (const filePath of conflictPaths) {
    const file = files.get(filePath);
    if (!file) continue;

    const deps = file.dependencies.filter(d => conflictSet.has(d));
    const dependents = file.dependents.filter(d => conflictSet.has(d));

    conflictDeps.set(filePath, deps);
    conflictDependents.set(filePath, dependents);
  }

  // Step 2: Group by directory (domain clusters)
  const byDir = groupByDirectory(conflictPaths);

  // Step 3: For each directory cluster, compute metrics
  const rawPackages: WorkPackage[] = [];
  let pkgId = 0;

  for (const [dir, dirFiles] of byDir) {
    // If cluster is too large, subdivide
    const clusters = dirFiles.length > 15
      ? subdivideBySimilarity(dirFiles, fileContents, 12)
      : [dirFiles];

    for (const clusterFiles of clusters) {
      // Count external dependencies (deps outside this cluster)
      let externalDeps = 0;
      let internalDeps = 0;
      const clusterSet = new Set(clusterFiles);

      for (const file of clusterFiles) {
        const deps = conflictDeps.get(file) || [];
        for (const dep of deps) {
          if (clusterSet.has(dep)) {
            internalDeps++;
          } else {
            externalDeps++;
          }
        }
      }

      // Count how many files OUTSIDE this cluster depend on files INSIDE
      let externalDependents = 0;
      const unlockedFiles: string[] = [];

      for (const file of clusterFiles) {
        const dependents = conflictDependents.get(file) || [];
        for (const dep of dependents) {
          if (!clusterSet.has(dep)) {
            externalDependents++;
            if (!unlockedFiles.includes(dep)) {
              unlockedFiles.push(dep);
            }
          }
        }
      }

      // Find the "depth" of this cluster (max depth of any file in it)
      const waves = computeRemovalWaves(conflictPaths, conflictDeps, conflictDependents);
      const fileDepths = new Map<string, number>();
      waves.forEach((wave, depth) => {
        wave.forEach(f => fileDepths.set(f, depth));
      });

      const clusterDepths = clusterFiles.map(f => fileDepths.get(f) || 0);
      const minDepth = Math.min(...clusterDepths);
      const maxDepth = Math.max(...clusterDepths);

      // Impact score: files unlocked per line of effort
      // Higher = this cluster unblocks more work
      const totalLines = clusterFiles.length * 50; // Estimate
      const impactScore = totalLines > 0 ? unlockedFiles.length / (totalLines / 50) : 0;

      // Readiness score: how many external deps are already satisfied (0 = ready now)
      // Lower external deps = more ready to migrate
      const readinessScore = externalDeps;

      rawPackages.push({
        id: pkgId++,
        name: generatePackageName(clusterFiles, dir, minDepth),
        files: clusterFiles,
        impactScore: Math.round(impactScore * 1000) / 1000,
        unlockCount: unlockedFiles.length,
        unlockFiles: unlockedFiles.slice(0, 5),
        totalLines,
        isLeafCluster: minDepth === 0 && externalDeps === 0,
        depth: minDepth,
      });
    }
  }

  // Step 4: Sort by readiness (fewest external deps first), then by impact
  rawPackages.sort((a, b) => {
    // Primary: depth (lower = closer to leaves = do first)
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    // Secondary: impact score (higher first)
    return b.impactScore - a.impactScore;
  });

  // Re-assign IDs after sorting
  rawPackages.forEach((pkg, idx) => {
    pkg.id = idx;
  });

  return {
    packages: rawPackages,
    totalFiles: conflictPaths.length,
    totalPackages: rawPackages.length,
  };
}

/**
 * Compute removal waves - topological layers starting from TRUE leaves.
 *
 * TRUE LEAF = file with no dependencies (imports nothing)
 * These are foundational files: models, types, configs, constants
 *
 * Wave 0: True leaves (no dependencies)
 * Wave 1: Files whose only dependencies are in Wave 0
 * Wave N: Files whose only dependencies are in Waves 0..N-1
 *
 * This gives us a migration order from foundation → consumers
 */
function computeRemovalWaves(
  files: string[],
  deps: Map<string, string[]>,
  dependents: Map<string, string[]>
): string[][] {
  const waves: string[][] = [];
  const assigned = new Set<string>();
  const remaining = new Set(files);

  while (remaining.size > 0) {
    const wave: string[] = [];

    for (const file of remaining) {
      const fileDeps = deps.get(file) || [];

      // A file can be in this wave if ALL its dependencies are already assigned
      // (or it has no dependencies - true leaf)
      const allDepsAssigned = fileDeps.every(d => assigned.has(d) || !remaining.has(d));

      if (allDepsAssigned) {
        wave.push(file);
      }
    }

    if (wave.length === 0) {
      // Cycle detected - put remaining files in final wave
      waves.push(Array.from(remaining));
      break;
    }

    // Add wave and update tracking
    waves.push(wave);
    for (const f of wave) {
      assigned.add(f);
      remaining.delete(f);
    }
  }

  return waves;
}

/**
 * Group files by their parent directory.
 */
function groupByDirectory(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const dir = path.dirname(file);
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }

  return groups;
}

/**
 * Subdivide a group by TF-IDF similarity into smaller chunks.
 */
function subdivideBySimilarity(
  files: string[],
  fileContents: Map<string, string>,
  targetSize: number
): string[][] {
  if (files.length <= targetSize) {
    return [files];
  }

  // Simple approach: split by filename patterns
  // Group files with similar names (e.g., user-*.ts together)
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const basename = path.basename(file, '.ts');
    // Extract prefix (e.g., "user" from "user-profile.component")
    const prefix = basename.split(/[-._]/)[0];

    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(file);
  }

  // If still too large, split further
  const result: string[][] = [];
  for (const [_prefix, group] of groups) {
    if (group.length > targetSize) {
      // Split into chunks of targetSize
      for (let i = 0; i < group.length; i += targetSize) {
        result.push(group.slice(i, i + targetSize));
      }
    } else {
      result.push(group);
    }
  }

  return result;
}

/**
 * Compute how many files would be unlocked by completing this group.
 *
 * A file is "unlocked" (becomes migratable) if:
 * - It depends on files in this group
 * - After this group is done, all its dependencies are satisfied
 *
 * This tells us: "how many files can we migrate AFTER completing this package?"
 */
function computeUnlockCount(
  group: string[],
  dependents: Map<string, string[]>,
  deps: Map<string, string[]>,
  currentWaveFiles: Set<string>
): { unlockCount: number; unlockFiles: string[] } {
  const groupSet = new Set(group);
  const unlocked: string[] = [];

  // Find files that DEPEND ON this group (i.e., files that import files in this group)
  for (const file of group) {
    const fileDependents = dependents.get(file) || [];

    for (const dependent of fileDependents) {
      // Skip if already in current wave or already counted
      if (currentWaveFiles.has(dependent) || groupSet.has(dependent) || unlocked.includes(dependent)) {
        continue;
      }

      // Check if completing this group satisfies all the dependent's dependencies
      const dependentDeps = deps.get(dependent) || [];
      const unsatisfiedDeps = dependentDeps.filter(d =>
        !groupSet.has(d) && !currentWaveFiles.has(d)
      );

      // If all dependencies would be satisfied, this file is unlocked
      if (unsatisfiedDeps.length === 0) {
        unlocked.push(dependent);
      }
    }
  }

  return {
    unlockCount: unlocked.length,
    unlockFiles: unlocked,
  };
}

/**
 * Generate a human-readable name for a package.
 */
function generatePackageName(files: string[], dir: string, depth: number): string {
  const dirName = path.basename(dir) || 'root';

  // Find common patterns in filenames
  const basenames = files.map(f => path.basename(f, '.ts'));

  // Check for common suffixes
  const suffixes = ['component', 'service', 'module', 'guard', 'interceptor', 'model', 'state', 'api', 'utils'];
  for (const suffix of suffixes) {
    const matchCount = basenames.filter(b => b.includes(suffix)).length;
    if (matchCount > files.length / 2) {
      return `${dirName}-${suffix}s`;
    }
  }

  // Default: directory + wave indicator
  const waveLabel = depth === 0 ? 'foundation' : `layer-${depth}`;
  return `${dirName}-${waveLabel}`;
}
