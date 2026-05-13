# EXHAUSTIVE AUDIT: Dependency Leakage in webpos-consolidator

**Version:** 2.0 (Deep Dive)
**Date:** 2026-05-12
**Status:** 25+ critical leak vectors identified

---

## Executive Summary

A file can be marked as a "clean subtree" ready for migration when:
- Its static imports are all clean ✓ **Checked**
- But its template components are dirty ✗ **Not tracked (filtered out)**
- But it has unresolved imports ✗ **Skipped silently**
- But it re-exports from dirty barrels ✗ **Dependency points to barrel, not source**
- But its dependencies are only in retail graph ✗ **Graph only includes restaurant**
- But case sensitivity causes lookup failure ✗ **Silent path mismatch**
- But it uses computed dynamic imports ✗ **Not detected**

**Result**: Files marked "clean" fail to compile or run after migration.

---

## CRITICAL VULNERABILITIES (Will cause runtime failures)

### LEAK #1: Dynamic Imports Via Template Strings
**File:** `extractor-imports.ts:137-163`
**Severity:** CRITICAL

```typescript
const modulePath = `./modules/${name}`;
await import(modulePath);  // NOT detected - only string literals caught
```

The extractor only handles `import('./literal')` but misses computed paths. Any module loaded dynamically via template strings or variables is invisible to the graph.

---

### LEAK #2: Graph Missing Retail-Only Files
**File:** `server-analysis.ts:40-47`
**Severity:** CRITICAL

The dependency graph is built ONLY from the restaurant directory:
```typescript
const graph = await builder.build(restaurantSrcDir, ...);
```

Files that exist only in retail have **zero dependencies tracked**. If such a file is in the migration set, all its dependencies are invisible, causing false "clean" markings.

---

### LEAK #3: Case Sensitivity Path Matching Bug
**File:** `resolver.ts:340-348`
**Severity:** CRITICAL

On macOS (case-insensitive filesystem):
```typescript
// File on disk: /Users/app/MyService.ts
// Import: './myservice' (lowercase)
// fs.existsSync() returns FALSE because paths don't match exactly
// Result: File marked as 'external' when it's actually internal
```

The graph index uses absolute paths from extraction, but if case differs, lookups fail silently.

---

### LEAK #4: Unresolved Imports Silently Ignored
**File:** `server-analysis.ts:94-105`
**Severity:** CRITICAL

```typescript
.filter(d =>
  !d.target.startsWith('unresolved:')  // Silently dropped!
)
```

Files with unresolved imports are marked as clean if all OTHER imports resolve. Runtime will fail when the unresolved import is accessed.

---

### LEAK #5: Angular Symbol Dependencies Never Validated
**File:** `server-analysis.ts:98-104`
**Severity:** CRITICAL

Dependencies like `symbol:MyComponent`, `pipe:asyncPipe`, `directive:appDir` are **completely filtered out**:

```typescript
.filter(d =>
  !d.target.startsWith('symbol:') &&
  !d.target.startsWith('ngrx-') &&
  !d.target.startsWith('selector:') &&
  !d.target.startsWith('pipe:') &&
  !d.target.startsWith('directive:')
)
```

If a component uses a pipe that's in the migration set, the file appears to have no dependency on it. The pipe can be dirty but the component still migrates.

---

### LEAK #6: Circular Dependencies Return False
**File:** `analyzer.ts:71-74`
**Severity:** CRITICAL

```typescript
if (visiting.has(relativePath)) {
  return false;  // Marks cycle as dirty even if all nodes are clean!
}
```

A clean cycle A → B → C → A where all files are identical between branches gets marked as "not clean subtree" purely because a cycle exists.

---

## HIGH-SEVERITY GAPS (Will cause subtle bugs)

### LEAK #7: Barrel File Re-exports Don't Track Transitive Dependencies
**File:** `extractor-imports.ts:76-103`
**Severity:** HIGH

```typescript
// index.ts:
export { MyService } from './services/my.service';

// When imported:
import { MyService } from '@app/services';
```

The dependency is recorded to the barrel file itself, NOT to `my.service.ts`. If `my.service.ts` is dirty but the barrel is clean, the dependency chain is broken.

---

### LEAK #8: NgRx Spread Operator Patterns Missed
**File:** `extractor-ngrx.ts:150-175`
**Severity:** HIGH

```typescript
const actions = [LoadAction, SaveAction];
on(...actions, handler)  // Spread operator not analyzed
```

Effects and reducers using spread operators for actions have incomplete dependency tracking.

---

### LEAK #9: Angular Template Parsing Too Restrictive
**File:** `extractor-angular.ts:339`
**Severity:** HIGH

```typescript
const componentRegex = /<([a-z]+-[a-z0-9-]+)/g;
```

This regex:
- Misses UPPERCASE components: `<MyComponent>`
- Misses single-word components: `<app>`
- Misses components in `*ngComponentOutlet` directive
- Won't match uppercase Angular built-ins properly

---

### LEAK #10: Graph Path Normalization Inconsistent
**File:** `graph.ts:31-47, 78-80`
**Severity:** HIGH

The graph stores dependencies with source/target paths in potentially different formats, but lookups normalize with `path.normalize()`. On Windows vs macOS, path separators and case differences cause silent lookup failures.

---

### LEAK #11: findMatchingFile() Has False Positives
**File:** `analyzer.ts:139-169`
**Severity:** HIGH

```typescript
// depPath = 'src/services/logger.service.ts'
// File 1: 'shared/services/logger.service.ts'  ← WRONG MATCH
// File 2: 'app/services/logger.service.ts'     ← CORRECT
// First filename match is used - could be wrong file!
```

The heuristic matches files by trailing path segments, leading to incorrect dependency associations.

---

### LEAK #12: Unresolved Imports Skip Migration Validation
**File:** `state-migration.ts:200-217`
**Severity:** HIGH

```typescript
const resolved = imp.getModuleSpecifierSourceFile();
if (!resolved) continue;  // Unresolved imports skipped!
```

Pre-migration validation skips imports that ts-morph can't resolve. Dynamic or complex imports won't be validated, and migration can break at runtime.

---

### LEAK #13: Fallback Path Conversion Hardcoded
**File:** `server-analysis.ts:114-121`
**Severity:** HIGH

```typescript
if (d.target.includes('/apps/restaurant/')) {
  return d.target.split('/apps/restaurant/')[1];
}
if (d.target.includes('/apps/retail/')) {
  return d.target.split('/apps/retail/')[1];
}
```

If project structure differs from expected `apps/restaurant` and `apps/retail`, paths stay absolute and don't match in analyzer's index.

---

## MEDIUM-HIGH SEVERITY ISSUES

### LEAK #14: External Template Files Not Parsed For Dependencies
**File:** `extractor-angular.ts:303-315`
**Severity:** MEDIUM-HIGH

```typescript
private parseExternalTemplate(templatePath: string, ...) {
  const templateContent = fs.readFileSync(fullTemplatePath, 'utf-8');
  this.parseTemplateContent(templateContent, ...);  // Only parses content
}
```

Creates a dependency edge to the template FILE but doesn't:
- Recursively parse template for further component/pipe/directive references
- Extract imports within the template
- Template becomes a dead-end dependency in the graph

---

### LEAK #15: Wildcard Path Alias Matching Not Precedence-Aware
**File:** `resolver.ts:223-278`
**Severity:** MEDIUM-HIGH

```typescript
// If paths: { "@app/*": [...], "@app/core/*": [...] }
// "@app/core/service" matches first pattern, not the more specific one
```

JavaScript `Object.entries()` doesn't guarantee order, so longer/more-specific patterns might not match first.

---

### LEAK #16: Multiple tsconfigs Not Handled
**File:** `resolver.ts:97-111`
**Severity:** MEDIUM-HIGH

Only one tsconfig is parsed. If project has:
- `tsconfig.json` (root)
- `apps/restaurant/tsconfig.app.json` (app)
- `apps/restaurant/tsconfig.spec.json` (tests)

And `baseUrl` or `paths` differ, resolution is incomplete.

---

### LEAK #17: Type-Only Imports Masking Runtime Dependencies
**File:** `extractor-imports.ts:42-65`
**Severity:** MEDIUM-HIGH

```typescript
import type { MyService } from './my.service';

// Later in code:
constructor(private svc: MyService) {}  // Runtime needs the actual class!
```

Type-only imports are tracked differently, but Angular DI needs the actual class at runtime. If the type import is clean but the value import would be dirty, migration fails.

---

### LEAK #18: Constructor Injection Without @Inject Missed
**File:** `extractor-angular.ts:180-220`
**Severity:** MEDIUM

```typescript
constructor(
  private http: HttpClient,  // Detected via type
  private myService,         // NO TYPE - not detected!
) {}
```

If constructor parameter has no explicit type annotation, the injection is invisible.

---

### LEAK #19: Lazy Routes With Variables Not Detected
**File:** `extractor-angular.ts:365-395`
**Severity:** MEDIUM

```typescript
const routes = [
  {
    path: 'admin',
    loadChildren: () => ADMIN_MODULE  // Variable reference not detected
  }
];
```

Only inline arrow functions with direct `import()` calls are parsed.

---

### LEAK #20: NgModule Metadata From Variables Not Tracked
**File:** `extractor-angular.ts:240-280`
**Severity:** MEDIUM

```typescript
const SHARED_MODULES = [CommonModule, FormsModule];

@NgModule({
  imports: [...SHARED_MODULES]  // Spread from variable - not detected
})
```

Only literal array elements are extracted.

---

### LEAK #21: Pipe/Directive Usage in Attribute Bindings
**File:** `extractor-angular.ts:345-360`
**Severity:** MEDIUM

```typescript
<div [attr.data-value]="value | myPipe">  // Pipe in attribute binding
<div [class.active]="isActive | async">   // May be missed by simple regex
```

The pipe regex `\|\s*([a-zA-Z_][a-zA-Z0-9_]*)` may not catch all binding contexts.

---

### LEAK #22: require() Calls Not Fully Supported
**File:** `extractor-imports.ts:165-180`
**Severity:** MEDIUM

```typescript
const config = require('./config.json');  // Detected
const mod = require(getPath());           // NOT detected - dynamic
```

Only literal `require()` calls are parsed.

---

### LEAK #23: Re-exports With Renaming
**File:** `extractor-imports.ts:85-100`
**Severity:** MEDIUM

```typescript
export { OriginalName as RenamedExport } from './source';
```

The dependency is tracked, but if downstream code imports `RenamedExport` and the export mapping changes in dirty file, subtle bugs occur.

---

### LEAK #24: Side-Effect Imports From Dirty Files
**File:** `extractor-imports.ts:120-135`
**Severity:** MEDIUM

```typescript
import './polyfills';  // Side-effect import
```

These are tracked but if polyfills.ts modifies globals and is dirty, the clean file depending on those globals will break.

---

### LEAK #25: Dependency Count Mismatch Not Validated
**File:** `server-analysis.ts`, `analyzer.ts`
**Severity:** MEDIUM

No validation that:
```
graph.getDependencies(file).length === fileMatch.dependencies.length
```

After filtering, if the counts diverge significantly, it indicates lost dependencies.

---

## TESTING GAPS

The following critical scenarios have **NO test coverage**:

1. ❌ Circular imports within "clean" files
2. ❌ Files existing only in retail (not in restaurant graph)
3. ❌ Case sensitivity issues on different operating systems
4. ❌ Path aliases with overlapping patterns
5. ❌ Dynamic component loading (ComponentFactoryResolver)
6. ❌ Templates with variable component selectors
7. ❌ NgRx patterns with spread operators
8. ❌ Barrel files with circular re-exports
9. ❌ Type-only imports that mask value dependencies
10. ❌ Symbol dependency validation
11. ❌ Same-change files with dirty dependencies
12. ❌ Unresolved imports in clean files
13. ❌ Multiple tsconfig handling
14. ❌ Template files with nested component references

---

## ROOT CAUSE ANALYSIS

### Extraction Layer (src/deps/)
**Problem:** Not all import patterns covered
- Missing: template strings, computed paths, NgRx spread patterns, variable references
- Missing: advanced Angular features (ComponentFactoryResolver, dynamic components)

### Resolution Layer (src/deps/resolver.ts)
**Problem:** Edge cases in path handling
- Missing: case normalization for cross-platform
- Missing: precedence in path alias matching
- Missing: multiple tsconfig support

### Analysis Layer (src/report/, src/server/)
**Problem:** Pseudo-dependencies filtered without validation
- Symbolic dependencies (components, pipes, directives, NgRx) are dropped entirely
- No validation that these references point to valid, clean modules
- No warning when filtering removes significant dependency count

### Validation Layer (src/server/state-migration.ts)
**Problem:** Pre-migration checks incomplete
- Only ts-morph resolvable imports checked
- Dynamic imports, complex references, and unresolved imports skipped
- External file updates only handle direct imports, not NgModule declarations

### Configuration Layer
**Problem:** Inflexible assumptions
- Hard-coded `apps/restaurant` and `apps/retail` paths
- Single tsconfig assumption
- No handling of multiple path alias patterns with precedence

---

## PRIORITY FIX ORDER

### Tier 1: Immediate (Causes silent failures)
1. **LEAK #2** - Graph only includes restaurant, not retail
2. **LEAK #4** - Unresolved imports silently dropped
3. **LEAK #5** - Symbol dependencies filtered without validation
4. **LEAK #6** - Circular dependencies wrongly marked dirty

### Tier 2: High Priority (Causes hard-to-debug issues)
5. **LEAK #3** - Case sensitivity path bugs
6. **LEAK #7** - Barrel files don't track transitive deps
7. **LEAK #10** - Path normalization inconsistent
8. **LEAK #11** - findMatchingFile() false positives

### Tier 3: Important (Edge cases that will bite)
9. **LEAK #1** - Dynamic imports via template strings
10. **LEAK #8** - NgRx spread operators
11. **LEAK #9** - Template regex too restrictive
12. **LEAK #12** - Migration validation skips unresolved

### Tier 4: Hardening (Defense in depth)
13. All remaining leaks
14. Add validation/warning for dependency count mismatch
15. Add comprehensive test coverage for all gaps

---

## RECOMMENDED ACTIONS

### Immediate
1. Add `hasUnresolvedDeps` and `hasSymbolicDeps` flags to FileMatch
2. WARN (don't silently filter) when symbolic deps are present
3. Fix circular dependency handling to return true, not false
4. Build graph from BOTH retail AND restaurant directories

### Short-term
5. Normalize ALL paths through a single utility function
6. Add case-insensitive path comparison option
7. Track transitive dependencies through barrel files
8. Expand template parsing regex

### Medium-term
9. Support multiple tsconfig files
10. Add computed/dynamic import detection (conservative: warn if detected)
11. Validate dependency counts match between graph and FileMatch
12. Add comprehensive test coverage for all 25 leak vectors

---

## CONCLUSION

The dependency leakage problem is **systemic**, not a single bug. It stems from:

1. **Incomplete extraction** - Many import patterns not detected
2. **Silent filtering** - Problematic dependencies dropped without warning
3. **Path handling fragility** - Case sensitivity, normalization, aliases
4. **Single-source graph** - Only restaurant analyzed, not retail
5. **No validation layer** - No sanity checks before migration

A file marked "clean" today has a significant probability of failing after migration due to one of these 25+ leak vectors.
