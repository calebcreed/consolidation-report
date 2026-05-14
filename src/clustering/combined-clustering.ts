/**
 * Combined Clustering - Hybrid topological + content similarity clustering
 *
 * Combines dependency-based (Louvain) and content-based (TF-IDF) similarity
 * to create optimal work packages for migration.
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { DependencyGraph } from '../deps/graph';
import { buildTfIdfIndex, FileContent } from '../similarity';
import {
  buildCombinedSimilarityMatrix,
  buildFilePathMap,
  computeGroupCohesion,
  SimilarityMatrixOptions,
  DEFAULT_SIMILARITY_OPTIONS,
} from './similarity-matrix';
import {
  WorkPackage,
  CombinedClusteringOptions,
  CombinedClusteringResult,
  ClusteringQuality,
  CombinedTuningResult,
  CombinedTuningAttempt,
} from './types';

/** Default combined clustering options */
const DEFAULT_OPTIONS: Required<CombinedClusteringOptions> = {
  targetPackages: 20,
  minPackageSize: 5,
  maxPackageSize: 15,
  resolution: 1.0,
  autoTune: true,
  includeIsolated: true,
  topologicalWeight: 0.5,
  contentWeight: 0.2,
  pathWeight: 0.3,
  directDepBoost: 0.2,
  minSimilarity: 0.1,
};

/** Resolution values for grid search */
const RESOLUTION_GRID = [0.6, 0.8, 1.0, 1.2, 1.5];

/** Weight configurations for grid search [topo, content, path] */
const WEIGHT_CONFIGS = [
  // Original style (topo + content only)
  { topo: 0.7, content: 0.3, path: 0.0, directDep: 0.0 },
  // Balanced with path
  { topo: 0.4, content: 0.2, path: 0.4, directDep: 0.1 },
  { topo: 0.5, content: 0.2, path: 0.3, directDep: 0.2 },
  { topo: 0.5, content: 0.1, path: 0.4, directDep: 0.2 },
  // Path-heavy (same dir = likely same cluster)
  { topo: 0.3, content: 0.1, path: 0.6, directDep: 0.2 },
  // Topo-heavy with path assist
  { topo: 0.6, content: 0.1, path: 0.3, directDep: 0.3 },
];

/**
 * Cluster conflict files using combined topological + content similarity.
 *
 * @param depGraph - The dependency graph
 * @param conflictFiles - Array of conflict file relative paths
 * @param fileContents - Map of relativePath -> file content (for TF-IDF)
 * @param options - Combined clustering options
 * @returns CombinedClusteringResult
 */
export function clusterWithCombinedSimilarity(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  fileContents: Map<string, string>,
  options?: CombinedClusteringOptions
): CombinedClusteringResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle empty input
  if (conflictFiles.length === 0) {
    return createEmptyResult(opts);
  }

  // Build TF-IDF index
  const fileContentArray: FileContent[] = conflictFiles
    .filter(f => fileContents.has(f))
    .map(f => ({ relativePath: f, content: fileContents.get(f)! }));

  const tfidfIndex = buildTfIdfIndex(fileContentArray);

  // Build file path map for graph lookups
  const fileToAbsPath = buildFilePathMap(conflictFiles, depGraph);

  // Build combined similarity matrix with all weights
  const simMatrix = buildCombinedSimilarityMatrix(
    conflictFiles,
    depGraph,
    tfidfIndex,
    opts.topologicalWeight,
    fileToAbsPath,
    {
      topologicalWeight: opts.topologicalWeight,
      contentWeight: opts.contentWeight,
      pathWeight: opts.pathWeight,
      directDepBoost: opts.directDepBoost,
    }
  );

  // Create weighted graph
  const graph = createWeightedGraph(conflictFiles, simMatrix, opts.minSimilarity);

  // Run Louvain
  const communities = louvain(graph, {
    resolution: opts.resolution,
    randomWalk: false,
  });

  // Build work packages from communities
  let packages = buildWorkPackages(conflictFiles, communities, simMatrix, graph);

  // Identify isolated files (no edges in graph)
  let isolatedFiles = findIsolatedFiles(conflictFiles, graph);

  // Post-process: detect "false clusters" formed by path similarity
  // where ALL members have no real dependencies
  const { packages: realPackages, newIsolated } = detectFalseClusters(
    packages,
    depGraph,
    fileToAbsPath
  );
  packages = realPackages;
  isolatedFiles = [...new Set([...isolatedFiles, ...newIsolated])];

  // Compute quality metrics
  const quality = computeQualityMetrics(packages, simMatrix, conflictFiles);

  // Compute modularity estimate
  const modularity = computeModularity(graph, communities);

  return {
    packages,
    totalFiles: conflictFiles.length,
    packageCount: packages.length,
    modularity: Math.round(modularity * 1000) / 1000,
    resolution: opts.resolution,
    isolatedFiles,
    weights: {
      topological: opts.topologicalWeight,
      content: opts.contentWeight,
      path: opts.pathWeight,
      directDepBoost: opts.directDepBoost,
    },
    quality,
  };
}

/**
 * Auto-tune combined clustering parameters
 */
export function autoTuneCombinedClustering(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  fileContents: Map<string, string>,
  options?: CombinedClusteringOptions
): CombinedTuningResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allAttempts: CombinedTuningAttempt[] = [];

  let bestScore = -Infinity;
  let bestParams = { resolution: 1.0, topologicalWeight: 0.5 };
  let bestResult: CombinedClusteringResult | null = null;

  // Grid search over resolution and weight configs
  for (const resolution of RESOLUTION_GRID) {
    for (const weights of WEIGHT_CONFIGS) {
      const result = clusterWithCombinedSimilarity(
        depGraph,
        conflictFiles,
        fileContents,
        {
          ...opts,
          resolution,
          topologicalWeight: weights.topo,
          contentWeight: weights.content,
          pathWeight: weights.path,
          directDepBoost: weights.directDep,
          autoTune: false,
        }
      );

      const score = scoreClusteringResult(result, opts);

      allAttempts.push({
        resolution,
        topologicalWeight: weights.topo,
        packageCount: result.packageCount,
        modularity: result.modularity,
        score: Math.round(score * 100) / 100,
      });

      if (score > bestScore) {
        bestScore = score;
        bestParams = { resolution, topologicalWeight: weights.topo };
        bestResult = result;
      }
    }
  }

  return {
    bestParams,
    bestResult: bestResult!,
    allAttempts,
  };
}

/**
 * Create a weighted undirected graph from similarity matrix
 */
function createWeightedGraph(
  files: string[],
  simMatrix: number[][],
  minSimilarity: number
): Graph {
  const graph = new Graph({ type: 'undirected', allowSelfLoops: false });

  // Add all files as nodes
  for (const file of files) {
    graph.addNode(file);
  }

  // Add edges for files with similarity above threshold
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const sim = simMatrix[i][j];
      if (sim >= minSimilarity) {
        graph.addEdge(files[i], files[j], { weight: sim });
      }
    }
  }

  return graph;
}

/**
 * Build work packages from Louvain communities
 */
function buildWorkPackages(
  files: string[],
  communities: Record<string, number>,
  simMatrix: number[][],
  graph: Graph
): WorkPackage[] {
  // Group files by community
  const communityMap = new Map<number, string[]>();
  for (const file of files) {
    const community = communities[file];
    if (!communityMap.has(community)) {
      communityMap.set(community, []);
    }
    communityMap.get(community)!.push(file);
  }

  // Build file index map
  const fileIndexMap = new Map<string, number>();
  for (let i = 0; i < files.length; i++) {
    fileIndexMap.set(files[i], i);
  }

  // Create work packages
  const packages: WorkPackage[] = [];
  let pkgId = 0;

  for (const [_community, pkgFiles] of communityMap) {
    const { internalEdges, externalEdges } = countEdges(pkgFiles, graph, communities);
    const cohesion = computeGroupCohesion(pkgFiles, simMatrix, fileIndexMap);

    packages.push({
      id: pkgId++,
      files: pkgFiles,
      size: pkgFiles.length,
      internalEdges,
      externalEdges,
      cohesion: Math.round(cohesion * 100) / 100,
    });
  }

  // Sort by size descending
  packages.sort((a, b) => b.size - a.size);

  // Re-assign IDs after sorting
  packages.forEach((pkg, idx) => {
    pkg.id = idx;
  });

  return packages;
}

/**
 * Count internal and external edges for a package
 */
function countEdges(
  files: string[],
  graph: Graph,
  communities: Record<string, number>
): { internalEdges: number; externalEdges: number } {
  const fileSet = new Set(files);
  let internalEdges = 0;
  let externalEdges = 0;

  for (const file of files) {
    if (!graph.hasNode(file)) continue;

    graph.forEachEdge(file, (_edge, _attrs, source, target) => {
      const neighbor = source === file ? target : source;

      // Only count each edge once
      if (file < neighbor) {
        if (fileSet.has(neighbor)) {
          internalEdges++;
        } else {
          externalEdges++;
        }
      }
    });
  }

  return { internalEdges, externalEdges };
}

/**
 * Find files with no edges in the graph
 */
function findIsolatedFiles(files: string[], graph: Graph): string[] {
  return files.filter(file => {
    if (!graph.hasNode(file)) return true;
    return graph.degree(file) === 0;
  });
}

/**
 * Detect "false clusters" formed by path similarity where ALL members
 * have no real code dependencies (no imports, no importers).
 * These should be moved to isolatedFiles instead.
 */
function detectFalseClusters(
  packages: WorkPackage[],
  depGraph: DependencyGraph,
  fileToAbsPath: Map<string, string>
): { packages: WorkPackage[]; newIsolated: string[] } {
  const realPackages: WorkPackage[] = [];
  const newIsolated: string[] = [];

  for (const pkg of packages) {
    // Check if ALL files in this package have zero deps and zero dependents
    let allIsolated = true;

    for (const file of pkg.files) {
      const absPath = fileToAbsPath.get(file);
      if (!absPath) continue;

      const analysis = depGraph.getAnalysis(absPath);
      const dependents = depGraph.getDependents(absPath);

      // Count real dependencies (not external/unresolved)
      const realDeps = analysis?.dependencies.filter(
        d => !d.target.startsWith('external:') && !d.target.startsWith('unresolved:')
      ) || [];

      if (realDeps.length > 0 || dependents.length > 0) {
        allIsolated = false;
        break;
      }
    }

    if (allIsolated && pkg.files.length > 1) {
      // This cluster has no real dependencies - split into isolated
      newIsolated.push(...pkg.files);
    } else {
      realPackages.push(pkg);
    }
  }

  return { packages: realPackages, newIsolated };
}

/**
 * Compute quality metrics for clustering result
 */
function computeQualityMetrics(
  packages: WorkPackage[],
  simMatrix: number[][],
  files: string[]
): ClusteringQuality {
  // Build file index map
  const fileIndexMap = new Map<string, number>();
  for (let i = 0; i < files.length; i++) {
    fileIndexMap.set(files[i], i);
  }

  // Average cohesion
  let totalCohesion = 0;
  for (const pkg of packages) {
    totalCohesion += pkg.cohesion;
  }
  const avgCohesion = packages.length > 0 ? totalCohesion / packages.length : 0;

  // Average content similarity (same as cohesion in combined approach)
  const avgContentSimilarity = avgCohesion;

  // Isolated file count
  let isolatedCount = 0;
  for (const pkg of packages) {
    if (pkg.size === 1) isolatedCount++;
  }

  // Average cross-coupling
  let totalExternal = 0;
  for (const pkg of packages) {
    totalExternal += pkg.externalEdges;
  }
  const avgCrossCoupling = packages.length > 0 ? totalExternal / packages.length : 0;

  return {
    avgCohesion: Math.round(avgCohesion * 100) / 100,
    avgContentSimilarity: Math.round(avgContentSimilarity * 100) / 100,
    isolatedFileCount: isolatedCount,
    avgCrossCoupling: Math.round(avgCrossCoupling * 100) / 100,
  };
}

/**
 * Compute modularity estimate
 */
function computeModularity(
  graph: Graph,
  communities: Record<string, number>
): number {
  if (graph.size === 0) return 0;

  let internalEdges = 0;
  let totalEdges = 0;

  graph.forEachEdge((_edge, _attrs, source, target) => {
    totalEdges++;
    if (communities[source] === communities[target]) {
      internalEdges++;
    }
  });

  return totalEdges > 0 ? internalEdges / totalEdges : 0;
}

/**
 * Score a clustering result for tuning
 */
function scoreClusteringResult(
  result: CombinedClusteringResult,
  options: Required<CombinedClusteringOptions>
): number {
  const { targetPackages, minPackageSize, maxPackageSize } = options;

  // 1. Package count score (max 10)
  const countDev = Math.abs(result.packageCount - targetPackages);
  const countScore = Math.max(0, 10 - countDev);

  // 2. Size distribution score (max 10)
  let goodSizeCount = 0;
  for (const pkg of result.packages) {
    if (pkg.size >= minPackageSize && pkg.size <= maxPackageSize) {
      goodSizeCount++;
    }
  }
  const sizeScore = result.packageCount > 0
    ? (goodSizeCount / result.packageCount) * 10
    : 0;

  // 3. Cohesion score (max 5)
  const cohesionScore = result.quality.avgCohesion * 5;

  // 4. Modularity bonus (max 5)
  const modularityScore = result.modularity * 5;

  // 5. Penalty for isolated files
  const isolatedPenalty = result.quality.isolatedFileCount * 0.5;

  // 6. Penalty for extreme package counts
  let extremePenalty = 0;
  if (result.packageCount < 3) extremePenalty = 10;
  else if (result.packageCount > result.totalFiles / 2) extremePenalty = 5;

  return countScore + sizeScore + cohesionScore + modularityScore - isolatedPenalty - extremePenalty;
}

/**
 * Create empty result for edge case
 */
function createEmptyResult(opts: Required<CombinedClusteringOptions>): CombinedClusteringResult {
  return {
    packages: [],
    totalFiles: 0,
    packageCount: 0,
    modularity: 0,
    resolution: opts.resolution,
    isolatedFiles: [],
    weights: {
      topological: opts.topologicalWeight,
      content: opts.contentWeight,
      path: opts.pathWeight,
      directDepBoost: opts.directDepBoost,
    },
    quality: {
      avgCohesion: 0,
      avgContentSimilarity: 0,
      isolatedFileCount: 0,
      avgCrossCoupling: 0,
    },
  };
}
