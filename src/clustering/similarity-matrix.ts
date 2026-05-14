/**
 * Similarity Matrix - Unified similarity computation
 *
 * Combines topological (dependency-based), content (TF-IDF), and path similarity
 * into a single weighted similarity matrix for clustering.
 */

import * as path from 'path';
import { DependencyGraph } from '../deps/graph';
import { TfIdfIndex, buildTfIdfIndex, computeSimilarity as computeTfIdfSimilarity } from '../similarity';

/**
 * Compute path/directory similarity between two files.
 *
 * Files in the same directory get highest score (1.0).
 * Files sharing parent directories get partial credit.
 */
export function computePathSimilarity(fileA: string, fileB: string): number {
  const dirA = path.dirname(fileA);
  const dirB = path.dirname(fileB);

  // Same directory = perfect match
  if (dirA === dirB) return 1.0;

  // Check for shared parent components
  const partsA = dirA.split('/').filter(p => p);
  const partsB = dirB.split('/').filter(p => p);

  let shared = 0;
  const minLen = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < minLen; i++) {
    if (partsA[i] === partsB[i]) shared++;
    else break;
  }

  // Partial credit for shared ancestry
  const maxLen = Math.max(partsA.length, partsB.length);
  return maxLen > 0 ? shared / maxLen * 0.5 : 0;
}

/**
 * Check if fileA directly imports fileB (or vice versa).
 * Returns 1.0 if direct dependency exists, 0 otherwise.
 */
export function hasDirectDependency(
  fileA: string,
  fileB: string,
  depGraph: DependencyGraph,
  fileToAbsPath: Map<string, string>
): boolean {
  const absPathA = fileToAbsPath.get(fileA);
  const absPathB = fileToAbsPath.get(fileB);

  if (!absPathA || !absPathB) return false;

  const analysisA = depGraph.getAnalysis(absPathA);
  const analysisB = depGraph.getAnalysis(absPathB);

  // Check if A imports B
  if (analysisA) {
    for (const dep of analysisA.dependencies) {
      if (dep.target === absPathB) return true;
    }
  }

  // Check if B imports A
  if (analysisB) {
    for (const dep of analysisB.dependencies) {
      if (dep.target === absPathA) return true;
    }
  }

  return false;
}

/**
 * Compute Jaccard similarity between two files based on dependencies.
 *
 * Considers both:
 * - Dependencies (files that A and B import)
 * - Dependents (files that import A or B)
 *
 * Jaccard(A, B) = |deps(A) ∩ deps(B)| / |deps(A) ∪ deps(B)|
 */
export function computeTopologicalSimilarity(
  fileA: string,
  fileB: string,
  depGraph: DependencyGraph,
  fileToAbsPath: Map<string, string>
): number {
  const absPathA = fileToAbsPath.get(fileA);
  const absPathB = fileToAbsPath.get(fileB);

  if (!absPathA || !absPathB) return 0;

  // Get dependencies for both files
  const depsA = new Set<string>();
  const depsB = new Set<string>();

  const analysisA = depGraph.getAnalysis(absPathA);
  const analysisB = depGraph.getAnalysis(absPathB);

  if (analysisA) {
    for (const dep of analysisA.dependencies) {
      if (!dep.target.startsWith('external:') && !dep.target.startsWith('unresolved:')) {
        depsA.add(dep.target);
      }
    }
  }

  if (analysisB) {
    for (const dep of analysisB.dependencies) {
      if (!dep.target.startsWith('external:') && !dep.target.startsWith('unresolved:')) {
        depsB.add(dep.target);
      }
    }
  }

  // Also consider dependents (files that import A or B)
  for (const dep of depGraph.getDependents(absPathA)) {
    depsA.add(dep.source);
  }
  for (const dep of depGraph.getDependents(absPathB)) {
    depsB.add(dep.source);
  }

  // Compute Jaccard similarity
  if (depsA.size === 0 && depsB.size === 0) return 0;

  let intersection = 0;
  for (const dep of depsA) {
    if (depsB.has(dep)) intersection++;
  }

  const union = depsA.size + depsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Options for building combined similarity matrix */
export interface SimilarityMatrixOptions {
  topologicalWeight: number;
  contentWeight: number;
  pathWeight: number;
  directDepBoost: number;  // Bonus for direct imports
}

/** Default similarity weights (must sum to ~1 before boost) */
export const DEFAULT_SIMILARITY_OPTIONS: SimilarityMatrixOptions = {
  topologicalWeight: 0.5,
  contentWeight: 0.2,
  pathWeight: 0.3,
  directDepBoost: 0.2,  // Added on top of combined
};

/**
 * Build a combined similarity matrix.
 *
 * @param conflictFiles - Array of relative file paths
 * @param depGraph - The dependency graph
 * @param tfidfIndex - Pre-built TF-IDF index
 * @param topologicalWeight - Weight for topological similarity (legacy, used if options not provided)
 * @param fileToAbsPath - Map from relative path to absolute path
 * @param options - Full similarity options (overrides topologicalWeight if provided)
 * @returns 2D similarity matrix where matrix[i][j] is combined similarity
 */
export function buildCombinedSimilarityMatrix(
  conflictFiles: string[],
  depGraph: DependencyGraph,
  tfidfIndex: TfIdfIndex,
  topologicalWeight: number,
  fileToAbsPath: Map<string, string>,
  options?: Partial<SimilarityMatrixOptions>
): number[][] {
  const n = conflictFiles.length;

  // Use options if provided, otherwise fall back to legacy behavior
  const opts: SimilarityMatrixOptions = options
    ? { ...DEFAULT_SIMILARITY_OPTIONS, ...options }
    : {
        topologicalWeight,
        contentWeight: 1 - topologicalWeight,
        pathWeight: 0,
        directDepBoost: 0,
      };

  // Build file index map for TF-IDF lookups
  const fileIndexMap = new Map<string, number>();
  for (let i = 0; i < tfidfIndex.filePaths.length; i++) {
    fileIndexMap.set(tfidfIndex.filePaths[i], i);
  }

  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(1.0);
      } else if (j < i) {
        // Matrix is symmetric
        row.push(matrix[j][i]);
      } else {
        // Compute topological similarity (Jaccard on deps/dependents)
        const topoSim = computeTopologicalSimilarity(
          conflictFiles[i],
          conflictFiles[j],
          depGraph,
          fileToAbsPath
        );

        // Compute TF-IDF content similarity
        const idxA = fileIndexMap.get(conflictFiles[i]);
        const idxB = fileIndexMap.get(conflictFiles[j]);
        const tfidfSim = (idxA !== undefined && idxB !== undefined)
          ? computeTfIdfSimilarity(idxA, idxB, tfidfIndex)
          : 0;

        // Compute path similarity (same directory = 1.0)
        const pathSim = computePathSimilarity(conflictFiles[i], conflictFiles[j]);

        // Check for direct dependency
        const hasDirect = hasDirectDependency(
          conflictFiles[i],
          conflictFiles[j],
          depGraph,
          fileToAbsPath
        );

        // Combined weighted similarity
        let combined =
          opts.topologicalWeight * topoSim +
          opts.contentWeight * tfidfSim +
          opts.pathWeight * pathSim;

        // Add direct dependency boost
        if (hasDirect) {
          combined = Math.min(1.0, combined + opts.directDepBoost);
        }

        row.push(Math.round(combined * 1000) / 1000);
      }
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Build a map from relative path to absolute path for graph lookups
 */
export function buildFilePathMap(
  conflictFiles: string[],
  depGraph: DependencyGraph
): Map<string, string> {
  const map = new Map<string, string>();

  for (const absPath of depGraph.getFiles()) {
    const analysis = depGraph.getAnalysis(absPath);
    if (analysis && conflictFiles.includes(analysis.relativePath)) {
      map.set(analysis.relativePath, absPath);
    }
  }

  return map;
}

/**
 * Compute average similarity within a set of files
 */
export function computeGroupCohesion(
  files: string[],
  matrix: number[][],
  fileIndexMap: Map<string, number>
): number {
  if (files.length < 2) return 1.0;

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const idxA = fileIndexMap.get(files[i]);
      const idxB = fileIndexMap.get(files[j]);
      if (idxA !== undefined && idxB !== undefined) {
        totalSim += matrix[idxA][idxB];
        pairs++;
      }
    }
  }

  return pairs > 0 ? totalSim / pairs : 0;
}
