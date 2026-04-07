import { AnalysisResult } from '../config';
import { ThreeWayDiffResult, GitDiffer } from '../diff';
export declare class ReportGenerator {
    private differ;
    private analyzer;
    constructor(differ: GitDiffer);
    generate(result: AnalysisResult, diffResults: Map<string, ThreeWayDiffResult>, outputPath: string): void;
    private generateHtml;
}
