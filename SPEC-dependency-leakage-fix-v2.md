# Specification: Dependency Leakage Fix (Comprehensive)

**Version:** 2.0
**Date:** 2026-05-12
**Based on:** AUDIT-dependency-leakage-v2.md (25 leak vectors)

---

## Overview

This spec addresses **15 of the 25 identified leak vectors** - all Tier 1 (Critical) and Tier 2 (High), plus select Tier 3 issues. The remaining 10 are deferred to a future hardening pass.

---

## Phase 1: Critical Fixes (Tier 1)

### Fix 1.1: Build Graph From BOTH Branches
**Addresses:** LEAK #2 (Graph only includes restaurant)

**Problem:** Files only in retail have zero dependencies tracked.

**Solution:** Build two graphs and merge, or build from a combined file list.

**File:** `src/server/server-analysis.ts`

```typescript
// BEFORE (line ~40):
const graph = await builder.build(restaurantSrcDir, { ... });

// AFTER:
// Build from both directories
const retailFiles = await scanDirectory(retailSrcDir);
const restaurantFiles = await scanDirectory(restaurantSrcDir);
const allFiles = [...new Set([...retailFiles, ...restaurantFiles])];
const graph = await builder.buildFromFiles(allFiles, { ... });
```

**New method in `src/deps/graph.ts`:**

```typescript
/**
 * Build graph from explicit file list (supports multiple directories)
 */
async buildFromFiles(files: string[], options?: BuildOptions): Promise<DependencyGraph> {
  const nodes = new Map<string, FileAnalysis>();
  const allEdges: Dependency[] = [];

  for (const file of files) {
    const analysis = this.extractor.extract(file);
    const normalizedPath = normalizePath(analysis.path);
    nodes.set(normalizedPath, { ...analysis, path: normalizedPath });
    allEdges.push(...analysis.dependencies);
  }

  return new DependencyGraph(nodes, allEdges);
}
```

**Test:**
```typescript
it('includes retail-only files in graph', () => {
  // Create file only in retail/
  // Verify graph.getAnalysis() returns it
  // Verify its dependencies are tracked
});
```

---

### Fix 1.2: Track Unresolved Imports (Don't Silently Drop)
**Addresses:** LEAK #4 (Unresolved imports silently ignored)

**Problem:** Files with unresolved imports marked clean.

**Solution:** Add `hasUnresolvedImports` flag, block clean subtree status.

**File:** `src/report/types.ts`

```typescript
export interface FileMatch {
  // ... existing fields ...

  /** True if file has imports that couldn't be resolved */
  hasUnresolvedImports: boolean;

  /** List of unresolved import specifiers */
  unresolvedImports: string[];
}
```

**File:** `src/server/server-analysis.ts`

```typescript
// Extract unresolved imports BEFORE filtering
const unresolvedImports = rawDeps
  .filter(d => d.target.startsWith('unresolved:'))
  .map(d => d.specifier);

const hasUnresolvedImports = unresolvedImports.length > 0;

// Log warning
if (hasUnresolvedImports) {
  progress(`WARNING: ${relativePath} has ${unresolvedImports.length} unresolved imports: ${unresolvedImports.slice(0, 3).join(', ')}${unresolvedImports.length > 3 ? '...' : ''}`);
}

fileMatches.push({
  // ... existing fields ...
  hasUnresolvedImports,
  unresolvedImports,
});
```

**File:** `src/report/analyzer.ts`

```typescript
// In isCleanSubtree():
if (file.hasUnresolvedImports) {
  // Cannot safely migrate - unknown dependencies
  file.isCleanSubtree = false;
  this.cleanSubtreeCache.set(relativePath, false);
  return false;
}
```

---

### Fix 1.3: Track Symbol Dependencies (Don't Silently Filter)
**Addresses:** LEAK #5 (Symbol dependencies filtered without validation)

**Problem:** Pipes, directives, components invisible to clean subtree detection.

**Solution:** Track symbolic deps separately, flag files that have them.

**File:** `src/report/types.ts`

```typescript
export interface FileMatch {
  // ... existing fields ...

  /** True if file has symbolic deps (selectors, pipes, directives, symbols) */
  hasSymbolicDependencies: boolean;

  /** Count of symbolic dependencies */
  symbolicDependencyCount: number;

  /** The symbolic dependency targets (for debugging) */
  symbolicDependencies: string[];
}
```

**File:** `src/server/server-analysis.ts`

```typescript
const symbolicPrefixes = ['symbol:', 'selector:', 'pipe:', 'directive:', 'component:', 'ngrx-'];

const symbolicDeps = rawDeps.filter(d =>
  symbolicPrefixes.some(prefix => d.target.startsWith(prefix))
);

const hasSymbolicDependencies = symbolicDeps.length > 0;
const symbolicDependencyCount = symbolicDeps.length;
const symbolicDependencies = symbolicDeps.map(d => d.target);

// Warn if file has ONLY symbolic deps (looks like zero deps after filtering)
if (hasSymbolicDependencies && dependencies.length === 0) {
  progress(`WARNING: ${relativePath} has ${symbolicDependencyCount} symbolic deps but 0 file deps - may have hidden dependencies`);
}
```

**File:** `src/report/analyzer.ts`

```typescript
// In isCleanSubtree():
// Files with ONLY symbolic deps (no file deps) are risky
if (file.hasSymbolicDependencies && file.dependencies.length === 0) {
  // Conservative: don't mark as clean subtree root
  // These files have dependencies we can't validate
  file.isCleanSubtree = false;
  this.cleanSubtreeCache.set(relativePath, false);
  return false;
}
```

---

### Fix 1.4: Fix Circular Dependency Handling
**Addresses:** LEAK #6 (Circular dependencies return false)

**Problem:** Clean cycles wrongly marked dirty.

**Solution:** Return true for cycles (optimistic), let dirty detection happen on direct evaluation.

**File:** `src/report/analyzer.ts`

```typescript
// BEFORE (line ~71):
if (visiting.has(relativePath)) {
  return false;
}

// AFTER:
if (visiting.has(relativePath)) {
  // Cycle detected. If we're still visiting this node, we haven't
  // proven it dirty yet. Return true optimistically.
  // If any node in the cycle IS dirty, it will be caught when
  // that node is evaluated directly (not via back-edge).
  return true;
}
```

**Test:**
```typescript
describe('circular dependency handling', () => {
  it('marks clean cycles as clean subtrees', () => {
    const files = [
      { relativePath: 'a.ts', status: 'clean', dependencies: ['b.ts'] },
      { relativePath: 'b.ts', status: 'clean', dependencies: ['c.ts'] },
      { relativePath: 'c.ts', status: 'clean', dependencies: ['a.ts'] },
    ];
    const result = analyzer.analyze(files);
    expect(result.files.every(f => f.isCleanSubtree)).toBe(true);
  });

  it('marks dirty cycles as not clean', () => {
    const files = [
      { relativePath: 'a.ts', status: 'clean', dependencies: ['b.ts'] },
      { relativePath: 'b.ts', status: 'conflict', dependencies: ['a.ts'] },
    ];
    const result = analyzer.analyze(files);
    expect(result.files.every(f => !f.isCleanSubtree)).toBe(true);
  });
});
```

---

## Phase 2: High Priority Fixes (Tier 2)

### Fix 2.1: Centralized Path Normalization
**Addresses:** LEAK #3 (Case sensitivity), LEAK #10 (Path normalization inconsistent)

**Problem:** Paths compared inconsistently across modules.

**Solution:** Single normalization function used everywhere.

**File:** `src/deps/path-utils.ts` (NEW)

```typescript
import * as path from 'path';
import * as fs from 'fs';

/**
 * Normalize a path for consistent comparison.
 * - Resolves to absolute
 * - Normalizes separators
 * - Optionally normalizes case for case-insensitive filesystems
 */
export function normalizePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const normalized = path.normalize(resolved);

  // On macOS/Windows, normalize case to match actual filesystem
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return normalizeCase(normalized);
  }

  return normalized;
}

/**
 * Get the actual case of a path from the filesystem.
 * Falls back to input if file doesn't exist.
 */
function normalizeCase(filePath: string): string {
  try {
    // fs.realpathSync.native returns the actual case on disk
    return fs.realpathSync.native(filePath);
  } catch {
    // File doesn't exist, return as-is
    return filePath;
  }
}

/**
 * Compare two paths for equality, handling normalization.
 */
export function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

/**
 * Create a normalized path key for Map/Set usage.
 */
export function pathKey(filePath: string): string {
  return normalizePath(filePath);
}
```

**Update all files to use this:**
- `src/deps/graph.ts` - index building and lookups
- `src/deps/resolver.ts` - path resolution
- `src/server/server-analysis.ts` - path comparisons
- `src/report/analyzer.ts` - file matching
- `src/server/state-migration.ts` - migration validation

---

### Fix 2.2: Track Transitive Dependencies Through Barrels
**Addresses:** LEAK #7 (Barrel files don't track transitive deps)

**Problem:** Importing from `index.ts` hides the real source file.

**Solution:** When resolving a barrel, also record the transitive target.

**File:** `src/deps/resolver.ts`

```typescript
interface ResolveResult {
  /** The direct target (may be barrel file) */
  target: string;
  /** If target is barrel, the ultimate source file */
  transitiveTarget?: string;
  /** Whether this went through a barrel */
  viaBarrel: boolean;
}

resolveImport(specifier: string, fromFile: string): ResolveResult {
  const resolved = this.resolveToFile(specifier, fromFile);

  // Check if it's a barrel (index.ts)
  if (resolved.endsWith('/index.ts') || resolved.endsWith('/index.js')) {
    // Parse the barrel to find re-exports
    const reexports = this.parseBarrelReexports(resolved);
    // If single re-export matches the import, track it
    const transitiveTarget = this.findTransitiveTarget(reexports, specifier);

    return {
      target: resolved,
      transitiveTarget,
      viaBarrel: true,
    };
  }

  return { target: resolved, viaBarrel: false };
}
```

**File:** `src/deps/types.ts`

```typescript
export interface Dependency {
  type: DependencyType;
  source: string;
  target: string;
  specifier: string;
  line: number;
  column: number;

  // NEW: Track barrel transitive deps
  transitiveTarget?: string;
  viaBarrel?: boolean;
}
```

**File:** `src/report/analyzer.ts`

```typescript
// When checking dependencies, also check transitiveTarget
for (const depPath of file.dependencies) {
  const dep = this.getDependencyInfo(depPath);

  // Check both the barrel AND the transitive target
  const targetsToCheck = [depPath];
  if (dep?.transitiveTarget) {
    targetsToCheck.push(dep.transitiveTarget);
  }

  for (const target of targetsToCheck) {
    if (!this.isCleanSubtree(target, visiting)) {
      file.isCleanSubtree = false;
      return false;
    }
  }
}
```

---

### Fix 2.3: Improve findMatchingFile() to Avoid False Positives
**Addresses:** LEAK #11 (findMatchingFile() false positives)

**Problem:** First suffix match used, may be wrong file.

**Solution:** Match more path segments, prefer exact matches.

**File:** `src/report/analyzer.ts`

```typescript
private findMatchingFile(depPath: string): string | null {
  // Normalize the dependency path
  const normalizedDep = normalizePath(depPath);

  // Try exact match first
  if (this.files.has(normalizedDep)) {
    return normalizedDep;
  }

  // Try matching by relative path components
  const depParts = depPath.split('/').filter(Boolean);
  const candidates: Array<{ path: string; matchedSegments: number }> = [];

  for (const key of this.files.keys()) {
    const keyParts = key.split('/').filter(Boolean);

    // Count matching segments from the end
    let matchedSegments = 0;
    for (let i = 1; i <= Math.min(depParts.length, keyParts.length); i++) {
      if (depParts[depParts.length - i] === keyParts[keyParts.length - i]) {
        matchedSegments++;
      } else {
        break;
      }
    }

    if (matchedSegments > 0) {
      candidates.push({ path: key, matchedSegments });
    }
  }

  // Sort by most matched segments
  candidates.sort((a, b) => b.matchedSegments - a.matchedSegments);

  // Require at least 2 segments to match (filename + parent dir)
  if (candidates.length > 0 && candidates[0].matchedSegments >= 2) {
    // Warn if ambiguous (multiple with same score)
    if (candidates.length > 1 &&
        candidates[0].matchedSegments === candidates[1].matchedSegments) {
      console.warn(`Ambiguous path match for ${depPath}: ${candidates.slice(0, 2).map(c => c.path).join(', ')}`);
    }
    return candidates[0].path;
  }

  return null;
}
```

---

## Phase 3: Important Fixes (Select Tier 3)

### Fix 3.1: Warn on Dynamic Imports
**Addresses:** LEAK #1 (Dynamic imports via template strings)

**Problem:** Computed import paths invisible.

**Solution:** Detect and warn (can't fully resolve, but can flag).

**File:** `src/deps/extractor-imports.ts`

```typescript
// After extracting standard dynamic imports, check for computed ones
const dynamicImportRegex = /import\s*\(\s*([^)]+)\s*\)/g;
let match;
while ((match = dynamicImportRegex.exec(sourceText)) !== null) {
  const arg = match[1].trim();

  // If not a simple string literal, it's computed
  if (!arg.startsWith("'") && !arg.startsWith('"') && !arg.startsWith('`')) {
    dependencies.push({
      type: 'import-dynamic-computed',
      source: filePath,
      target: `computed:${arg}`,
      specifier: arg,
      line: this.getLineNumber(match.index),
      column: 0,
    });
  }
}
```

**File:** `src/server/server-analysis.ts`

```typescript
// Flag files with computed imports
const hasComputedImports = rawDeps.some(d => d.target.startsWith('computed:'));

if (hasComputedImports) {
  progress(`WARNING: ${relativePath} has computed dynamic imports - cannot track all dependencies`);
}
```

---

### Fix 3.2: Expand Template Parsing Regex
**Addresses:** LEAK #9 (Template regex too restrictive)

**Problem:** Uppercase components, single-word components missed.

**Solution:** More permissive regex.

**File:** `src/deps/extractor-angular.ts`

```typescript
// BEFORE:
const componentRegex = /<([a-z]+-[a-z0-9-]+)/g;

// AFTER:
// Match any custom element (contains hyphen OR starts with app/ng prefix)
const componentRegex = /<([a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9-]*)|<(app[A-Z][a-zA-Z0-9]*)|<(ng[A-Z][a-zA-Z0-9]*)/gi;

// Also detect ngComponentOutlet
const componentOutletRegex = /\*ngComponentOutlet\s*=\s*["']?\s*(\w+)/g;
```

---

### Fix 3.3: Validate Migration Before Execution
**Addresses:** LEAK #12 (Migration validation skips unresolved)

**Problem:** Pre-flight check incomplete.

**Solution:** Add comprehensive pre-migration validation.

**File:** `src/server/state-migration.ts`

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateMigration(
  filesToMigrate: string[],
  fileMatches: Map<string, FileMatch>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const filePath of filesToMigrate) {
    const match = fileMatches.get(filePath);
    if (!match) {
      errors.push(`File not in analysis: ${filePath}`);
      continue;
    }

    // Check for unresolved imports
    if (match.hasUnresolvedImports) {
      errors.push(`${filePath} has unresolved imports: ${match.unresolvedImports.join(', ')}`);
    }

    // Warn about symbolic dependencies
    if (match.hasSymbolicDependencies) {
      warnings.push(`${filePath} has ${match.symbolicDependencyCount} symbolic dependencies that cannot be validated`);
    }

    // Check that all dependencies are either:
    // 1. In the migration set
    // 2. Already in merged/
    // 3. External
    for (const dep of match.dependencies) {
      const depMatch = fileMatches.get(dep);
      if (depMatch && depMatch.status === 'conflict' && !filesToMigrate.includes(dep)) {
        errors.push(`${filePath} depends on ${dep} which is a conflict not in migration set`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

## Phase 4: Validation & Logging

### Add Dependency Count Validation
**Addresses:** LEAK #25 (Dependency count mismatch not validated)

**File:** `src/server/server-analysis.ts`

```typescript
// After building FileMatch, validate counts
const graphDepCount = rawDeps.filter(d =>
  !d.target.startsWith('external:')
).length;

const fileMatchDepCount = dependencies.length +
  unresolvedImports.length +
  symbolicDependencyCount;

if (Math.abs(graphDepCount - fileMatchDepCount) > 2) {
  progress(`WARNING: ${relativePath} dependency count mismatch - graph: ${graphDepCount}, tracked: ${fileMatchDepCount}`);
}
```

### Add Summary Logging

```typescript
// At end of analysis
const stats = {
  totalFiles: fileMatches.length,
  cleanFiles: fileMatches.filter(f => f.status === 'clean').length,
  conflictFiles: fileMatches.filter(f => f.status === 'conflict').length,
  filesWithUnresolvedImports: fileMatches.filter(f => f.hasUnresolvedImports).length,
  filesWithSymbolicDeps: fileMatches.filter(f => f.hasSymbolicDependencies).length,
  filesWithComputedImports: fileMatches.filter(f => f.hasComputedImports).length,
};

progress(`Analysis complete:`);
progress(`  Total: ${stats.totalFiles}`);
progress(`  Clean: ${stats.cleanFiles}`);
progress(`  Conflicts: ${stats.conflictFiles}`);
progress(`  With unresolved imports: ${stats.filesWithUnresolvedImports}`);
progress(`  With symbolic deps: ${stats.filesWithSymbolicDeps}`);
progress(`  With computed imports: ${stats.filesWithComputedImports}`);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/deps/path-utils.ts` | NEW - centralized path normalization |
| `src/deps/graph.ts` | Use path-utils, add buildFromFiles() |
| `src/deps/resolver.ts` | Track transitive barrel deps, use path-utils |
| `src/deps/types.ts` | Add transitiveTarget, viaBarrel to Dependency |
| `src/deps/extractor-imports.ts` | Detect computed dynamic imports |
| `src/deps/extractor-angular.ts` | Expand template regex |
| `src/report/types.ts` | Add unresolved/symbolic/computed flags |
| `src/report/analyzer.ts` | Fix cycle handling, improve findMatchingFile, check new flags |
| `src/server/server-analysis.ts` | Build dual-branch graph, track all new flags, validate counts |
| `src/server/state-migration.ts` | Add pre-migration validation |

---

## New Fields on FileMatch

```typescript
export interface FileMatch {
  // Existing
  relativePath: string;
  retailPath: string | null;
  restaurantPath: string | null;
  status: FileStatus;
  diff: DiffResult;
  unifiedDiff?: string;
  isCleanSubtree: boolean;
  dependencies: string[];
  dependents: string[];
  linesChanged?: number;

  // NEW: Unresolved imports
  hasUnresolvedImports: boolean;
  unresolvedImports: string[];

  // NEW: Symbolic dependencies
  hasSymbolicDependencies: boolean;
  symbolicDependencyCount: number;
  symbolicDependencies: string[];

  // NEW: Computed/dynamic imports
  hasComputedImports: boolean;
  computedImports: string[];

  // NEW: Barrel tracking
  hasBarrelDependencies: boolean;

  // NEW: Raw counts for validation
  rawDependencyCount: number;
}
```

---

## Test Coverage Required

### Phase 1 Tests
```
✓ Graph includes files from both retail and restaurant
✓ Retail-only files have dependencies tracked
✓ Files with unresolved imports are NOT clean subtrees
✓ Unresolved imports are listed in FileMatch
✓ Files with ONLY symbolic deps are NOT clean subtree roots
✓ Symbolic deps are tracked but not blocking if file deps exist
✓ Clean cycles are marked as clean subtrees
✓ Dirty cycles are marked as not clean
```

### Phase 2 Tests
```
✓ Path normalization handles case differences
✓ Path normalization handles ../ traversal
✓ Path comparison works cross-platform
✓ Barrel imports track transitive target
✓ Dirty transitive target blocks clean subtree
✓ findMatchingFile requires 2+ segment match
✓ Ambiguous matches logged as warning
```

### Phase 3 Tests
```
✓ Computed dynamic imports detected and flagged
✓ Template regex matches uppercase components
✓ Template regex matches single-word app-prefixed components
✓ Pre-migration validation catches unresolved imports
✓ Pre-migration validation warns about symbolic deps
```

---

## Acceptance Criteria

### Critical (Phase 1)
- [ ] Graph built from both retail AND restaurant directories
- [ ] Files with unresolved imports blocked from clean subtree
- [ ] Warning logged for every unresolved import
- [ ] Files with only symbolic deps blocked from clean subtree root
- [ ] Clean cycles correctly marked as clean subtrees
- [ ] All flags added to FileMatch interface

### High Priority (Phase 2)
- [ ] All paths normalized through `path-utils.ts`
- [ ] Case-insensitive comparison on macOS/Windows
- [ ] Barrel transitive dependencies tracked
- [ ] findMatchingFile requires 2+ segment match
- [ ] Ambiguous matches logged

### Important (Phase 3)
- [ ] Computed dynamic imports detected and warned
- [ ] Template regex catches more component patterns
- [ ] Pre-migration validation comprehensive

### Validation
- [ ] Dependency count validation logs mismatches
- [ ] Analysis summary logged with flag counts
- [ ] All new test cases pass

---

## Out of Scope (Future Hardening)

1. **Full symbolic dependency resolution** - Mapping `selector:app-foo` to actual file
2. **NgRx spread operator detection** - Requires more complex AST analysis
3. **Multiple tsconfig support** - Significant refactor
4. **Lazy route variable detection** - Requires control flow analysis
5. **Template recursive parsing** - Parse templates for nested component refs

---

## Implementation Order

```
Week 1:
  Phase 1.1 - Dual-branch graph (LEAK #2)
  Phase 1.2 - Unresolved import tracking (LEAK #4)
  Phase 1.3 - Symbolic dep tracking (LEAK #5)
  Phase 1.4 - Circular dep fix (LEAK #6)

Week 2:
  Phase 2.1 - Path normalization (LEAK #3, #10)
  Phase 2.2 - Barrel transitive tracking (LEAK #7)
  Phase 2.3 - findMatchingFile fix (LEAK #11)

Week 3:
  Phase 3.1 - Computed import detection (LEAK #1)
  Phase 3.2 - Template regex expansion (LEAK #9)
  Phase 3.3 - Migration validation (LEAK #12)
  Phase 4 - Validation & logging

Week 4:
  Full test coverage
  Run against real codebase
  Fix any newly discovered issues
```

---

## Risk Assessment

| Fix | Risk | Mitigation |
|-----|------|------------|
| Dual-branch graph | May slow analysis | Profile, optimize if needed |
| Path normalization | May break existing matches | Run in parallel, compare results |
| Circular dep change | May allow bad migrations | Add extra validation |
| Barrel tracking | Complex, may have edge cases | Extensive testing |

---

## Conclusion

This spec addresses 15 of 25 identified leaks, covering all critical and high-severity issues. After implementation:

- Files with unresolved imports will be blocked
- Files with only symbolic deps will be flagged
- Clean cycles will work correctly
- Path handling will be consistent
- Barrel dependencies will be tracked transitively
- Pre-migration validation will catch issues

The remaining 10 leaks (NgRx spread, multiple tsconfig, etc.) require more invasive changes and are deferred to a future hardening pass.
