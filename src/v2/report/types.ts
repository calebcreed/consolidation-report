/**
 * Report Types - Interfaces for analysis results and reports
 */

import { DiffResult } from '../diff/types';

// File status in the comparison
export type FileStatus =
  | 'clean'           // Identical in both branches
  | 'retail-only'     // Only exists/changed in retail
  | 'restaurant-only' // Only exists/changed in restaurant
  | 'conflict'        // Different changes in both branches
  | 'same-change';    // Same change made in both branches

export interface FileMatch {
  relativePath: string;
  retailPath: string | null;
  restaurantPath: string | null;
  status: FileStatus;
  diff: DiffResult;
  unifiedDiff?: string;      // Git-style unified diff (retail vs restaurant)
  isCleanSubtree: boolean;
  dependencies: string[];    // relativePaths this file depends on
  dependents: string[];      // relativePaths that depend on this file
  // Lines changed (for impact score calculation)
  linesChanged?: number;
}

export interface CleanSubtree {
  rootPath: string;          // The root file of this subtree
  files: string[];           // All files in the subtree (relativePaths)
  totalFiles: number;
  // Breakdown by status (should all be clean or same-change)
  breakdown: Record<FileStatus, number>;
}

export interface BottleneckNode {
  relativePath: string;
  status: FileStatus;
  unlockCount: number;       // Number of clean nodes unlocked if this is resolved
  unlockedPaths: string[];   // Sample of paths that would be unlocked
  linesChanged: number;      // Lines that need to be changed/merged to resolve
  impactScore: number;       // unlockCount / linesChanged (higher = more bang for buck)
}

export interface SummaryStats {
  totalFiles: number;
  cleanFiles: number;
  retailOnlyFiles: number;
  restaurantOnlyFiles: number;
  conflictFiles: number;
  sameChangeFiles: number;
  immediatelyMovable: number;  // Files in clean subtrees (no dirty deps)
  blockedClean: number;        // Clean files blocked by dirty dependencies
}

export interface AnalysisReport {
  generatedAt: string;
  stats: SummaryStats;
  files: FileMatch[];
  cleanSubtrees: CleanSubtree[];  // Ranked by size descending
  bottlenecks: BottleneckNode[];  // Ranked by unlockCount descending
}
