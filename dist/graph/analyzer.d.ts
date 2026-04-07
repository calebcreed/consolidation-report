import { FileNode, AnalysisResult, DependencyEdge } from '../config';
export declare class GraphAnalyzer {
    analyze(nodes: Map<string, FileNode>, edges: DependencyEdge[]): AnalysisResult;
    private markCleanSubtrees;
    private markNodeCleanSubtree;
    getMovableTrees(result: AnalysisResult): Array<{
        rootId: string;
        files: string[];
        totalFiles: number;
        divergenceBreakdown: Record<string, number>;
    }>;
    private collectSubtree;
    getDirtyNodes(result: AnalysisResult): FileNode[];
    getConsolidationPriority(result: AnalysisResult): Array<{
        nodeId: string;
        priority: 'high' | 'medium' | 'low';
        reason: string;
    }>;
}
