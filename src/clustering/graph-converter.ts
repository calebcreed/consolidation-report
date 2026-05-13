/**
 * Graph Converter - Converts DependencyGraph to graphology Graph
 *
 * Filters the dependency graph to only include conflict files and
 * edges between them, suitable for community detection.
 */

import Graph from 'graphology';
import { DependencyGraph } from '../deps/graph';

/**
 * Prefixes to exclude from edge targets (not real file dependencies)
 */
const EXCLUDED_PREFIXES = [
  'external:',
  'unresolved:',
  'symbol:',
  'selector:',
  'pipe:',
  'directive:',
  'component:',
  'ngrx-',
];

/**
 * Check if a dependency target should be excluded
 */
function isExcludedTarget(target: string): boolean {
  return EXCLUDED_PREFIXES.some(prefix => target.startsWith(prefix));
}

/**
 * Converts a DependencyGraph to a graphology Graph, filtering to only
 * include the specified conflict files and edges between them.
 *
 * @param depGraph - The full dependency graph
 * @param conflictFiles - Array of file paths to include (relative paths)
 * @returns An undirected graphology Graph
 */
export function toGraphologyGraph(
  depGraph: DependencyGraph,
  conflictFiles: string[]
): Graph {
  // Create undirected graph for community detection
  const graph = new Graph({ type: 'undirected', allowSelfLoops: false });

  // Create a set for O(1) lookup
  const conflictSet = new Set(conflictFiles);

  // Add all conflict files as nodes
  for (const file of conflictFiles) {
    if (!graph.hasNode(file)) {
      graph.addNode(file);
    }
  }

  // Add edges between conflict files
  for (const file of conflictFiles) {
    // Get dependencies from the original graph
    // We need to find the absolute path first
    const analysis = findAnalysisByRelativePath(depGraph, file);
    if (!analysis) continue;

    for (const dep of analysis.dependencies) {
      // Skip excluded targets
      if (isExcludedTarget(dep.target)) continue;

      // Get the relative path of the target
      const targetAnalysis = depGraph.getAnalysis(dep.target);
      const targetRelPath = targetAnalysis?.relativePath;

      // Only add edge if target is also a conflict file
      if (targetRelPath && conflictSet.has(targetRelPath)) {
        // Avoid duplicate edges and self-loops
        if (file !== targetRelPath && !graph.hasEdge(file, targetRelPath)) {
          graph.addEdge(file, targetRelPath);
        }
      }
    }
  }

  return graph;
}

/**
 * Find file analysis by relative path
 * (DependencyGraph keys might be absolute paths)
 */
function findAnalysisByRelativePath(
  depGraph: DependencyGraph,
  relativePath: string
): ReturnType<DependencyGraph['getAnalysis']> {
  // Try direct lookup first (in case relative paths are used as keys)
  const direct = depGraph.getAnalysis(relativePath);
  if (direct) return direct;

  // Search through all files
  for (const absPath of depGraph.getFiles()) {
    const analysis = depGraph.getAnalysis(absPath);
    if (analysis && analysis.relativePath === relativePath) {
      return analysis;
    }
  }

  return undefined;
}

/**
 * Get isolated nodes (nodes with no edges to other conflict files)
 */
export function getIsolatedNodes(graph: Graph): string[] {
  const isolated: string[] = [];

  graph.forEachNode((node) => {
    if (graph.degree(node) === 0) {
      isolated.push(node);
    }
  });

  return isolated;
}

/**
 * Get graph statistics for debugging
 */
export function getGraphStats(graph: Graph): {
  nodeCount: number;
  edgeCount: number;
  isolatedCount: number;
  avgDegree: number;
} {
  const nodeCount = graph.order;
  const edgeCount = graph.size;
  const isolated = getIsolatedNodes(graph);
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

  return {
    nodeCount,
    edgeCount,
    isolatedCount: isolated.length,
    avgDegree: Math.round(avgDegree * 100) / 100,
  };
}
