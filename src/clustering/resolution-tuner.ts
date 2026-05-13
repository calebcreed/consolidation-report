/**
 * Resolution Tuner - Auto-tune Louvain resolution parameter
 *
 * Searches for the optimal resolution parameter that produces
 * the target number of packages with good size distribution.
 */

import { DependencyGraph } from '../deps/graph';
import { toGraphologyGraph } from './graph-converter';
import { clusterIntoWorkPackages, runLouvainWithResolution } from './community-detection';
import {
  ClusteringResult,
  TuningResult,
  TuningAttempt,
} from './types';

/** Resolution values to try during grid search */
const RESOLUTION_GRID = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5];

/** Default tuning parameters */
const DEFAULT_TARGET_PACKAGES = 20;
const DEFAULT_MIN_SIZE = 5;
const DEFAULT_MAX_SIZE = 15;

/**
 * Find the optimal resolution parameter for the target cluster configuration.
 *
 * Uses grid search over resolution values, scoring each result based on:
 * - Distance from target package count
 * - Package size distribution
 * - Modularity score
 *
 * @param depGraph - The dependency graph
 * @param conflictFiles - Array of conflict file paths
 * @param targetPackages - Target number of packages (default: 20)
 * @param minPackageSize - Minimum files per package (default: 5)
 * @param maxPackageSize - Maximum files per package (default: 15)
 * @returns TuningResult with optimal resolution and all attempts
 */
export function findOptimalResolution(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  targetPackages: number = DEFAULT_TARGET_PACKAGES,
  minPackageSize: number = DEFAULT_MIN_SIZE,
  maxPackageSize: number = DEFAULT_MAX_SIZE
): TuningResult {
  // Convert to graphology once
  const graph = toGraphologyGraph(depGraph, conflictFiles);

  const attempts: TuningAttempt[] = [];
  let bestAttempt: TuningAttempt | null = null;
  let bestScore = -Infinity;

  // Grid search over resolutions
  for (const resolution of RESOLUTION_GRID) {
    const { modularity, packageCount } = runLouvainWithResolution(graph, resolution);

    const score = scoreClusteringAttempt(
      packageCount,
      modularity,
      targetPackages,
      conflictFiles.length,
      minPackageSize,
      maxPackageSize
    );

    const attempt: TuningAttempt = {
      resolution,
      packageCount,
      modularity: Math.round(modularity * 1000) / 1000,
      score: Math.round(score * 100) / 100,
    };

    attempts.push(attempt);

    if (score > bestScore) {
      bestScore = score;
      bestAttempt = attempt;
    }
  }

  // Get full clustering result with best resolution
  const bestResolution = bestAttempt?.resolution ?? 1.0;
  const result = clusterIntoWorkPackages(depGraph, conflictFiles, {
    resolution: bestResolution,
    autoTune: false,
  });

  return {
    resolution: bestResolution,
    result,
    attempts,
  };
}

/**
 * Score a clustering attempt based on multiple factors
 */
function scoreClusteringAttempt(
  packageCount: number,
  modularity: number,
  targetPackages: number,
  totalFiles: number,
  minSize: number,
  maxSize: number
): number {
  // 1. Package count score: penalty for deviation from target
  //    Max score: 10 points, loses 1 point per package away from target
  const countDeviation = Math.abs(packageCount - targetPackages);
  const countScore = Math.max(0, 10 - countDeviation);

  // 2. Average size score: reward if avg size is in optimal range
  //    Max score: 5 points
  const avgSize = totalFiles / Math.max(1, packageCount);
  let sizeScore = 0;
  if (avgSize >= minSize && avgSize <= maxSize) {
    sizeScore = 5;
  } else if (avgSize < minSize) {
    // Too small - packages are too fragmented
    sizeScore = Math.max(0, 5 - (minSize - avgSize));
  } else {
    // Too large - packages are too big
    sizeScore = Math.max(0, 5 - (avgSize - maxSize) * 0.5);
  }

  // 3. Modularity bonus: higher is better (0-1 range)
  //    Max score: 5 points
  const modularityScore = modularity * 5;

  // 4. Penalty for extreme package counts
  let extremePenalty = 0;
  if (packageCount < 3) {
    extremePenalty = -10; // Way too few packages
  } else if (packageCount > totalFiles / 2) {
    extremePenalty = -5; // Too many tiny packages
  }

  return countScore + sizeScore + modularityScore + extremePenalty;
}

/**
 * Estimate optimal resolution for a given target package count
 * Based on empirical observations:
 * - resolution 0.5 → ~10 packages
 * - resolution 1.0 → ~20 packages
 * - resolution 2.0 → ~40 packages
 *
 * Rough formula: packages ≈ 10 + (resolution - 0.5) * 20
 * Inverse: resolution ≈ (packages - 10) / 20 + 0.5
 */
export function estimateResolution(targetPackages: number): number {
  const estimated = (targetPackages - 10) / 20 + 0.5;
  // Clamp to reasonable range
  return Math.max(0.3, Math.min(3.0, estimated));
}

/**
 * Refine resolution with binary search around an initial estimate
 */
export function refineResolution(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  targetPackages: number,
  initialEstimate: number,
  tolerance: number = 2
): { resolution: number; packageCount: number } {
  const graph = toGraphologyGraph(depGraph, conflictFiles);

  let low = Math.max(0.3, initialEstimate - 0.5);
  let high = Math.min(3.0, initialEstimate + 0.5);
  let bestResolution = initialEstimate;
  let bestDiff = Infinity;
  let bestCount = 0;

  // Binary search with limited iterations
  for (let i = 0; i < 10; i++) {
    const mid = (low + high) / 2;
    const { packageCount } = runLouvainWithResolution(graph, mid);

    const diff = Math.abs(packageCount - targetPackages);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestResolution = mid;
      bestCount = packageCount;
    }

    if (diff <= tolerance) {
      break; // Good enough
    }

    if (packageCount < targetPackages) {
      low = mid; // Need more packages → higher resolution
    } else {
      high = mid; // Need fewer packages → lower resolution
    }
  }

  return {
    resolution: Math.round(bestResolution * 100) / 100,
    packageCount: bestCount,
  };
}
