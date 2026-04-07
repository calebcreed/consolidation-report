import { FileMapping, FileMappingConfig } from '../config';
import { ParsedFile } from '../parser';
export interface MatchResult {
    matched: FileMapping[];
    retailOnly: string[];
    restaurantOnly: string[];
}
export declare class FileMatcher {
    private retailBase;
    private restaurantBase;
    constructor(retailBase: string, restaurantBase: string);
    match(retailFiles: ParsedFile[], restaurantFiles: ParsedFile[], manualOverrides?: Record<string, string>): MatchResult;
    private normalizeRelativePath;
    saveMappingFile(result: MatchResult, outputPath: string): void;
    loadMappingFile(inputPath: string): FileMappingConfig | null;
}
