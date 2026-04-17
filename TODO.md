# Current Work - Resume Here

## Last Session Summary (2026-04-17)

Completed a "Weltschmerz test" comparing ambitions vs reality. Found critical issues.

## Critical Bug: Diff Normalizer Broken

The semantic diff normalizer (`src/diff/normalizer.ts` + `comparator.ts`) does NOT work:

```
D10: Whitespace-only → returns "dirty" (WRONG, should be "clean")
D11: Comments-only   → returns "dirty" (WRONG, should be "clean")
D12: Import-order    → likely broken too
```

**This defeats a core feature.** We claim to treat cosmetic differences as "clean" but they're all marked as conflicts.

Files to fix:
- `src/diff/normalizer.ts` (254 lines) - ASTNormalizer class
- `src/diff/comparator.ts` (513 lines) - SemanticComparator class

Test files:
- `test-fixture/apps/retail/src/app/diff-examples/d10-whitespace.ts`
- `test-fixture/apps/restaurant/src/app/diff-examples/d10-whitespace-only.ts`
- Similar for d11-comments, d12-import-order

## Large Files Needing Refactor

| Lines | File | Suggested Split |
|------:|------|-----------------|
| 1,243 | `src/server/html.ts` | `html-template.ts`, `html-scripts.ts`, `html-styles.ts` |
| 1,071 | `src/deps/extractor.ts` | `extractor-imports.ts`, `extractor-angular.ts`, `extractor-ngrx.ts` |
| 828 | `src/server/state.ts` | `migration.ts`, `git-ops.ts`, `build-runner.ts` |
| 621 | `src/server/index.ts` | `routes.ts`, `analysis.ts`, `websocket.ts` |

## What Works

Dependency detection is mostly working:
- 15 of 21 dependency types detected
- Graph building works
- Clean subtree detection works
- Migration works (dual-branch: deletes from both retail AND restaurant)
- Rollback/redo via git works

## What's Missing

Dependency types not tested/detected:
- `import-type` (TypeScript type-only imports)
- `require` (CommonJS)
- `triple-slash` (/// reference directives)
- `ngrx-feature` (StoreModule.forFeature)

## Project Structure (After Cleanup)

```
src/
├── deps/           # Dependency detection (working)
├── diff/           # Semantic comparison (BROKEN - fix normalizer)
├── report/         # Analysis & reporting
├── server/         # Interactive dashboard
│   ├── index.ts    # Express + WebSocket + analysis
│   ├── html.ts     # Dashboard SPA
│   └── state.ts    # Migration state management
└── __tests__/      # Jest tests
```

## Commands

```bash
npm start          # Run server on :3000
npm run build      # Compile TypeScript
npm test           # Run tests
```

## Key Documentation

- `ARCHITECTURE.md` - Full architecture overview
- `EXAMPLES.md` (in webpos-model) - All dependency species with examples

## Next Steps (Priority Order)

1. **FIX DIFF NORMALIZER** - Make D10-D12 return "clean" not "dirty"
2. Refactor large files for AI parseability
3. Add missing dependency detection (import-type, require, triple-slash)
