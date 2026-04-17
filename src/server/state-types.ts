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
  };
}
