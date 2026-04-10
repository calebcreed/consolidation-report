/**
 * WebPOS Consolidator v2 - Unified API
 *
 * Complete rewrite of dependency detection and AST-based diffing.
 */

// Dependency detection
export {
  // Types
  Dependency,
  DependencyType,
  FileAnalysis,
  Export,
  AngularMetadata,
  NgRxMetadata,
  ResolvedPath,
  SerializedGraph,

  // Classes
  PathResolver,
  DependencyExtractor,
  DependencyGraph,
  GraphBuilder,
  GraphStats,
} from './deps';

// Diff
export {
  // Types
  DiffResult,
  DiffStatus,
  Change,
  CleanReason,
  StructuralChange,
  StructuralMatch,
  NormalizedAST,
  FileSignature,

  // Classes
  ASTNormalizer,
  SemanticComparator,
} from './diff';

// Integration types
export interface AnalysisOptions {
  restaurantPath: string;
  retailPath: string;
  sharedPath?: string;
  tsconfigPath: string;
}

export interface FileMatch {
  restaurantFile: string;
  retailFile: string;
  diff: import('./diff').DiffResult;
}

export interface AnalysisResult {
  restaurantGraph: import('./deps').DependencyGraph;
  retailGraph: import('./deps').DependencyGraph;
  matches: FileMatch[];
  cleanSubtrees: Set<string>;
  dirtyFiles: Set<string>;
}
