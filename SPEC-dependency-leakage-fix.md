# Specification: Dependency Leakage Bug Fix

## Problem Statement

The webpos-consolidator has an architectural bug where files are incorrectly identified as belonging to "clean subtrees" when they actually have undetected dependencies. This causes the migration system to move files that still have external dependencies, breaking the codebase.

The audit (`AUDIT-dependency-leakage.md`) identified 6 leak vectors. This specification addresses the three most critical:

1. **Leak #2: Circular dependencies marked dirty** - When a cycle is detected in `isCleanSubtree()`, the function returns `false`. However, cycles are safe if all files in the cycle are clean.

2. **Leak #3: Path normalization inconsistencies** - Different parts of the system use different path formats (absolute vs relative, with/without `./` prefix). This causes graph lookups to fail.

3. **Leak #4: Dependencies in graph != FileMatch.dependencies** - The `FileMatch.dependencies` array is built with filtering, but the graph contains unfiltered data. This creates representation gaps.

---

## Proposed Solutions

### Fix #1: Circular Dependency Handling (Leak #2)

**What to change:**

In `src/report/analyzer.ts`, modify the `isCleanSubtree()` method to handle cycles optimistically.

**Why this fixes it:**

The current implementation treats all cycles as dirty:
```typescript
if (visiting.has(relativePath)) {
  return false;  // Treats all cycles as dirty
}
```

This is overly conservative. A cycle A -> B -> C -> A where all three files are `status: 'clean'` should remain clean.

**Code location:** `src/report/analyzer.ts`, lines 71-74

**Implementation:**

```typescript
// BEFORE:
if (visiting.has(relativePath)) {
  return false;
}

// AFTER:
if (visiting.has(relativePath)) {
  // Cycle detected - this is safe if all nodes in the cycle are clean.
  // We're still exploring, so assume optimistically clean.
  // If any node in the cycle is dirty, it will be caught when that node
  // is evaluated directly (not via cycle detection).
  return true;
}
```

---

### Fix #2: Path Normalization (Leak #3)

**What to change:**

Create a centralized path normalization utility and apply it consistently across:
- Graph indexing (`src/deps/graph.ts`)
- Graph lookups (`getDependencies()`, `getDependents()`, `getAnalysis()`)
- FileMatch dependency building (`src/server/server-analysis.ts`)
- Clean subtree analysis (`src/report/analyzer.ts`)

**Code locations:**
- `src/deps/graph.ts` (indexing)
- `src/server/server-analysis.ts` (FileMatch building)
- `src/report/analyzer.ts` (lookups)

**Implementation:**

Add to `src/deps/graph.ts`:

```typescript
import * as path from 'path';

/**
 * Normalize a path for consistent storage and lookup.
 * Resolves to absolute, normalizes separators, and removes trailing slashes.
 */
export function normalizePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}
```

Modify `buildIndexes()` in `DependencyGraph`:

```typescript
private buildIndexes(): void {
  this.dependenciesBySource = new Map();
  this.dependentsByTarget = new Map();

  for (const edge of this.edges) {
    const normalizedSource = normalizePath(edge.source);
    const normalizedTarget = normalizePath(edge.target);

    // Index by normalized source
    if (!this.dependenciesBySource.has(normalizedSource)) {
      this.dependenciesBySource.set(normalizedSource, []);
    }
    this.dependenciesBySource.get(normalizedSource)!.push(edge);

    // Index by normalized target (skip prefixed special targets)
    if (!normalizedTarget.includes(':')) {
      if (!this.dependentsByTarget.has(normalizedTarget)) {
        this.dependentsByTarget.set(normalizedTarget, []);
      }
      this.dependentsByTarget.get(normalizedTarget)!.push(edge);
    }
  }
}
```

Modify lookup methods:

```typescript
getDependencies(filePath: string): Dependency[] {
  const normalized = normalizePath(filePath);
  return this.dependenciesBySource.get(normalized) || [];
}

getDependents(filePath: string): Dependency[] {
  const normalized = normalizePath(filePath);
  return this.dependentsByTarget.get(normalized) || [];
}

getAnalysis(filePath: string): FileAnalysis | undefined {
  const normalized = normalizePath(filePath);
  return this.nodes.get(normalized);
}
```

---

### Fix #3: Dependency List Validation (Leak #4)

**What to change:**

Add validation and tracking for symbolic dependencies that get filtered out.

**Code locations:**
- `src/report/types.ts` (add fields to interface)
- `src/server/server-analysis.ts` (populate fields)
- `src/report/analyzer.ts` (check fields)

**Implementation:**

Add to `FileMatch` interface in `src/report/types.ts`:

```typescript
export interface FileMatch {
  // ... existing fields ...

  // NEW: Track if file has symbolic deps that couldn't be resolved
  hasUnresolvedSymbolicDeps: boolean;
  // NEW: Raw dependency count from graph (before filtering)
  rawDependencyCount: number;
}
```

Modify `server-analysis.ts`:

```typescript
const graphPath = restaurantPath || retailPath;
const analysis = graphPath ? graph.getAnalysis(graphPath) : null;
const rawDeps = analysis?.dependencies || [];

// Check for symbolic dependencies that are filtered out
const symbolicPrefixes = ['symbol:', 'selector:', 'pipe:', 'directive:', 'component:', 'ngrx-'];
const hasUnresolvedSymbolicDeps = rawDeps.some(d =>
  symbolicPrefixes.some(prefix => d.target.startsWith(prefix))
);

// Filter dependencies (existing logic)
const dependencies = rawDeps
  .filter(d => /* existing filter logic */)
  .map(d => /* existing mapping */)
  .filter((p): p is string => p !== undefined && p !== '');

// Validation warning
const rawFileCount = rawDeps.filter(d =>
  !d.target.startsWith('external:') && !d.target.startsWith('unresolved:')
).length;
if (rawFileCount > 0 && dependencies.length === 0) {
  progress(`WARNING: ${relativePath} has ${rawFileCount} graph deps but 0 after filtering`);
}

fileMatches.push({
  // ... existing fields ...
  hasUnresolvedSymbolicDeps,
  rawDependencyCount: rawDeps.length,
});
```

Modify analyzer `isCleanSubtree()`:

```typescript
// NEW: Files with unresolved symbolic deps cannot be clean subtree roots
if (file.hasUnresolvedSymbolicDeps && file.dependencies.length === 0) {
  file.isCleanSubtree = false;
  this.cleanSubtreeCache.set(relativePath, false);
  return false;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/report/analyzer.ts` | Fix cycle detection, check `hasUnresolvedSymbolicDeps` flag |
| `src/deps/graph.ts` | Add `normalizePath()`, normalize paths in indexing and lookups |
| `src/server/server-analysis.ts` | Add validation, populate new fields |
| `src/report/types.ts` | Add `hasUnresolvedSymbolicDeps` and `rawDependencyCount` |

---

## Test Cases to Add

### Test: Circular Dependencies Remain Clean

```typescript
describe('circular dependency handling', () => {
  it('should mark clean cycles as clean subtrees', () => {
    // Setup: A -> B -> C -> A, all with status: 'clean'
    const fileMatches: FileMatch[] = [
      { relativePath: 'a.ts', status: 'clean', dependencies: ['b.ts'], dependents: ['c.ts'] },
      { relativePath: 'b.ts', status: 'clean', dependencies: ['c.ts'], dependents: ['a.ts'] },
      { relativePath: 'c.ts', status: 'clean', dependencies: ['a.ts'], dependents: ['b.ts'] },
    ];

    const analyzer = new ReportAnalyzer();
    const report = analyzer.analyze(fileMatches);

    expect(report.files.find(f => f.relativePath === 'a.ts')?.isCleanSubtree).toBe(true);
    expect(report.files.find(f => f.relativePath === 'b.ts')?.isCleanSubtree).toBe(true);
    expect(report.files.find(f => f.relativePath === 'c.ts')?.isCleanSubtree).toBe(true);
  });

  it('should mark dirty cycles as not clean subtrees', () => {
    // Setup: A -> B -> C -> A, where B is 'conflict'
    const fileMatches: FileMatch[] = [
      { relativePath: 'a.ts', status: 'clean', dependencies: ['b.ts'] },
      { relativePath: 'b.ts', status: 'conflict', dependencies: ['c.ts'] },
      { relativePath: 'c.ts', status: 'clean', dependencies: ['a.ts'] },
    ];

    const analyzer = new ReportAnalyzer();
    const report = analyzer.analyze(fileMatches);

    expect(report.files.find(f => f.relativePath === 'a.ts')?.isCleanSubtree).toBe(false);
    expect(report.files.find(f => f.relativePath === 'c.ts')?.isCleanSubtree).toBe(false);
  });
});
```

### Test: Path Normalization Consistency

```typescript
describe('path normalization', () => {
  it('should find dependencies regardless of path format', () => {
    const graph = new DependencyGraph(nodes, [
      { source: '/project/src/../src/a.ts', target: '/project/src/b.ts' },
    ]);

    expect(graph.getDependencies('/project/src/a.ts')).toHaveLength(1);
    expect(graph.getDependencies('/project/src/../src/a.ts')).toHaveLength(1);
  });
});
```

### Test: Symbolic Dependency Detection

```typescript
describe('symbolic dependency handling', () => {
  it('should not mark symbolic-only files as clean subtree roots', () => {
    const fileMatches: FileMatch[] = [
      {
        relativePath: 'form.ts',
        status: 'clean',
        dependencies: [],
        hasUnresolvedSymbolicDeps: true,
        rawDependencyCount: 2,
      },
    ];

    const analyzer = new ReportAnalyzer();
    const report = analyzer.analyze(fileMatches);

    expect(report.files[0].isCleanSubtree).toBe(false);
  });
});
```

---

## Acceptance Criteria

### For Leak #2 (Circular Dependencies):
- [ ] Clean cycles (all `status: 'clean'`) are marked `isCleanSubtree: true`
- [ ] Dirty cycles (any `status: 'conflict'`) are marked `isCleanSubtree: false`
- [ ] Unit tests pass for cycle scenarios

### For Leak #3 (Path Normalization):
- [ ] `graph.getDependencies()` works with any valid path format
- [ ] `graph.getAnalysis()` works with any valid path format
- [ ] Graph indexes use normalized paths consistently

### For Leak #4 (Dependency Validation):
- [ ] `FileMatch` includes `hasUnresolvedSymbolicDeps` boolean
- [ ] `FileMatch` includes `rawDependencyCount` number
- [ ] Files with ONLY symbolic dependencies are NOT marked as clean subtrees
- [ ] Warning is logged for symbolic-only files

### Integration:
- [ ] All existing tests continue to pass
- [ ] Run full analysis on test-fixture with no false positives

---

## Out of Scope

1. **Symbolic dependency resolution** - Implementing `selector:app-foo` -> file resolver
2. **Template parsing improvements** - Better regex for edge cases
3. **Performance optimization** - Caching for `normalizePath()` calls

---

## Rollout Plan

1. **Phase 1:** Implement path normalization (Fix #2) - Root cause
2. **Phase 2:** Implement validation and flagging (Fix #4) - Defensive measure
3. **Phase 3:** Implement cycle handling fix (Fix #1) - Lower priority
4. **Phase 4:** Add comprehensive test coverage
5. **Phase 5:** Validate on production codebase
