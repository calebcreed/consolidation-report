/**
 * Server Clustering - Leafward topology-first work package generation
 *
 * Algorithm:
 * 1. Find leafward clusters (files that can be safely removed together)
 * 2. Subdivide large clusters by directory/similarity
 * 3. Calculate impact score per cluster
 * 4. Order by impact (highest first)
 */

import * as fs from 'fs';
import * as path from 'path';
import { StateManager, ClusterState, WorkPackageState } from './state';
import { WebSocketManager } from './server-websocket';
import { buildLeafwardClusters, DepFile } from '../clustering/leafward-clustering';

export interface ClusteringProgressEvent {
  type: 'init' | 'reading-files' | 'building-graph' | 'computing-waves' | 'grouping' | 'complete';
  message: string;
  data?: any;
}

/**
 * Run leafward clustering with progress events streamed via WebSocket.
 */
export async function runClusteringWithProgress(
  stateManager: StateManager,
  wsManager: WebSocketManager,
  _options?: { resolution?: number; topologicalWeight?: number }
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
  const conflictFiles = report.files.filter(f => f.status === 'conflict');

  if (conflictFiles.length === 0) {
    throw new Error('No conflict files to cluster. Run analysis first.');
  }

  const conflictPaths = conflictFiles.map(f => f.relativePath);

  // Broadcast start
  wsManager.broadcast({
    type: 'cluster-start',
    data: { fileCount: conflictPaths.length },
  });

  // Progress: init
  broadcastProgress(wsManager, {
    type: 'init',
    message: `Starting leafward clustering for ${conflictPaths.length} conflict files...`,
    data: { files: conflictPaths },
  });

  // Build DepFile map from report
  broadcastProgress(wsManager, {
    type: 'building-graph',
    message: 'Building dependency graph from report...',
  });

  const files = new Map<string, DepFile>();
  const conflictSet = new Set(conflictPaths);

  // Build reverse dependency map first
  const reverseDepMap = new Map<string, string[]>();
  for (const file of report.files) {
    for (const dep of file.dependencies || []) {
      if (!reverseDepMap.has(dep)) {
        reverseDepMap.set(dep, []);
      }
      reverseDepMap.get(dep)!.push(file.relativePath);
    }
  }

  // Build DepFile entries
  for (const file of report.files) {
    const relPath = file.relativePath;
    // Map file status to our internal format
    const statusMap: Record<string, DepFile['status']> = {
      'clean': 'clean',
      'retail-only': 'retail_only',
      'restaurant-only': 'restaurant_only',
      'conflict': 'conflict',
      'same-change': 'same_change',
    };
    const depFile: DepFile = {
      relativePath: relPath,
      absolutePath: file.restaurantPath || file.retailPath || '',
      dependencies: (file.dependencies || []).filter((d: string) => conflictSet.has(d)),
      dependents: (reverseDepMap.get(relPath) || []).filter(d => conflictSet.has(d)),
      status: statusMap[file.status] || 'conflict',
      linesChanged: (file as any).linesChanged || 50, // Default estimate
    };
    files.set(relPath, depFile);
  }

  // Read file contents for similarity subdivision
  broadcastProgress(wsManager, {
    type: 'reading-files',
    message: 'Reading file contents for similarity analysis...',
  });

  const fileContents = new Map<string, string>();
  const basePath = getBasePath(config, report);

  for (const relPath of conflictPaths) {
    const fullPath = path.join(basePath, relPath);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        fileContents.set(relPath, content);
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  // Compute removal waves
  broadcastProgress(wsManager, {
    type: 'computing-waves',
    message: 'Computing topological removal waves...',
  });

  // Build leafward clusters
  broadcastProgress(wsManager, {
    type: 'grouping',
    message: 'Grouping files into work packages...',
  });

  const result = buildLeafwardClusters(files, conflictPaths, fileContents);

  // Broadcast each package for animation
  for (const pkg of result.packages) {
    wsManager.broadcast({
      type: 'cluster-progress',
      data: {
        type: 'package-created',
        message: `Package ${pkg.id + 1}: ${pkg.name} (${pkg.files.length} files, impact: ${pkg.impactScore})`,
        data: {
          packageId: pkg.id,
          files: pkg.files,
          color: getPackageColor(pkg.depth, pkg.id),
          impactScore: pkg.impactScore,
        },
      },
    });
  }

  // Convert to WorkPackageState
  const packages: WorkPackageState[] = result.packages.map(pkg => ({
    id: pkg.id,
    name: pkg.name,
    files: pkg.files,
    cohesion: pkg.impactScore, // Use impact score as cohesion indicator
    internalEdges: pkg.unlockCount,
    externalEdges: pkg.totalLines,
    // Extended fields for new UI
    impactScore: pkg.impactScore,
    unlockCount: pkg.unlockCount,
    unlockFiles: pkg.unlockFiles,
    depth: pkg.depth,
    isLeafCluster: pkg.isLeafCluster,
  }));

  const clusterState: ClusterState = {
    packages,
    unassignedFiles: [], // Leafward clustering assigns all files
    runAt: new Date().toISOString(),
    params: { resolution: 0, topologicalWeight: 1 }, // Topology-first
  };

  // Save to state
  stateManager.setClusters(clusterState);

  // Broadcast complete
  broadcastProgress(wsManager, {
    type: 'complete',
    message: `Clustering complete: ${packages.length} work packages ordered by impact`,
  });

  wsManager.broadcast({
    type: 'cluster-complete',
    data: clusterState,
  });

  return clusterState;
}

/**
 * Get base path for reading files
 */
function getBasePath(config: any, report: any): string {
  // Check if this is test data
  if (report.files[0]?.absolutePath?.includes('test-cluster-data')) {
    return path.join(process.cwd(), 'test-cluster-data', 'src', 'app');
  }
  return path.join(config.projectPath, 'apps', 'restaurant');
}

function broadcastProgress(wsManager: WebSocketManager, event: ClusteringProgressEvent): void {
  wsManager.broadcast({
    type: 'cluster-progress',
    data: event,
  });
  wsManager.output(event.message);
}

/**
 * Get a color for a package based on depth and index
 */
function getPackageColor(depth: number, index: number): string {
  // Colors by depth (leaves = green, deeper = blue/purple)
  const depthColors = [
    ['#3fb950', '#7ee787', '#56d364', '#2ea043'], // Depth 0 (leaves) - greens
    ['#58a6ff', '#79c0ff', '#388bfd', '#1f6feb'], // Depth 1 - blues
    ['#a371f7', '#d2a8ff', '#8957e5', '#6e40c9'], // Depth 2 - purples
    ['#f0883e', '#ffa657', '#d29922', '#bb8009'], // Depth 3+ - oranges
  ];

  const colorSet = depthColors[Math.min(depth, depthColors.length - 1)];
  return colorSet[index % colorSet.length];
}
