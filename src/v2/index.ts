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

// Report
export {
  // Types
  FileMatch as ReportFileMatch,
  FileStatus,
  CleanSubtree,
  BottleneckNode,
  SummaryStats,
  AnalysisReport,

  // Classes
  ReportAnalyzer,
  TerminalReporter,
  HtmlReporter,
} from './report';
