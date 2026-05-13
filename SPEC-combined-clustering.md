# SPEC: Combined Clustering with Tuning

**Project:** webpos-consolidator
**Feature:** Hybrid clustering combining topological + content similarity
**Spec Version:** 1.0
**Date:** 2026-05-12

---

## 1. Overview

### What This Feature Does

Combines two complementary similarity signals to cluster conflict files into optimal work packages:

1. **Topological Similarity** (Louvain) - Files connected by imports/exports
2. **Content Similarity** (TF-IDF) - Files with similar code vocabulary

The combined approach handles edge cases that single methods miss:
- Files with no direct imports but similar domain (TF-IDF catches)
- Files with many imports but different domains (Louvain still groups)

### Expected Outcome

Given ~272 conflict files, produce 15-25 work packages where:
- Files in each package are related by structure AND/OR content
- Package sizes are 5-15 files (manageable units)
- Cross-package dependencies are minimized

---

## 2. Combination Strategy

### 2.1 Weighted Hybrid Similarity

Combine both signals with configurable weights:

```
combinedSimilarity(A, B) = α × topological(A, B) + (1-α) × tfidf(A, B)
```

Where:
- `α` = topological weight (default: 0.6)
- `topological(A, B)` = Jaccard similarity of dependency sets
- `tfidf(A, B)` = Cosine similarity of TF-IDF vectors

### 2.2 Why α = 0.6 Default

| Weight | Behavior |
|--------|----------|
| α = 1.0 | Pure topological (ignores content) |
| α = 0.8 | Strong structural bias |
| **α = 0.6** | Balanced, structure-first |
| α = 0.4 | Content-first |
| α = 0.0 | Pure TF-IDF (ignores imports) |

Rationale: Import relationships are stronger signals for migration order (A must be migrated before B if B imports A). Content similarity is a tiebreaker and catches isolated files.

### 2.3 Handling Missing Signals

| Case | Topological | TF-IDF | Strategy |
|------|-------------|--------|----------|
| Connected files | ✓ | ✓ | Use weighted combo |
| Isolated file, similar content | ✗ | ✓ | Use TF-IDF only |
| Connected, empty files | ✓ | ✗ | Use topological only |
| Isolated, no tokens | ✗ | ✗ | Assign to "orphan" package |

---

## 3. Module Structure

### 3.1 New Files

```
src/clustering/
├── index.ts                  # Update exports
├── types.ts                  # Add combined types
├── combined-clustering.ts    # NEW: Hybrid clustering logic
└── similarity-matrix.ts      # NEW: Unified similarity computation
```

### 3.2 New Types

```typescript
// Add to src/clustering/types.ts

export interface CombinedClusteringOptions extends ClusteringOptions {
  /** Weight for topological similarity (0-1, default: 0.6) */
  topologicalWeight?: number;

  /** Weight for TF-IDF similarity (0-1, default: 0.4) */
  contentWeight?: number;

  /** Minimum combined similarity to consider files related (default: 0.1) */
  minSimilarity?: number;

  /** Use edge weights in Louvain (based on combined similarity) */
  useWeightedEdges?: boolean;
}

export interface CombinedClusteringResult extends ClusteringResult {
  /** Weights used for this clustering */
  weights: {
    topological: number;
    content: number;
  };

  /** Package quality metrics */
  quality: {
    avgCohesion: number;
    avgContentSimilarity: number;
    isolatedFileCount: number;
  };
}
```

---

## 4. API Design

### 4.1 Primary Function

```typescript
/**
 * Cluster conflict files using combined topological + content similarity.
 *
 * @param depGraph - The dependency graph
 * @param conflictFiles - Array of conflict file relative paths
 * @param fileContents - Map of relativePath -> file content (for TF-IDF)
 * @param options - Combined clustering options
 * @returns CombinedClusteringResult
 */
export function clusterWithCombinedSimilarity(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  fileContents: Map<string, string>,
  options?: CombinedClusteringOptions
): CombinedClusteringResult;
```

### 4.2 Similarity Matrix Builder

```typescript
/**
 * Build a unified similarity matrix combining both signals.
 *
 * @param depGraph - The dependency graph
 * @param conflictFiles - Files to compare
 * @param fileContents - File contents for TF-IDF
 * @param topologicalWeight - Weight for topological similarity
 * @returns Similarity matrix where matrix[i][j] is combined similarity
 */
export function buildCombinedSimilarityMatrix(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  fileContents: Map<string, string>,
  topologicalWeight: number
): number[][];
```

### 4.3 Topological Similarity (Jaccard)

```typescript
/**
 * Compute Jaccard similarity between two files based on dependencies.
 *
 * Jaccard(A, B) = |deps(A) ∩ deps(B)| / |deps(A) ∪ deps(B)|
 *
 * Also considers dependents (files that import A or B).
 */
export function computeTopologicalSimilarity(
  fileA: string,
  fileB: string,
  depGraph: DependencyGraph
): number;
```

---

## 5. Algorithm

### 5.1 High-Level Flow

```
1. Build TF-IDF index from file contents
2. Build combined similarity matrix
3. Convert to weighted graphology graph
4. Run Louvain with resolution tuning
5. Post-process: merge tiny clusters, split huge ones
6. Compute quality metrics
7. Return work packages
```

### 5.2 Pseudocode

```typescript
function clusterWithCombinedSimilarity(
  depGraph, conflictFiles, fileContents, options
) {
  const α = options.topologicalWeight ?? 0.6;

  // 1. Build TF-IDF index
  const tfidfIndex = buildTfIdfIndex(
    conflictFiles.map(f => ({ relativePath: f, content: fileContents.get(f) }))
  );

  // 2. Build combined similarity matrix
  const simMatrix = buildCombinedSimilarityMatrix(
    depGraph, conflictFiles, tfidfIndex, α
  );

  // 3. Create weighted graph
  const graph = new Graph({ type: 'undirected' });
  for (const file of conflictFiles) {
    graph.addNode(file);
  }

  for (let i = 0; i < conflictFiles.length; i++) {
    for (let j = i + 1; j < conflictFiles.length; j++) {
      const sim = simMatrix[i][j];
      if (sim >= options.minSimilarity) {
        graph.addEdge(conflictFiles[i], conflictFiles[j], { weight: sim });
      }
    }
  }

  // 4. Run Louvain with optimal resolution
  const { resolution, result } = findOptimalResolution(
    graph, options.targetPackages
  );

  // 5. Post-process clusters
  const packages = postProcessClusters(result.packages, options);

  // 6. Compute quality metrics
  const quality = computeQualityMetrics(packages, simMatrix);

  return { ...result, packages, quality, weights: { topological: α, content: 1-α } };
}
```

### 5.3 Post-Processing Rules

| Condition | Action |
|-----------|--------|
| Package size < minSize | Merge with most similar neighbor package |
| Package size > maxSize | Split using higher resolution Louvain |
| Single isolated file | Add to "orphans" package |

---

## 6. Tuning Parameters

### 6.1 Parameter Grid for Auto-Tuning

```typescript
const TUNING_GRID = {
  resolution: [0.6, 0.8, 1.0, 1.2, 1.5, 2.0],
  topologicalWeight: [0.4, 0.5, 0.6, 0.7, 0.8],
};
```

### 6.2 Scoring Function

```typescript
function scoreClusteringResult(
  result: CombinedClusteringResult,
  options: CombinedClusteringOptions
): number {
  const { targetPackages, minPackageSize, maxPackageSize } = options;

  // 1. Package count score (max 10)
  const countDev = Math.abs(result.packageCount - targetPackages);
  const countScore = Math.max(0, 10 - countDev);

  // 2. Size distribution score (max 10)
  let sizeScore = 0;
  for (const pkg of result.packages) {
    if (pkg.size >= minPackageSize && pkg.size <= maxPackageSize) {
      sizeScore += 1;
    }
  }
  sizeScore = (sizeScore / result.packageCount) * 10;

  // 3. Cohesion score (max 5)
  const cohesionScore = result.quality.avgCohesion * 5;

  // 4. Content similarity score (max 5)
  const contentScore = result.quality.avgContentSimilarity * 5;

  // 5. Penalty for orphans
  const orphanPenalty = result.quality.isolatedFileCount * 0.5;

  return countScore + sizeScore + cohesionScore + contentScore - orphanPenalty;
}
```

### 6.3 Auto-Tune Function

```typescript
export function autoTuneCombinedClustering(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  fileContents: Map<string, string>,
  options?: CombinedClusteringOptions
): {
  bestParams: { resolution: number; topologicalWeight: number };
  bestResult: CombinedClusteringResult;
  allAttempts: TuningAttempt[];
};
```

---

## 7. Quality Metrics

### 7.1 Package Cohesion

```typescript
/**
 * Average intra-package similarity.
 * Higher = files in same package are more related.
 */
function computePackageCohesion(
  pkg: WorkPackage,
  simMatrix: number[][],
  fileIndexMap: Map<string, number>
): number {
  if (pkg.size < 2) return 1.0;

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < pkg.files.length; i++) {
    for (let j = i + 1; j < pkg.files.length; j++) {
      const idxA = fileIndexMap.get(pkg.files[i]);
      const idxB = fileIndexMap.get(pkg.files[j]);
      totalSim += simMatrix[idxA][idxB];
      pairs++;
    }
  }

  return pairs > 0 ? totalSim / pairs : 0;
}
```

### 7.2 Cross-Package Coupling

```typescript
/**
 * Average inter-package dependency count.
 * Lower = better separation between packages.
 */
function computeCrossCoupling(packages: WorkPackage[]): number {
  let totalExternal = 0;
  for (const pkg of packages) {
    totalExternal += pkg.externalEdges;
  }
  return totalExternal / packages.length;
}
```

---

## 8. Output Format

### 8.1 Example Result

```typescript
{
  packages: [
    {
      id: 0,
      name: "payment-core",
      files: [
        "src/app/payment/payment.service.ts",
        "src/app/payment/payment-dialog.component.ts",
        "src/app/payment/refund.service.ts",
        // ...
      ],
      size: 8,
      internalEdges: 14,
      externalEdges: 3,
      cohesion: 0.72,
    },
    // ... more packages
  ],
  totalFiles: 272,
  packageCount: 22,
  modularity: 0.45,
  resolution: 1.2,
  isolatedFiles: ["src/app/utils/legacy.ts"],
  weights: {
    topological: 0.6,
    content: 0.4,
  },
  quality: {
    avgCohesion: 0.68,
    avgContentSimilarity: 0.54,
    isolatedFileCount: 1,
  },
}
```

---

## 9. Integration Point

### 9.1 Server Analysis Hook

Add to `src/server/server-analysis.ts` after file comparison:

```typescript
// After fileMatches are built...

// Read file contents for TF-IDF
const fileContents = new Map<string, string>();
for (const match of fileMatches) {
  if (match.status === 'conflict') {
    const content = fs.readFileSync(match.restaurantPath || match.retailPath, 'utf-8');
    fileContents.set(match.relativePath, content);
  }
}

// Run combined clustering
const conflictFiles = fileMatches
  .filter(f => f.status === 'conflict')
  .map(f => f.relativePath);

const clusterResult = clusterWithCombinedSimilarity(
  graph,
  conflictFiles,
  fileContents,
  { targetPackages: 20, minPackageSize: 5, maxPackageSize: 15 }
);
```

### 9.2 Report Extension

Add to `AnalysisReport` interface:

```typescript
export interface AnalysisReport {
  // ... existing fields

  /** Work packages from combined clustering */
  workPackages?: CombinedClusteringResult;
}
```

---

## 10. Test Cases

### 10.1 Similarity Matrix Tests

| Test | Description |
|------|-------------|
| `identical files have similarity 1.0` | Both signals maxed |
| `unrelated files have low similarity` | Different imports, different content |
| `imported but different content` | Topological high, TF-IDF low |
| `similar content but not imported` | Topological low, TF-IDF high |

### 10.2 Clustering Tests

| Test | Description |
|------|-------------|
| `all files assigned to exactly one package` | No duplicates, no missing |
| `package sizes within bounds after post-process` | Min/max enforced |
| `deterministic output` | Same input → same clusters |

### 10.3 Tuning Tests

| Test | Description |
|------|-------------|
| `higher resolution produces more packages` | Direction correct |
| `auto-tune finds reasonable parameters` | Score improves |

---

## 11. Acceptance Criteria

### Functional
- [ ] Combined similarity matrix computed correctly
- [ ] Weighted edges used in Louvain
- [ ] Post-processing merges/splits as needed
- [ ] Quality metrics computed
- [ ] Auto-tuning finds good parameters

### Performance
- [ ] 272 files clustered in < 3 seconds
- [ ] Auto-tuning (grid search) in < 30 seconds

### Quality
- [ ] avgCohesion > 0.5
- [ ] At least 80% of packages in size range
- [ ] < 5% of files isolated

---

## Appendix: Implementation Checklist

1. [ ] Add new types to `src/clustering/types.ts`
2. [ ] Create `src/clustering/similarity-matrix.ts`
3. [ ] Create `src/clustering/combined-clustering.ts`
4. [ ] Update `src/clustering/index.ts` exports
5. [ ] Add integration to `server-analysis.ts`
6. [ ] Update `AnalysisReport` type
7. [ ] Write unit tests
8. [ ] Run on real data and validate
