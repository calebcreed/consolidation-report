/**
 * Community Detection - Core Louvain algorithm integration
 *
 * Clusters conflict files into work packages using the Louvain
 * community detection algorithm via graphology.
 */

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { DependencyGraph } from '../deps/graph';
import { toGraphologyGraph, getIsolatedNodes } from './graph-converter';
import {
  WorkPackage,
  ClusteringResult,
  ClusteringOptions,
} from './types';

/** Default clustering options */
const DEFAULT_OPTIONS: Required<ClusteringOptions> = {
  targetPackages: 20,
  minPackageSize: 5,
  maxPackageSize: 15,
  resolution: 1.0,
  autoTune: true,
  includeIsolated: true,
};

/**
 * Cluster conflict files into work packages using Louvain community detection.
 *
 * @param depGraph - The dependency graph
 * @param conflictFiles - Array of conflict file relative paths
 * @param options - Clustering options
 * @returns ClusteringResult with work packages
 *
 * @example
 * ```typescript
 * const result = clusterIntoWorkPackages(graph, conflicts, {
 *   targetPackages: 20,
 *   minPackageSize: 5,
 *   maxPackageSize: 15,
 * });
 * ```
 */
export function clusterIntoWorkPackages(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  options?: ClusteringOptions
): ClusteringResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle empty input
  if (conflictFiles.length === 0) {
    return {
      packages: [],
      totalFiles: 0,
      packageCount: 0,
      modularity: 0,
      resolution: opts.resolution,
      isolatedFiles: [],
    };
  }

  // Convert to graphology graph
  const graph = toGraphologyGraph(depGraph, conflictFiles);

  // Get isolated nodes before clustering
  const isolatedFiles = getIsolatedNodes(graph);

  // Run Louvain with specified resolution
  const communities = louvain(graph, {
    resolution: opts.resolution,
    randomWalk: false, // Deterministic
  });

  // Calculate modularity estimate based on internal vs external edges
  // (graphology-metrics/modularity could be used for exact calculation)
  const modularity = calculateModularityEstimate(graph, communities);

  // Group files by community
  const communityMap = new Map<number, string[]>();
  graph.forEachNode((node) => {
    const community = communities[node];
    if (!communityMap.has(community)) {
      communityMap.set(community, []);
    }
    communityMap.get(community)!.push(node);
  });

  // Build work packages
  const packages: WorkPackage[] = [];
  let pkgId = 0;

  for (const [_community, files] of communityMap.entries()) {
    // Calculate internal and external edges
    const { internalEdges, externalEdges } = countEdges(graph, files, communities);

    const cohesion = internalEdges + externalEdges > 0
      ? internalEdges / (internalEdges + externalEdges)
      : 0;

    packages.push({
      id: pkgId++,
      files,
      size: files.length,
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

  // Handle isolated files
  let finalIsolated = isolatedFiles;
  if (opts.includeIsolated && isolatedFiles.length > 0) {
    // Isolated files are already in their own communities from Louvain
    // Just track them for reporting
    finalIsolated = isolatedFiles;
  }

  return {
    packages,
    totalFiles: conflictFiles.length,
    packageCount: packages.length,
    modularity: Math.round(modularity * 1000) / 1000,
    resolution: opts.resolution,
    isolatedFiles: finalIsolated,
  };
}

/**
 * Count internal and external edges for a set of files
 */
function countEdges(
  graph: Graph,
  files: string[],
  communities: Record<string, number>
): { internalEdges: number; externalEdges: number } {
  const fileSet = new Set(files);
  let internalEdges = 0;
  let externalEdges = 0;

  for (const file of files) {
    graph.forEachEdge(file, (_edge, _attrs, source, target) => {
      const neighbor = source === file ? target : source;

      // Only count each edge once (for the node that's lexicographically smaller)
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
 * Calculate modularity estimate based on internal vs external edge ratio
 * Modularity Q = (internal edges - expected internal edges) / total edges
 * Simplified: we estimate as ratio of internal edges to total edges
 */
function calculateModularityEstimate(
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

  if (totalEdges === 0) return 0;

  // Simplified modularity: ratio of internal edges
  // Real modularity also considers expected edges, but this is a good proxy
  return internalEdges / totalEdges;
}

/**
 * Run Louvain with a specific resolution and return basic stats
 * (Used by resolution tuner)
 */
export function runLouvainWithResolution(
  graph: Graph,
  resolution: number
): { communities: Record<string, number>; modularity: number; packageCount: number } {
  const communities = louvain(graph, {
    resolution,
    randomWalk: false,
  });

  const modularity = calculateModularityEstimate(graph, communities);

  // Count unique communities
  const uniqueCommunities = new Set(Object.values(communities));

  return {
    communities,
    modularity,
    packageCount: uniqueCommunities.size,
  };
}
