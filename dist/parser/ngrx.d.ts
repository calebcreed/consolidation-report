export interface NgRxPatterns {
    actionNames: string[];
    actionIdentifiers: string[];
    referencedActions: string[];
    selectorNames: string[];
    referencedSelectors: string[];
    featureName?: string;
}
export declare function parseNgRxPatterns(filePath: string, content?: string): NgRxPatterns;
export declare function inferNgRxFileType(filePath: string): 'action' | 'reducer' | 'effect' | 'selector' | 'state' | null;
