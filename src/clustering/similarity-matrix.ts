/**
 * Similarity Matrix - Unified similarity computation
 *
 * Combines topological (dependency-based) and content (TF-IDF) similarity
 * into a single weighted similarity matrix for clustering.
 */

import { DependencyGraph } from '../deps/graph';
import { TfIdfIndex, buildTfIdfIndex, computeSimilarity as computeTfIdfSimilarity } from '../similarity';

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

/**
 * Build a combined similarity matrix.
 *
 * @param conflictFiles - Array of relative file paths
 * @param depGraph - The dependency graph
 * @param tfidfIndex - Pre-built TF-IDF index
 * @param topologicalWeight - Weight for topological similarity (0-1)
 * @param fileToAbsPath - Map from relative path to absolute path
 * @returns 2D similarity matrix where matrix[i][j] is combined similarity
 */
export function buildCombinedSimilarityMatrix(
  conflictFiles: string[],
  depGraph: DependencyGraph,
  tfidfIndex: TfIdfIndex,
  topologicalWeight: number,
  fileToAbsPath: Map<string, string>
): number[][] {
  const n = conflictFiles.length;
  const contentWeight = 1 - topologicalWeight;

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
        // Compute topological similarity
        const topoSim = computeTopologicalSimilarity(
          conflictFiles[i],
          conflictFiles[j],
          depGraph,
          fileToAbsPath
        );

        // Compute TF-IDF similarity
        const idxA = fileIndexMap.get(conflictFiles[i]);
        const idxB = fileIndexMap.get(conflictFiles[j]);
        const tfidfSim = (idxA !== undefined && idxB !== undefined)
          ? computeTfIdfSimilarity(idxA, idxB, tfidfIndex)
          : 0;

        // Combined weighted similarity
        const combined = topologicalWeight * topoSim + contentWeight * tfidfSim;
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
