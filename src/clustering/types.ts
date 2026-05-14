/**
 * Clustering Types - Interfaces for community detection and work packages
 */

/**
 * A work package containing files that should be migrated together
 */
export interface WorkPackage {
  /** Unique identifier for this package (0-indexed) */
  id: number;

  /** Display name for the package (optional, can be auto-generated) */
  name?: string;

  /** Relative paths of files in this package */
  files: string[];

  /** Number of files in the package */
  size: number;

  /** Internal edge count (dependencies within this package) */
  internalEdges: number;

  /** External edge count (dependencies to other packages) */
  externalEdges: number;

  /** Cohesion score: internalEdges / (internalEdges + externalEdges) */
  cohesion: number;
}

/**
 * Result of clustering operation
 */
export interface ClusteringResult {
  /** All work packages, sorted by size (descending) */
  packages: WorkPackage[];

  /** Total number of files clustered */
  totalFiles: number;

  /** Number of packages created */
  packageCount: number;

  /** Modularity score (0-1, higher is better cluster quality) */
  modularity: number;

  /** Resolution parameter used */
  resolution: number;

  /** Files that ended up isolated (no connections to other conflict files) */
  isolatedFiles: string[];
}

/**
 * Options for clustering
 */
export interface ClusteringOptions {
  /** Target number of packages (default: 20) */
  targetPackages?: number;

  /** Minimum files per package (default: 5) */
  minPackageSize?: number;

  /** Maximum files per package (default: 15) */
  maxPackageSize?: number;

  /** Explicit resolution override (bypasses auto-tuning if set) */
  resolution?: number;

  /** Enable auto-tuning to find optimal resolution (default: true) */
  autoTune?: boolean;

  /** Include isolated files in their own package (default: true) */
  includeIsolated?: boolean;
}

/**
 * Result of resolution tuning
 */
export interface TuningResult {
  /** Optimal resolution found */
  resolution: number;

  /** Clustering result with optimal resolution */
  result: ClusteringResult;

  /** All attempts made during tuning */
  attempts: TuningAttempt[];
}

/**
 * Single tuning attempt
 */
export interface TuningAttempt {
  resolution: number;
  packageCount: number;
  modularity: number;
  score: number;
}

/**
 * Options for combined clustering (topological + content + path)
 */
export interface CombinedClusteringOptions extends ClusteringOptions {
  /** Weight for topological similarity (0-1, default: 0.5) */
  topologicalWeight?: number;

  /** Weight for content/TF-IDF similarity (0-1, default: 0.2) */
  contentWeight?: number;

  /** Weight for path/directory similarity (0-1, default: 0.3) */
  pathWeight?: number;

  /** Bonus added for direct import relationships (default: 0.2) */
  directDepBoost?: number;

  /** Minimum combined similarity to consider files related (default: 0.1) */
  minSimilarity?: number;
}

/**
 * Quality metrics for clustering result
 */
export interface ClusteringQuality {
  /** Average intra-package similarity */
  avgCohesion: number;

  /** Average content similarity within packages */
  avgContentSimilarity: number;

  /** Number of isolated files (no connections) */
  isolatedFileCount: number;

  /** Average cross-package dependencies */
  avgCrossCoupling: number;
}

/**
 * Result of combined clustering operation
 */
export interface CombinedClusteringResult extends ClusteringResult {
  /** Weights used for this clustering */
  weights: {
    topological: number;
    content: number;
    path: number;
    directDepBoost: number;
  };

  /** Package quality metrics */
  quality: ClusteringQuality;
}

/**
 * Combined tuning attempt
 */
export interface CombinedTuningAttempt extends TuningAttempt {
  topologicalWeight: number;
}

/**
 * Result of combined clustering auto-tune
 */
export interface CombinedTuningResult {
  /** Best parameters found */
  bestParams: {
    resolution: number;
    topologicalWeight: number;
  };

  /** Clustering result with best parameters */
  bestResult: CombinedClusteringResult;

  /** All attempts made during tuning */
  allAttempts: CombinedTuningAttempt[];
}
