/**
 * State Types - interfaces for server state management
 */

import { AnalysisReport } from '../report/types';

export interface MigrationRecord {
  id: string;
  timestamp: string;
  subtreeRoot: string;
  files: string[];
  fromBranch: string;
  toBranch: string;
  status: 'pending' | 'migrated' | 'built' | 'rolled-back';
  commitHash?: string;
  parentCommitHash?: string;
}

export interface ServerConfig {
  projectPath: string;
  retailBranch: string;
  restaurantBranch: string;
  sharedPath: string;
  tsconfigPath: string;
  buildCommand: string;
}

export interface BuildState {
  running: boolean;
  output: string[];
  exitCode: number | null;
}

export interface ServerState {
  config: ServerConfig | null;
  report: AnalysisReport | null;
  migrations: MigrationRecord[];
  redoStack: MigrationRecord[];
  currentCommit: string | null;
  currentBuild: BuildState;
  lastError: string | null;
  clusters: ClusterState;
}

// ============ Cluster State Types ============

export interface WorkPackageState {
  id: number;
  name: string;  // Editable
  files: string[];
  cohesion: number;
  internalEdges: number;
  externalEdges: number;
}

export interface ClusterState {
  packages: WorkPackageState[];
  unassignedFiles: string[];
  runAt: string | null;
  params: { resolution: number; topologicalWeight: number } | null;
}

export function createInitialClusterState(): ClusterState {
  return {
    packages: [],
    unassignedFiles: [],
    runAt: null,
    params: null,
  };
}

export function createInitialState(): ServerState {
  return {
    config: null,
    report: null,
    migrations: [],
    redoStack: [],
    currentCommit: null,
    currentBuild: {
      running: false,
      output: [],
      exitCode: null,
    },
    lastError: null,
    clusters: createInitialClusterState(),
  };
}
