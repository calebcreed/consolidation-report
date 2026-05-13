# Dependency Leakage Audit Report

## Executive Summary

The dependency leakage bug is **architectural**, not just a single bug. It stems from multiple representations of dependencies, symbolic dependencies that can't be resolved, path normalization inconsistencies, and filtering that creates representation gaps.

The recently fixed path mismatch (BUGFIX-PLAN.md) addressed **one instance**, but underlying issues remain.

---

## 1. How Clean Subtree Detection Works

**Location:** `src/report/analyzer.ts` (lines 52-137)

**Core Algorithm:**
```
A file is in a clean subtree if:
1. The file itself is 'clean' or 'same-change' status
2. ALL of its dependencies are also in clean subtrees
3. All dependencies are within the migration set (not external)
```

**Key Function:** `isCleanSubtree(relativePath, visiting)` uses memoization + cycle detection:
- Caches results to avoid recomputation
- Detects circular dependencies
- Returns false immediately if file is dirty or any dependency is dirty

**Dependency Filtering (lines 93-97):**
- Skips `external:` prefixed dependencies (NPM packages)
- Skips `/merged/` path dependencies (already migrated)
- Skips `merged:` prefixed symbols

---

## 2. How Dependencies Are Tracked

### Module Structure: `src/deps/`

**Five extraction passes coordinated by `extractor.ts`:**

1. **Import Declarations** (`extractor-imports.ts`)
   - S1-S11: All `import` variants (relative, aliases, barrels, dynamic, etc.)
   - S7-S8: Re-exports (`export { X } from`)
   - O2-O3: Triple-slash references, require() calls

2. **Angular Metadata** (`extractor-angular.ts`)
   - A1: Constructor injection (type names extracted as `symbol:TypeName`)
   - A2: @Inject decorators with tokens (extracted as `symbol:TOKEN`)
   - A3-A6: NgModule metadata (imports/declarations/providers/exports as `symbol:ClassName`)
   - A7-A9: Template analysis (component selectors, pipes, directives as `selector:`/`pipe:`/`directive:`)

3. **NgRx Metadata** (`extractor-ngrx.ts`)
   - N1-N5: Actions, reducers, effects, selectors, feature state

4. **Path Resolution** (`resolver.ts`)
   - Resolves all specifiers to absolute file paths
   - Handles: relative, baseUrl, path aliases, barrel files
   - Returns `external:` for NPM packages, `unresolved:` for failures

5. **Dependency Graph** (`graph.ts`)
   - Indexes all dependencies by source/target
   - Provides fast lookup: `getDependencies(file)`, `getDependents(file)`

---

## 3. Known Issues and Bug Reports

### Recently Fixed: Path Normalization Mismatch (BUGFIX-PLAN.md)

**The Bug:**
- Migration validation compared relative paths with absolute paths
- `migratingFiles` set built with relative paths: `./test-fixture/apps/restaurant/...`
- ts-morph returned absolute paths: `/Users/calebcreed/.../test-fixture/apps/restaurant/...`
- Result: `migratingFiles.has(resolvedPath)` always returned false

**Fix Applied** (`src/server/state-migration.ts`):
- Use `path.resolve()` to build absolute paths
- Match what ts-morph returns

**Status:** Fixed as of April 23, 2026

### Remaining Known Issue (BUGFIX-PLAN.md, line 69-73)

Angular template symbolic dependencies (`selector:`, `pipe:`, `directive:`) cannot be resolved to file paths. They block clean subtree detection because:
- A component with `<app-foo>` selector creates a `selector:app-foo` dependency
- This cannot be resolved to the actual component file
- The analyzer marks the file as "not clean" due to unresolved dependency

---

## 4. Dependency Types Being Tracked

### Complete Classification (30+ patterns)

**TypeScript (S1-S11, O2, O3):**
- `import` - Named/default/namespace imports
- `import-type` - Type-only imports
- `import-side-effect` - Bare `import './file'`
- `import-dynamic` - `await import()`
- `require` - CommonJS
- `export-from` - Re-exports
- `triple-slash` - `/// <reference path="..."/>`

**Angular (A1-A12):**
- `injection` - Constructor parameter types
- `inject-token` - @Inject(TOKEN) decorators
- `ngmodule-import` - NgModule.imports array (SYMBOLIC: `symbol:ModuleName`)
- `ngmodule-declaration` - NgModule.declarations array
- `ngmodule-provider` - NgModule.providers array
- `ngmodule-export` - NgModule.exports array
- `template-component` - `<app-foo>` selectors (SYMBOLIC: `selector:app-foo`)
- `template-pipe` - `{{ x | pipeName }}` (SYMBOLIC: `pipe:pipeName`)
- `template-directive` - `[appDirective]` (SYMBOLIC: `directive:appDirective`)
- `lazy-route` - `loadChildren` dynamic imports

**NgRx (N1-N5):**
- `ngrx-action` - Actions referenced in reducers/effects
- `ngrx-selector` - Selectors usage
- `ngrx-feature` - StoreModule.forFeature references

**Special Prefixes:**
- `external:` - NPM packages (@angular, @ngrx, rxjs, etc.)
- `unresolved:` - Imports that couldn't be resolved
- `symbol:` - TypeScript symbols (injection tokens, class names)
- `selector:`, `pipe:`, `directive:` - Angular template references

---

## 5. Leak Vectors Identified

### Leak #1: Symbolic Dependencies Not Resolved to Files

**Location:** `src/server/server-analysis.ts` (lines 94-105)

Symbolic dependencies are **filtered out** when building FileMatch.dependencies, but they're still in the graph. If a file has ONLY symbolic dependencies, it appears to have no dependencies and incorrectly qualifies as a clean subtree root.

**Example:**
```typescript
// form-state.interface.ts - only used via template selectors
export interface FormState { ... }

// store.component.ts
@Component({
  selector: 'app-store',
  template: `<div *ngIf="formState$ | async"></div>`
})
```

The interface has no real file imports, only symbolic pipe dependencies. Analyzer sees it as having no dependencies → marks as clean subtree root.

### Leak #2: Circular Dependencies Marked Dirty

**Location:** `src/report/analyzer.ts` (lines 65-74)

```typescript
if (visiting.has(relativePath)) {
  return false;  // ← Returns false on cycle
}
```

**The Bug:** When a cycle is detected, the function returns `false`. But cycles are **safe** if all files in the cycle are clean! A → B → C → A where all are clean should remain clean.

**Example:**
```typescript
// service-a.ts
import { ServiceB } from './service-b';

// service-b.ts
import { ServiceA } from './service-a';  // Circular!
```

Both files are identical between branches (clean). But cycle detection marks them as "not clean."

### Leak #3: Path Normalization Inconsistencies

**Locations:** `src/deps/graph.ts`, `src/report/analyzer.ts`

If `edge.source` and `edge.target` use different path formats (absolute vs relative, with/without `./` prefix), the index has orphaned edges.

**Result:**
- `graph.getDependencies()` returns empty (edge.source doesn't match)
- But the actual dependency exists in the file
- Migration proceeds with incomplete dependency information

### Leak #4: Dependency List vs. Graph Mismatch

The `FileMatch.dependencies[]` array (built with filtering) may not match what's in the dependency graph (unfiltered).

### Leak #5: Fuzzy Path Matching Can Match Wrong Files

**Location:** `src/report/analyzer.ts` (lines 102-122)

`findMatchingFile()` uses suffix matching. If path stripping isn't consistent, it might match `retail-service.ts` when looking for `service.ts`.

### Leak #6: Template Parsing Regex Gaps

**Location:** `src/deps/extractor-angular.ts` (lines 338-380)

- Regex misses valid selectors or creates false positives
- No semantic understanding of pipes vs other uses of `|`
- Can't know if a template selector is scoped or global

---

## 6. Summary of Leak Vectors

| # | Leak Vector | Likelihood | Severity | Root Cause |
|---|-------------|------------|----------|-----------|
| 1 | Symbolic-only files in clean subtrees | Low | High | Template deps not resolved to files |
| 2 | Circular dependencies marked dirty | Low | High | Cycle detection too conservative |
| 3 | Path normalization mismatch | Medium | High | Mixed absolute/relative paths |
| 4 | Dependencies in graph != FileMatch.dependencies | Medium | High | Filtering inconsistency |
| 5 | Fuzzy path matching wrong files | Medium | Medium | Suffix matching ambiguity |
| 6 | Template parsing false positives | Medium | Low | Regex patterns incomplete |

---

## 7. Recommendations

### Immediate: Fix Circular Dependency Handling

```typescript
if (visiting.has(relativePath)) {
  // Cycle detected - assume clean if we're still exploring
  // The actual result will be memoized when recursion unwinds
  return true;  // Optimistic: cycles are OK if all nodes are clean
}
```

### Immediate: Add Validation Test

```typescript
// In analyzer.ts markCleanSubtrees()
// Assert: file.dependencies === graph.getDependencies(file).map(d => d.target)
```

### Short-term: Normalize All Paths Consistently

- Decide: absolute or relative for internal representation
- Apply consistently in: graph building, analysis, migration validation
- Add utility: `normalizePathForComparison(path)`

### Short-term: Resolve Symbolic Dependencies

Implement mapping:
- `selector:app-foo` → Find component with selector="app-foo" → Resolve to file
- `pipe:capitalizer` → Find @Pipe('capitalizer') → Resolve to file
- `symbol:ServiceName` → Find class ServiceName → Resolve to file

### Medium-term: Add Pre-Migration Dependency Audit

Before marking a file as "clean subtree," verify:
```typescript
const fileDeps = graph.getDependencies(file);
const reportDeps = fileMatch.dependencies;
if (fileDeps.length !== reportDeps.length) {
  warn(`Dependency count mismatch: graph has ${fileDeps.length}, report has ${reportDeps.length}`);
}
```

---

## 8. Conclusion

The dependency leakage bug is architectural. It stems from:

1. **Multiple representations** of dependencies (graph vs. report)
2. **Symbolic dependencies** that can't be resolved to files
3. **Path normalization** inconsistencies across modules
4. **Conservative cycle detection** that marks clean cycles as dirty
5. **Filtering** that creates representation gaps between graph and FileMatch

The fix requires addressing multiple components, not just patching one location.
