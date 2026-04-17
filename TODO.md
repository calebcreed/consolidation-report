# Current Work - Resume Here

## Last Session Summary (2026-04-17)

Verified that the diff normalizer is working correctly. Previous TODO was stale.

## Status: All Core Features Working

### Verified Working:
- **D10 (whitespace-only)**: Returns `clean` with reason `whitespace-only`
- **D11 (comments-only)**: Returns `clean` with reason `comments-only`
- **D12 (import-order)**: Returns `clean` with reason `import-order-only`

Current analysis results:
- 42 clean files (36 identical, 2 whitespace-only, 2 comments-only, 2 import-order-only)
- 7 conflicts
- 14 restaurant-only
- 17 retail-only

## Large Files Needing Refactor

| Lines | File | Suggested Split |
|------:|------|-----------------|
| 1,243 | `src/server/html.ts` | `html-template.ts`, `html-scripts.ts`, `html-styles.ts` |
| 1,071 | `src/deps/extractor.ts` | `extractor-imports.ts`, `extractor-angular.ts`, `extractor-ngrx.ts` |
| 828 | `src/server/state.ts` | `migration.ts`, `git-ops.ts`, `build-runner.ts` |
| 621 | `src/server/index.ts` | `routes.ts`, `analysis.ts`, `websocket.ts` |

## What Works

- Dependency detection (15 of 21 types)
- Graph building
- **Semantic diff comparison (whitespace, comments, import order)**
- Clean subtree detection
- Migration (dual-branch: deletes from both retail AND restaurant)
- Rollback/redo via git

## What's Missing

Dependency types not tested/detected:
- `import-type` (TypeScript type-only imports)
- `require` (CommonJS)
- `triple-slash` (/// reference directives)
- `ngrx-feature` (StoreModule.forFeature)

## Project Structure

```
src/
├── deps/           # Dependency detection (working)
├── diff/           # Semantic comparison (working)
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

1. Refactor large files for AI parseability
2. Add missing dependency detection (import-type, require, triple-slash)
3. Test against real webpos-model project
