# Specification: Topological Similarity Scoring via Community Detection

**Project:** webpos-consolidator
**Feature:** Cluster conflict files into work packages using graph community detection
**Spec Version:** 1.0
**Date:** 2026-05-11

---

## 1. Overview

### 1.1 What This Feature Does

This feature adds topological similarity scoring to webpos-consolidator by implementing community detection on the dependency graph. Given a set of "conflict files" (files requiring migration work), the system clusters them into logical **work packages** based on their dependency relationships.

### 1.2 Why This Is Needed

The webpos-consolidator project needs to organize approximately 272 TypeScript/Angular conflict files into manageable work packages of 5-15 files each. Community detection identifies files that are tightly coupled through import/export relationships, ensuring:

- Files that change together stay together
- Work packages have minimal cross-package dependencies
- Migration can proceed in parallel across isolated clusters
- Merge conflicts and integration issues are minimized

### 1.3 Expected Outcome

Running the clustering algorithm on 272 conflict files should produce approximately 15-25 work packages, with most packages containing 8-15 tightly coupled files that make sense to migrate together.

---

## 2. Algorithm Choice: Louvain

### 2.1 Decision

The **Louvain algorithm** is selected for community detection based on the audit findings in `AUDIT-community-detection.md`.

### 2.2 Justification

| Factor | Louvain | Label Propagation | Infomap |
|--------|---------|-------------------|---------|
| **Cluster count control** | Resolution parameter | None | Limited |
| **Determinism** | Yes | No | Yes |
| **JavaScript library support** | Excellent (graphology) | Good | Poor |
| **Speed** | Fast - O(n log n) | Fastest | Moderate |
| **Fit for dependency graphs** | Excellent | Poor | Moderate |

### 2.3 How Louvain Works

1. **Phase 1 (Local moving):** Each node starts in its own community. Nodes are iteratively moved to neighboring communities if doing so increases modularity.
2. **Phase 2 (Aggregation):** Communities are collapsed into "super-nodes," creating a coarser graph.
3. **Repeat:** Phases alternate until no further modularity improvement is possible.

### 2.4 Key Advantage: Resolution Parameter

- **Higher values (>1):** More, smaller communities
- **Lower values (<1):** Fewer, larger communities
- **Default (1.0):** Standard modularity optimization

---

## 3. Dependencies to Add

### 3.1 Runtime Dependencies

```bash
npm install graphology graphology-communities-louvain
```

| Package | Version | Purpose |
|---------|---------|---------|
| `graphology` | ^0.25.x | Core graph data structure |
| `graphology-communities-louvain` | ^2.0.x | Louvain algorithm implementation |

### 3.2 Development Dependencies

```bash
npm install -D @types/graphology
```

### 3.3 Package.json Changes

```json
{
  "dependencies": {
    "graphology": "^0.25.4",
    "graphology-communities-louvain": "^2.0.1"
  },
  "devDependencies": {
    "@types/graphology": "^0.25.0"
  }
}
```

---

## 4. New Module Structure

### 4.1 Directory Location

```
src/
├── clustering/                    # NEW DIRECTORY
│   ├── index.ts                   # Public exports
│   ├── types.ts                   # Clustering-specific types
│   ├── community-detection.ts     # Core Louvain integration
│   ├── graph-converter.ts         # DependencyGraph -> graphology conversion
│   └── resolution-tuner.ts        # Auto-tuning logic for resolution parameter
├── deps/
│   ├── graph.ts                   # Existing DependencyGraph (unchanged)
│   └── ...
└── ...
```

### 4.2 Module Exports

```typescript
// src/clustering/index.ts

export { clusterIntoWorkPackages } from './community-detection';
export { findOptimalResolution } from './resolution-tuner';
export { toGraphologyGraph } from './graph-converter';
export type {
  WorkPackage,
  ClusteringResult,
  ClusteringOptions,
  ClusteringDetails,
} from './types';
```

---

## 5. Integration Point

### 5.1 Hooking into Existing DependencyGraph

The clustering module consumes the existing `DependencyGraph` class from `src/deps/graph.ts` without modifying it.

### 5.2 Conversion Function Signature

```typescript
// src/clustering/graph-converter.ts

import Graph from 'graphology';
import { DependencyGraph } from '../deps/graph';

/**
 * Converts a DependencyGraph to a graphology Graph, filtering to only
 * include the specified conflict files and edges between them.
 */
export function toGraphologyGraph(
  depGraph: DependencyGraph,
  conflictFiles: string[]
): Graph;
```

### 5.3 Edge Filtering

The converter excludes non-file dependency targets:
- `external:*` (npm packages)
- `unresolved:*` (failed path resolution)
- `symbol:*` (Angular DI tokens)
- `selector:*`, `pipe:*`, `directive:*` (Angular template references)
- `ngrx-*` (NgRx-specific references)

---

## 6. API Design

### 6.1 Core Types

```typescript
// src/clustering/types.ts

/**
 * A work package containing files that should be migrated together
 */
export interface WorkPackage {
  /** Unique identifier for this package (0-indexed) */
  id: number;

  /** Display name for the package (optional, can be auto-generated) */
  name?: string;

  /** Absolute paths of files in this package */
  files: string[];

  /** Number of files in the package */
  size: number;

  /** Internal edge count (dependencies within this package) */
  internalEdges: number;

  /** External edge count (dependencies to other packages) */
  externalEdges: number;
}

/**
 * Result of clustering operation
 */
export interface ClusteringResult {
  /** All work packages, sorted by size (descending) */
  packages: WorkPackage[];

  /** Total number of files clustered */
  totalFiles: number;

  /** Number of packages created */
  packageCount: number;

  /** Modularity score (0-1, higher is better cluster quality) */
  modularity: number;

  /** Resolution parameter used */
  resolution: number;

  /** Files that ended up isolated (no connections to other conflict files) */
  isolatedFiles: string[];
}

/**
 * Options for clustering
 */
export interface ClusteringOptions {
  /** Target number of packages (default: 20) */
  targetPackages?: number;

  /** Minimum files per package (default: 5) */
  minPackageSize?: number;

  /** Maximum files per package (default: 15) */
  maxPackageSize?: number;

  /** Explicit resolution override (bypasses auto-tuning if set) */
  resolution?: number;

  /** Enable auto-tuning to find optimal resolution (default: true) */
  autoTune?: boolean;

  /** Include isolated files in their own package (default: true) */
  includeIsolated?: boolean;
}
```

### 6.2 Primary Function

```typescript
// src/clustering/community-detection.ts

import { DependencyGraph } from '../deps/graph';
import { ClusteringResult, ClusteringOptions } from './types';

/**
 * Cluster conflict files into work packages using Louvain community detection.
 *
 * @example
 * ```typescript
 * const graph = await builder.build('/path/to/project');
 * const conflicts = getConflictFiles();
 *
 * const result = clusterIntoWorkPackages(graph, conflicts, {
 *   targetPackages: 20,
 *   minPackageSize: 5,
 *   maxPackageSize: 15,
 * });
 *
 * console.log(`Created ${result.packageCount} packages`);
 * ```
 */
export function clusterIntoWorkPackages(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  options?: ClusteringOptions
): ClusteringResult;
```

### 6.3 Resolution Tuning Function

```typescript
// src/clustering/resolution-tuner.ts

export interface TuningResult {
  resolution: number;
  result: ClusteringResult;
  attempts: Array<{
    resolution: number;
    packageCount: number;
    modularity: number;
  }>;
}

/**
 * Find the optimal resolution parameter for the target cluster configuration.
 * Uses grid search over resolution values [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]
 */
export function findOptimalResolution(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  targetPackages?: number,
  minPackageSize?: number,
  maxPackageSize?: number
): TuningResult;
```

---

## 7. Resolution Parameter

### 7.1 Default Value

```typescript
const DEFAULT_RESOLUTION = 1.0;
```

### 7.2 Guidelines for 272 Nodes

| Resolution | Expected Package Count |
|------------|------------------------|
| 0.5 | ~8-12 (too few, too large) |
| 0.8 | ~12-18 |
| **1.0** | ~15-22 (recommended starting point) |
| **1.2** | ~18-28 |
| 1.5 | ~25-35 |
| 2.0 | ~35-50 (too many, too small) |

### 7.3 Tuning Strategy

```typescript
function scoreClusteringResult(
  result: ClusteringResult,
  targetPackages: number,
  minSize: number,
  maxSize: number
): number {
  // Package count score: penalty for deviation from target
  const countDeviation = Math.abs(result.packageCount - targetPackages);
  const countScore = Math.max(0, 10 - countDeviation);

  // Size distribution score: reward packages in optimal range
  let sizeScore = 0;
  for (const pkg of result.packages) {
    if (pkg.size >= minSize && pkg.size <= maxSize) {
      sizeScore += 1;
    } else if (pkg.size < minSize) {
      sizeScore -= 0.5;
    } else {
      sizeScore -= 1;
    }
  }

  // Modularity bonus
  const modularityScore = result.modularity * 5;

  return countScore + sizeScore + modularityScore;
}
```

### 7.4 UI Control (Optional)

```typescript
interface ResolutionSliderConfig {
  min: 0.4;
  max: 2.5;
  step: 0.1;
  default: 1.0;
}
```

---

## 8. Output Format

### 8.1 ClusteringResult Example

```typescript
{
  packages: [
    {
      id: 0,
      files: [
        '/project/src/auth/auth.service.ts',
        '/project/src/auth/auth.guard.ts',
        '/project/src/auth/login/login.component.ts',
        // ...
      ],
      size: 7,
      internalEdges: 12,
      externalEdges: 3,
    },
    // ... more packages
  ],
  totalFiles: 272,
  packageCount: 22,
  modularity: 0.47,
  resolution: 1.2,
  isolatedFiles: ['/project/src/utils/legacy-helper.ts'],
}
```

---

## 9. Test Cases

### 9.1 Graph Conversion Tests

| Test Case | Description |
|-----------|-------------|
| `converts empty conflict list to empty graph` | Edge case |
| `includes only conflict files as nodes` | Filter verification |
| `excludes external dependencies` | `external:lodash` excluded |
| `creates undirected graph` | Type verification |
| `identifies isolated nodes` | No-connection files |

### 9.2 Community Detection Tests

| Test Case | Description |
|-----------|-------------|
| `clusters connected components separately` | Basic clustering |
| `returns all conflict files in packages` | No files lost |
| `returns valid modularity score` | 0-1 range |
| `packages sorted by size descending` | Output ordering |

### 9.3 Resolution Tuning Tests

| Test Case | Description |
|-----------|-------------|
| `finds resolution producing target package count` | Within tolerance |
| `higher resolution produces more packages` | Direction check |

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

- [ ] `npm install` succeeds with new dependencies
- [ ] TypeScript compilation succeeds
- [ ] `clusterIntoWorkPackages()` returns valid result
- [ ] All conflict files appear in exactly one work package
- [ ] Isolated files are identified
- [ ] Resolution parameter affects package count
- [ ] Algorithm is deterministic

### 10.2 Performance Requirements

- [ ] Clustering 272 files completes in under 1 second
- [ ] Clustering 1000 files completes in under 5 seconds

### 10.3 Validation with Real Data

- [ ] Running on actual 272 conflict files produces 15-25 packages
- [ ] At least 70% of packages have size in 5-15 range
- [ ] Modularity score >= 0.3

---

## Appendix: Implementation Checklist

1. [ ] Create `src/clustering/` directory
2. [ ] Add `types.ts` with all interfaces
3. [ ] Implement `graph-converter.ts`
4. [ ] Implement `community-detection.ts`
5. [ ] Implement `resolution-tuner.ts`
6. [ ] Create `index.ts` with exports
7. [ ] Add dependencies to `package.json`
8. [ ] Write unit tests
9. [ ] Run on real webpos data and validate
