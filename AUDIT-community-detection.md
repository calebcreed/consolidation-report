# AUDIT: Community Detection Algorithms for Dependency Graph Clustering

**Project:** webpos-consolidator
**Task:** #4 - Cluster ~272 conflict files into logical work packages
**Date:** 2026-05-11

---

## Executive Summary

This audit evaluates community detection algorithms for clustering 272 TypeScript/Angular conflict files from a ~900 file dependency graph into work packages of 5-15 files each (targeting 15-25 clusters). **Louvain algorithm** is recommended as the best fit due to its tunability via resolution parameter, deterministic results, and excellent JavaScript library support through graphology.

---

## 1. Algorithm Comparison

### 1.1 Louvain Algorithm

**How it works:**
- Two-phase iterative approach that optimizes modularity
- **Phase 1:** Each node starts in its own community. Nodes are moved to neighboring communities if it increases modularity
- **Phase 2:** Communities are aggregated into "super-nodes" creating a new graph
- Phases repeat until no further modularity improvement is possible
- Time complexity: O(n log n) for sparse graphs

**Pros:**
- Fast and scalable (handles millions of nodes)
- Produces hierarchical community structure
- **Resolution parameter** allows tuning cluster granularity
- Deterministic with consistent results
- Well-understood and widely used
- Excellent library support (graphology-communities-louvain)

**Cons:**
- May miss small communities (resolution limit)
- Resolution parameter requires tuning

**Resolution Parameter:**
- Default is typically 1.0
- Higher values (>1) = more, smaller communities
- Lower values (<1) = fewer, larger communities
- For 272 nodes targeting ~20 clusters: start with resolution ~1.0-1.5

---

### 1.2 Label Propagation Algorithm (LPA)

**How it works:**
- Each node starts with a unique label
- Iteratively, each node adopts the most frequent label among its neighbors
- Process continues until labels stabilize
- Near-linear time complexity: O(m) where m = edges

**Pros:**
- Extremely fast (fastest of the three)
- No parameters to tune
- Simple to implement

**Cons:**
- **Non-deterministic** - different runs produce different results
- Sensitive to node processing order
- No resolution control - cannot tune cluster sizes
- Poor for small/medium graphs

---

### 1.3 Infomap Algorithm

**How it works:**
- Based on information theory and random walks
- Minimizes the description length of a random walk on the graph
- Uses the "map equation" to find optimal community structure

**Pros:**
- Finds natural flow-based communities
- Handles directed graphs well
- Produces hierarchical structure

**Cons:**
- Slower than Louvain and LPA
- **Limited JavaScript library support** - no mature npm package
- No simple resolution parameter for tuning

---

### 1.4 Recommendation: Louvain

| Factor | Louvain | Label Propagation | Infomap |
|--------|---------|-------------------|---------|
| Cluster count control | Resolution param | None | Limited |
| Determinism | Yes | No | Yes |
| JS Library | Excellent | Good | Poor |
| Speed | Fast | Fastest | Moderate |
| Fit for dependencies | Excellent | Poor | Moderate |

**Decision:** Louvain with graphology-communities-louvain

---

## 2. JavaScript Libraries

### 2.1 graphology + graphology-communities-louvain (Recommended)

**Installation:**
```bash
npm install graphology graphology-communities-louvain
npm install -D @types/graphology  # TypeScript types
```

**Basic API:**

```typescript
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

// Create graph
const graph = new Graph({ type: 'directed' });

// Add nodes
graph.addNode('fileA.ts');
graph.addNode('fileB.ts');
graph.addNode('fileC.ts');

// Add edges (dependencies)
graph.addEdge('fileA.ts', 'fileB.ts');  // fileA imports fileB
graph.addEdge('fileB.ts', 'fileC.ts');

// Run Louvain - returns node -> community mapping
const communities = louvain(graph, { resolution: 1.2 });
// Result: { 'fileA.ts': 0, 'fileB.ts': 0, 'fileC.ts': 1 }
```

**Detailed API with metadata:**

```typescript
import louvain from 'graphology-communities-louvain';

// Get detailed results including modularity score
const details = louvain.detailed(graph, {
  resolution: 1.2,
  randomWalk: true  // Better quality, slightly slower
});

// Returns:
// {
//   communities: { 'fileA.ts': 0, 'fileB.ts': 0, ... },
//   count: 23,           // Number of communities found
//   modularity: 0.45,    // Quality score (0-1, higher is better)
//   deltaComputations: 1234
// }
```

**Full options:**

```typescript
louvain(graph, {
  resolution?: number,      // Default: 1. Higher = more communities
  getEdgeWeight?: string | ((edge: string) => number),
  randomWalk?: boolean,     // Default: false. True = better quality
  weighted?: boolean,       // Default: false. Use edge weights
});
```

---

## 3. Integration with webpos-consolidator

### 3.1 Current Graph Structure

The existing `DependencyGraph` class in `/src/deps/graph.ts` uses:

```typescript
class DependencyGraph {
  private nodes: Map<string, FileAnalysis>;
  private edges: Dependency[];

  getFiles(): string[]
  getDependencies(filePath): Dependency[]
  getDependents(filePath): Dependency[]
}

interface Dependency {
  type: DependencyType;
  source: string;   // Absolute path of importing file
  target: string;   // Resolved path (or 'external:package')
  specifier: string;
  line: number;
  column: number;
}
```

### 3.2 Conversion to graphology

```typescript
import Graph from 'graphology';
import { DependencyGraph } from './deps/graph';

function toGraphology(
  depGraph: DependencyGraph,
  conflictFiles: string[]
): Graph {
  const graph = new Graph({ type: 'undirected' });
  const conflictSet = new Set(conflictFiles);

  // Add only conflict files as nodes
  for (const file of conflictFiles) {
    graph.addNode(file);
  }

  // Add edges only between conflict files
  for (const file of conflictFiles) {
    const deps = depGraph.getDependencies(file);

    for (const dep of deps) {
      // Skip non-file dependencies
      if (dep.target.startsWith('external:') ||
          dep.target.startsWith('unresolved:') ||
          dep.target.startsWith('symbol:') ||
          dep.target.startsWith('selector:') ||
          dep.target.startsWith('pipe:') ||
          dep.target.startsWith('directive:') ||
          dep.target.startsWith('ngrx-')) {
        continue;
      }

      // Only add edge if target is also a conflict file
      if (conflictSet.has(dep.target)) {
        if (!graph.hasEdge(file, dep.target)) {
          graph.addEdge(file, dep.target);
        }
      }
    }
  }

  return graph;
}
```

**Why undirected?**
- Louvain works on undirected graphs
- For clustering, "A imports B" and "B imports A" both represent coupling
- graphology-communities-louvain treats the graph as undirected internally

### 3.3 Output Format

```typescript
// Direct output from louvain()
{
  '/path/to/file1.ts': 0,
  '/path/to/file2.ts': 0,
  '/path/to/file3.ts': 1,
  '/path/to/file4.ts': 2,
}

// After grouping into clusters Map
Map {
  0 => ['/path/to/file1.ts', '/path/to/file2.ts'],
  1 => ['/path/to/file3.ts'],
  2 => ['/path/to/file4.ts', '/path/to/file5.ts', '/path/to/file6.ts'],
}
```

---

## 4. Tuning for Target Cluster Count

### 4.1 Resolution Parameter Guidelines

For 272 nodes targeting 15-25 clusters:

| Resolution | Expected Effect |
|------------|-----------------|
| 0.5 | ~8-12 large clusters |
| 0.8 | ~12-18 clusters |
| **1.0** | ~15-22 clusters (start here) |
| **1.2** | ~18-28 clusters |
| 1.5 | ~25-35 clusters |
| 2.0 | ~35-50 clusters |

### 4.2 Tuning Strategy

```typescript
function findOptimalResolution(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  targetMin: number = 15,
  targetMax: number = 25
): { resolution: number; result: ClusterResult } {

  const resolutions = [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
  let bestResult: ClusterResult | null = null;
  let bestResolution = 1.0;
  let bestScore = -Infinity;

  for (const resolution of resolutions) {
    const result = clusterConflictFiles(depGraph, conflictFiles, resolution);

    const countScore = (result.count >= targetMin && result.count <= targetMax)
      ? 10 : -Math.abs(result.count - (targetMin + targetMax) / 2);

    let sizeScore = 0;
    for (const [, files] of result.clusters) {
      if (files.length >= 5 && files.length <= 15) {
        sizeScore += 1;
      } else {
        sizeScore -= 0.5;
      }
    }

    const totalScore = countScore + sizeScore + result.modularity * 5;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestResult = result;
      bestResolution = resolution;
    }
  }

  return { resolution: bestResolution, result: bestResult! };
}
```

### 4.3 Handling Edge Cases

**Very small clusters (1-3 files):**
- Post-process: merge into nearest neighbor cluster

**Very large clusters (>15 files):**
- Increase resolution and re-run
- Or recursively apply Louvain with higher resolution

**Disconnected components:**
- Files with no connections form singleton clusters
- Consider grouping by directory structure as fallback

---

## 5. Complete Integration Example

```typescript
// src/clustering/community-detection.ts

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { DependencyGraph } from '../deps/graph';

export interface WorkPackage {
  id: number;
  files: string[];
  size: number;
}

export interface ClusteringResult {
  packages: WorkPackage[];
  totalFiles: number;
  modularity: number;
  resolution: number;
}

export function clusterIntoWorkPackages(
  depGraph: DependencyGraph,
  conflictFiles: string[],
  options: {
    targetPackages?: number;
    minPackageSize?: number;
    maxPackageSize?: number;
  } = {}
): ClusteringResult {
  const {
    targetPackages = 20,
    minPackageSize = 5,
    maxPackageSize = 15
  } = options;

  // 1. Convert to graphology
  const graph = new Graph({ type: 'undirected' });
  const conflictSet = new Set(conflictFiles);

  for (const file of conflictFiles) {
    graph.addNode(file);
  }

  for (const file of conflictFiles) {
    for (const dep of depGraph.getDependencies(file)) {
      if (!dep.target.startsWith('external:') &&
          !dep.target.startsWith('unresolved:') &&
          !dep.target.startsWith('symbol:') &&
          conflictSet.has(dep.target) &&
          !graph.hasEdge(file, dep.target)) {
        graph.addEdge(file, dep.target);
      }
    }
  }

  // 2. Find optimal resolution
  const avgTargetSize = conflictFiles.length / targetPackages;
  let resolution = 1.0;
  if (avgTargetSize > 15) resolution = 0.8;
  if (avgTargetSize < 10) resolution = 1.4;

  // 3. Run Louvain
  const result = louvain.detailed(graph, {
    resolution,
    randomWalk: true
  });

  // 4. Convert to work packages
  const clusterMap = new Map<number, string[]>();
  for (const [file, clusterId] of Object.entries(result.communities)) {
    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, []);
    }
    clusterMap.get(clusterId)!.push(file);
  }

  const packages: WorkPackage[] = Array.from(clusterMap.entries())
    .map(([id, files]) => ({
      id,
      files: files.sort(),
      size: files.length
    }))
    .sort((a, b) => b.size - a.size);

  return {
    packages,
    totalFiles: conflictFiles.length,
    modularity: result.modularity,
    resolution
  };
}
```

---

## 6. Summary

### Recommended Approach

1. **Install:** `npm install graphology graphology-communities-louvain`
2. **Create** clustering module at `src/clustering/community-detection.ts`
3. **Initial run:** Use resolution 1.0, evaluate cluster distribution
4. **Tune:** Adjust resolution (0.8-1.4 range)
5. **Post-process:** Handle edge cases (tiny/large clusters)

### Key Parameters

| Parameter | Recommended Value |
|-----------|-------------------|
| Graph type | `undirected` |
| Resolution | Start at `1.0`, try `0.8-1.4` |
| randomWalk | `true` (better quality) |
| Target clusters | 15-25 |
| Min cluster size | 5 files |
| Max cluster size | 15 files |

### Expected Outcome

Running Louvain on 272 conflict files with resolution ~1.0-1.2 should produce approximately 18-22 work packages, with most packages containing 8-15 tightly coupled files that make sense to migrate together.
