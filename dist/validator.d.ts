export interface ValidationResult {
    findCount: number;
    parserCount: number;
    difference: number;
    missingFiles: string[];
    extraFiles: string[];
    sampleMissing: string[];
    sampleExtra: string[];
}
export declare class Validator {
    /**
     * Use shell `find` to get all files matching extensions in a directory
     */
    findFilesViaShell(dirPath: string, extensions: string[]): string[];
    /**
     * Compare files found by parser vs shell find
     */
    validate(dirPath: string, parsedFiles: string[], extensions?: string[]): ValidationResult;
    /**
     * Print validation report
     */
    printReport(label: string, result: ValidationResult): void;
    /**
     * Categorize missing files by pattern
     */
    analyzeMissingPatterns(missingFiles: string[], basePath: string): Record<string, number>;
}
