# Branch Consolidator

An interactive tool for consolidating divergent Angular/TypeScript codebases. Analyzes two branches (e.g., `retail` and `restaurant`), identifies "clean subtrees" that can be safely migrated to a shared location, and handles all import rewrites automatically.

## Features

- **Watertight dependency detection** - Handles all TypeScript/Angular import patterns including path aliases, barrel files, NgRx, and Angular DI
- **Clean subtree identification** - Finds files that are identical between branches AND have no dirty dependencies
- **Interactive web UI** - Browse files, view diffs, migrate subtrees, run builds, rollback mistakes
- **Safe migrations** - Git commits for each migration with full rollback/redo support
- **Path alias handling** - Automatically adds `@appMerged/*` aliases and rewrites imports

## Quick Start

### 1. Install

```bash
npm install
npm run build
```

### 2. Test with the included fixture

```bash
# Initialize git in the fixture (required once, for migration rollbacks)
npm run init:fixture

# Start the server
npm run test:fixture
```

Then open http://localhost:3000

### 3. Use with your own project

```bash
npm run serve -- --project /path/to/your/nx-monorepo --port 3000
```

## How It Works

### Analysis

The tool scans your `apps/retail/` and `apps/restaurant/` directories and:

1. **Compares files** - Identifies identical, conflicting, and one-sided files
2. **Builds dependency graph** - Tracks all imports (relative, path alias, barrel, NgRx, Angular DI)
3. **Finds clean subtrees** - A subtree is "clean" if:
   - The root file is identical in both branches
   - ALL dependencies are also clean (recursively)

### Migration

When you migrate a clean subtree:

1. Files move from `apps/restaurant/src/` to `apps/merged/src/`
2. `@appMerged/*` path aliases are added to tsconfig
3. External files that imported from the subtree get their imports updated
4. A git commit is created for rollback capability

### Import Rewriting

```
BEFORE (in restaurant):
  import { Foo } from '@app/utils/foo';

AFTER (file stays in restaurant, foo.ts moved to merged):
  import { Foo } from '@appMerged/utils/foo';
```

Files that move together keep their relative imports unchanged.

## Project Structure

```
branch-consolidator/
├── src/
│   └── v2/
│       ├── deps/          # Dependency detection
│       │   ├── resolver.ts   # Path resolution (aliases, barrels, baseUrl)
│       │   ├── extractor.ts  # AST-based import extraction
│       │   └── graph.ts      # Dependency graph construction
│       ├── diff/          # File comparison
│       │   ├── normalizer.ts # AST normalization
│       │   └── comparator.ts # Semantic comparison
│       ├── report/        # Analysis reporting
│       │   └── analyzer.ts   # Clean subtree detection
│       └── server/        # Interactive web UI
│           ├── index.ts      # Express server + WebSocket
│           ├── state.ts      # Migration state management
│           └── html.ts       # UI generation
└── test-fixture/          # Example Nx monorepo for testing
    ├── apps/
    │   ├── retail/
    │   ├── restaurant/
    │   └── merged/
    └── README.md
```

## Supported Patterns

### TypeScript Imports
- Relative imports (`./foo`, `../bar`)
- Barrel/index imports (`./folder` → `folder/index.ts`)
- Path aliases (`@app/*`, `@core/*`, `@env/*`)
- baseUrl imports (`Payments/foo` via `baseUrl: "src"`)
- Dynamic imports (`await import('./lazy')`)
- Type-only imports (`import type { X }`)
- Re-exports (`export { X } from './foo'`)

### Angular
- Constructor injection (`constructor(private foo: FooService)`)
- `@Inject` decorators
- NgModule imports/declarations/providers/exports
- Template components (`<app-foo>`)
- Template pipes (`{{ x | pipeName }}`)
- Template directives (`[appDirective]`)
- Lazy-loaded routes (`loadChildren`)

### NgRx
- Actions in reducers (both class-based and `createReducer`)
- Actions in effects (`ofType(action)`)
- Selectors and selector composition
- Feature state registration

## CLI Options

```bash
npm run serve -- [options]

Options:
  --project <path>     Path to your Nx monorepo (required)
  --port <number>      Server port (default: 3000)
  --build-command <cmd> Build command to verify migrations (default: "nx build restaurant")
```

## Web UI

The interactive dashboard at http://localhost:3000 provides:

- **Overview** - Stats on clean/conflict files, clean subtrees
- **File Browser** - All files with status, searchable and filterable
- **Diff Viewer** - Side-by-side diffs for any file
- **Subtree List** - Clean subtrees ready for migration
- **Migration Controls** - One-click migrate, build verification, rollback
- **Terminal Output** - Live output from migrations and builds

## Test Fixture

The `test-fixture/` directory contains a minimal Nx monorepo that demonstrates all supported patterns. See `test-fixture/README.md` for details.

```bash
# Run with the test fixture
npm run test:fixture

# The fixture includes:
# - 60+ files across retail/restaurant
# - All import pattern types (S1-S11)
# - All Angular patterns (A1-A12)
# - All NgRx patterns (N1-N5)
# - Diff scenarios (identical, conflict, one-sided, etc.)
```

## Troubleshooting

### "0 dependencies detected"

Make sure you're passing the correct tsconfig path. The tool needs the tsconfig to resolve path aliases.

### Migration blocked with dependency errors

This means the "clean subtree" detection caught a file that has dependencies outside the migration set. This is the safety check working correctly - review the dependency and either:
- Include the dependency in the migration
- Or fix the upstream issue causing incorrect clean detection

### Rollback not working

The tool uses `git reset --hard` for rollback. Make sure:
- Your project is a git repository
- You have no uncommitted changes before migrating
- The migration commit wasn't pushed (or you're okay force-pushing)

## License

MIT
