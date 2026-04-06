export interface Config {
  repoRoot: string;
  retailPath: string;
  restaurantPath: string;
  sharedPath: string;
  baseCommit: string;
  outputPath: string;
  mappingFile?: string;
  fileExtensions: string[];
}

export interface FileMapping {
  retailFile: string;
  restaurantFile: string | null;
  matchMethod: 'path' | 'classname' | 'selector' | 'manual' | 'unmatched';
}

export interface FileMappingConfig {
  mappings: FileMapping[];
  retailOnly: string[];
  restaurantOnly: string[];
  manualOverrides: Record<string, string>;
}

export type DivergenceType =
  | 'CLEAN'           // Identical in both branches and base
  | 'RETAIL_ONLY'     // Only retail changed from base
  | 'RESTAURANT_ONLY' // Only restaurant changed from base
  | 'SAME_CHANGE'     // Both changed identically from base
  | 'CONFLICT';       // Both changed differently

export interface DivergenceInfo {
  type: DivergenceType;
  retailChanges: { additions: number; deletions: number };
  restaurantChanges: { additions: number; deletions: number };
  conflictRegions: Array<{ startLine: number; endLine: number }>;
  autoMergeable: boolean;
  lastRetailCommit?: { hash: string; date: string; author: string };
  lastRestaurantCommit?: { hash: string; date: string; author: string };
}

export interface FileNode {
  id: string;
  relativePath: string;
  retailPath: string | null;
  restaurantPath: string | null;
  type: 'component' | 'service' | 'module' | 'directive' | 'pipe' | 'guard' | 'interceptor' | 'model' | 'util' | 'unknown';
  angularMetadata?: {
    selector?: string;
    className?: string;
    providedIn?: string;
    declarations?: string[];
    imports?: string[];
    exports?: string[];
    providers?: string[];
  };
  divergence: DivergenceInfo | null;
  dependencies: string[];  // IDs of files this depends on
  dependents: string[];    // IDs of files that depend on this
  isCleanSubtree: boolean; // This node and all descendants are clean
  depth: number;           // Depth in dependency graph
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'ngmodule-import' | 'ngmodule-declaration' | 'provider' | 'injection' | 'template-selector' | 'template-pipe';
}

export interface AnalysisResult {
  nodes: Map<string, FileNode>;
  edges: DependencyEdge[];
  cleanSubtrees: string[];      // Root nodes of clean subtrees
  trivialMerges: string[];      // Files where only one branch changed
  conflicts: string[];          // Files with conflicting changes
  stats: {
    totalFiles: number;
    cleanFiles: number;
    retailOnlyFiles: number;
    restaurantOnlyFiles: number;
    sameChangeFiles: number;
    conflictFiles: number;
    unmatchedRetail: number;
    unmatchedRestaurant: number;
  };
}
