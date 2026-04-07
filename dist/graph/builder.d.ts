import { FileNode, DependencyEdge, Config } from '../config';
import { ParsedFile } from '../parser';
import { FileMapping } from '../config';
import { ThreeWayDiffResult } from '../diff';
export declare class GraphBuilder {
    private config;
    private nodes;
    private edges;
    private filesByPath;
    private filesByClass;
    private filesBySelector;
    private filesByAction;
    private filesBySelector2;
    constructor(config: Config);
    build(retailFiles: ParsedFile[], restaurantFiles: ParsedFile[], matchings: FileMapping[], retailOnly: string[], restaurantOnly: string[], diffResults: Map<string, ThreeWayDiffResult>): {
        nodes: Map<string, FileNode>;
        edges: DependencyEdge[];
    };
    private createNodeId;
    private indexNode;
    private findNodeIdForFile;
    private extractAngularMetadata;
    private addDependencyEdges;
    private addEdge;
    private calculateDepths;
}
