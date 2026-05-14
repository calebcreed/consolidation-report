/**
 * Server Clustering - Wrapper for clustering with WebSocket progress events
 *
 * Provides real-time progress updates during clustering for UI animation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { StateManager, ClusterState, WorkPackageState } from './state';
import { WebSocketManager } from './server-websocket';
import { clusterWithCombinedSimilarity } from '../clustering/combined-clustering';
import { DependencyGraph } from '../deps/graph';

export interface ClusteringProgressEvent {
  type: 'init' | 'reading-files' | 'building-graph' | 'running-louvain' | 'community-assigned' | 'complete';
  message: string;
  data?: any;
}

/**
 * Run clustering with progress events streamed via WebSocket.
 */
export async function runClusteringWithProgress(
  stateManager: StateManager,
  wsManager: WebSocketManager,
  options?: { resolution?: number; topologicalWeight?: number }
): Promise<ClusterState> {
  const config = stateManager.getConfig();
  const report = stateManager.getReport();

  if (!config) {
    throw new Error('No config set. Configure project path first.');
  }

  if (!report) {
    throw new Error('No report available. Run analysis first.');
  }

  // Get conflict files
  const conflictFiles = report.files
    .filter(f => f.status === 'conflict')
    .map(f => f.relativePath);

  if (conflictFiles.length === 0) {
    throw new Error('No conflict files to cluster. Run analysis first.');
  }

  // Broadcast start
  wsManager.broadcast({
    type: 'cluster-start',
    data: { fileCount: conflictFiles.length },
  });

  // Progress: init
  broadcastProgress(wsManager, {
    type: 'init',
    message: `Starting clustering for ${conflictFiles.length} conflict files...`,
    data: { files: conflictFiles },
  });

  // Read file contents for TF-IDF
  broadcastProgress(wsManager, {
    type: 'reading-files',
    message: 'Reading file contents for similarity analysis...',
  });

  const fileContents = new Map<string, string>();
  const restaurantBasePath = path.join(config.projectPath, 'apps', 'restaurant');

  for (const relPath of conflictFiles) {
    const fullPath = path.join(restaurantBasePath, relPath);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        fileContents.set(relPath, content);
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  // Build dependency graph (re-use from report if available)
  broadcastProgress(wsManager, {
    type: 'building-graph',
    message: 'Building dependency graph...',
  });

  // Create a minimal DependencyGraph from the report's file data
  const depGraph = buildDepGraphFromReport(report, config);

  // Run Louvain clustering
  broadcastProgress(wsManager, {
    type: 'running-louvain',
    message: 'Running Louvain community detection...',
  });

  const resolution = options?.resolution ?? 1.0;
  const topologicalWeight = options?.topologicalWeight ?? 0.6;

  const result = clusterWithCombinedSimilarity(
    depGraph,
    conflictFiles,
    fileContents,
    {
      resolution,
      topologicalWeight,
      autoTune: false,
    }
  );

  // Broadcast community assignments for animation
  // Simulate progressive assignment for smoother animation
  const communityMap = new Map<number, string[]>();
  for (const pkg of result.packages) {
    communityMap.set(pkg.id, pkg.files);
  }

  // Send community assignments in batches for animation
  let assignedCount = 0;
  for (const [communityId, files] of communityMap) {
    broadcastProgress(wsManager, {
      type: 'community-assigned',
      message: `Community ${communityId}: ${files.length} files`,
      data: {
        communityId,
        files,
        color: getCommunityColor(communityId),
      },
    });
    assignedCount += files.length;

    // Small delay for animation effect (simulated - actual delay happens client-side)
  }

  // Build cluster state
  // Filter out single-file packages - they're not real clusters, move them to unassigned
  const realPackages = result.packages.filter(pkg => pkg.files.length > 1);
  const singletonFiles = result.packages
    .filter(pkg => pkg.files.length === 1)
    .flatMap(pkg => pkg.files);

  const packages: WorkPackageState[] = realPackages.map((pkg, idx) => ({
    id: idx, // Re-index since we filtered
    name: generateClusterName(pkg.files, idx),
    files: pkg.files,
    cohesion: pkg.cohesion,
    internalEdges: pkg.internalEdges,
    externalEdges: pkg.externalEdges,
  }));

  // Unassigned = isolated files + singleton packages (deduplicated)
  const unassignedSet = new Set([...result.isolatedFiles, ...singletonFiles]);

  const clusterState: ClusterState = {
    packages,
    unassignedFiles: Array.from(unassignedSet),
    runAt: new Date().toISOString(),
    params: { resolution, topologicalWeight },
  };

  // Save to state
  stateManager.setClusters(clusterState);

  // Broadcast complete
  broadcastProgress(wsManager, {
    type: 'complete',
    message: `Clustering complete: ${packages.length} clusters, ${result.isolatedFiles.length} unassigned`,
  });

  wsManager.broadcast({
    type: 'cluster-complete',
    data: clusterState,
  });

  return clusterState;
}

function broadcastProgress(wsManager: WebSocketManager, event: ClusteringProgressEvent): void {
  wsManager.broadcast({
    type: 'cluster-progress',
    data: event,
  });
  wsManager.output(event.message);
}

/**
 * Build a minimal dependency graph from report data
 */
function buildDepGraphFromReport(report: any, config: any): DependencyGraph {
  // Create a minimal DependencyGraph interface for clustering
  // The clustering only needs to look up dependencies between files
  const depMap = new Map<string, string[]>();
  const reverseDepMap = new Map<string, string[]>();
  const fileAnalysisMap = new Map<string, any>();

  const basePath = config.projectPath + '/apps/restaurant/';

  for (const file of report.files) {
    const relPath = file.relativePath;
    const absPath = basePath + relPath;

    depMap.set(relPath, file.dependencies || []);

    // Store analysis data
    fileAnalysisMap.set(absPath, {
      relativePath: relPath,
      absolutePath: absPath,
      dependencies: (file.dependencies || []).map((dep: string) => ({
        target: basePath + dep,
        source: absPath,
      })),
    });

    // Build reverse map
    for (const dep of file.dependencies || []) {
      const depAbsPath = basePath + dep;
      if (!reverseDepMap.has(depAbsPath)) {
        reverseDepMap.set(depAbsPath, []);
      }
      reverseDepMap.get(depAbsPath)!.push(absPath);
    }
  }

  // Return a minimal DependencyGraph-like object
  return {
    getFiles: () => Array.from(fileAnalysisMap.keys()),

    getAnalysis: (absPath: string) => {
      return fileAnalysisMap.get(absPath) || null;
    },

    getDependents: (absPath: string) => {
      const sources = reverseDepMap.get(absPath) || [];
      return sources.map(source => ({
        source,
        target: absPath,
      }));
    },

    getNode: (absPath: string) => {
      const analysis = fileAnalysisMap.get(absPath);
      if (analysis) {
        return {
          path: absPath,
          imports: (analysis.dependencies || []).map((d: any) => ({
            modulePath: d.target,
            resolved: d.target,
          })),
        };
      }
      return null;
    },
  } as unknown as DependencyGraph;
}

/**
 * Generate a human-friendly cluster name based on common path prefixes
 */
function generateClusterName(files: string[], index: number): string {
  if (files.length === 0) return `Cluster ${index + 1}`;

  // Find common path prefix
  const parts = files.map(f => f.split('/'));
  const minLen = Math.min(...parts.map(p => p.length));

  let commonPrefix: string[] = [];
  for (let i = 0; i < minLen - 1; i++) {
    const segment = parts[0][i];
    if (parts.every(p => p[i] === segment)) {
      commonPrefix.push(segment);
    } else {
      break;
    }
  }

  if (commonPrefix.length > 0) {
    // Use last 1-2 segments of common prefix
    const name = commonPrefix.slice(-2).join('/');
    return name || `Cluster ${index + 1}`;
  }

  // Fall back to first file's directory
  const firstDir = files[0].split('/').slice(0, -1).slice(-2).join('/');
  return firstDir || `Cluster ${index + 1}`;
}

/**
 * Get a color for a community (for animation)
 */
function getCommunityColor(communityId: number): string {
  const colors = [
    '#3fb950', // green
    '#58a6ff', // blue
    '#a371f7', // purple
    '#f0883e', // orange
    '#db61a2', // pink
    '#7ee787', // light green
    '#79c0ff', // light blue
    '#d2a8ff', // light purple
    '#ffa657', // light orange
    '#ff7b72', // red
  ];
  return colors[communityId % colors.length];
}
