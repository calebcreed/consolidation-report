/**
 * Clustering Module - Community detection for work package generation
 *
 * Uses the Louvain algorithm to cluster conflict files into
 * logical work packages based on dependency relationships.
 *
 * Supports both pure topological clustering and combined
 * topological + content (TF-IDF) similarity clustering.
 */

// Pure topological clustering
export { clusterIntoWorkPackages } from './community-detection';
export {
  findOptimalResolution,
  estimateResolution,
  refineResolution,
} from './resolution-tuner';
export {
  toGraphologyGraph,
  getIsolatedNodes,
  getGraphStats,
} from './graph-converter';

// Combined clustering (topological + TF-IDF)
export {
  clusterWithCombinedSimilarity,
  autoTuneCombinedClustering,
} from './combined-clustering';
export {
  buildCombinedSimilarityMatrix,
  buildFilePathMap,
  computeTopologicalSimilarity,
  computeGroupCohesion,
} from './similarity-matrix';

// Types
export type {
  WorkPackage,
  ClusteringResult,
  ClusteringOptions,
  TuningResult,
  TuningAttempt,
  CombinedClusteringOptions,
  CombinedClusteringResult,
  ClusteringQuality,
  CombinedTuningResult,
  CombinedTuningAttempt,
} from './types';
