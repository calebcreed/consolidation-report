export interface Config {
    repoRoot: string;
    retailPath: string;
    restaurantPath: string;
    sharedPath: string;
    baseCommit: string | null;
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
export type DivergenceType = 'CLEAN' | 'RETAIL_ONLY' | 'RESTAURANT_ONLY' | 'SAME_CHANGE' | 'CONFLICT';
export interface DivergenceInfo {
    type: DivergenceType;
    retailChanges: {
        additions: number;
        deletions: number;
    };
    restaurantChanges: {
        additions: number;
        deletions: number;
    };
    conflictRegions: Array<{
        startLine: number;
        endLine: number;
    }>;
    autoMergeable: boolean;
    lastRetailCommit?: {
        hash: string;
        date: string;
        author: string;
    };
    lastRestaurantCommit?: {
        hash: string;
        date: string;
        author: string;
    };
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
    dependencies: string[];
    dependents: string[];
    isCleanSubtree: boolean;
    depth: number;
}
export interface DependencyEdge {
    from: string;
    to: string;
    type: 'import' | 'ngmodule-import' | 'ngmodule-declaration' | 'provider' | 'injection' | 'template-selector' | 'template-pipe' | 'ngrx-action' | 'ngrx-selector';
}
export interface AnalysisResult {
    nodes: Map<string, FileNode>;
    edges: DependencyEdge[];
    cleanSubtrees: string[];
    trivialMerges: string[];
    conflicts: string[];
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
