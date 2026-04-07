import { DivergenceInfo } from '../config';
export interface ThreeWayDiffResult {
    baseContent: string | null;
    retailContent: string | null;
    restaurantContent: string | null;
    divergence: DivergenceInfo;
}
export declare class GitDiffer {
    private repoRoot;
    private baseCommit;
    constructor(repoRoot: string, baseCommit: string | null);
    getFileAtCommit(filePath: string, commit: string): string | null;
    getCurrentContent(filePath: string): string | null;
    getLastCommitInfo(filePath: string): {
        hash: string;
        date: string;
        author: string;
    } | undefined;
    computeThreeWayDiff(retailPath: string | null, restaurantPath: string | null, baseRetailPath?: string, baseRestaurantPath?: string): ThreeWayDiffResult;
    private analyzeDivergence;
    private normalizeContent;
    private countChanges;
    private findConflictRegions;
    generateUnifiedDiff(base: string | null, retail: string | null, restaurant: string | null, filename: string): {
        retailDiff: string;
        restaurantDiff: string;
    };
}
