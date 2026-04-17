# Branch Consolidator - Architecture Overview

## Purpose

A tool to consolidate two diverged Angular codebases (retail and restaurant branches) into a single merged codebase. It identifies files that are identical between branches ("clean"), detects which can be safely migrated, and performs the migration while updating imports.

---

## Directory Structure

```
webpos-consolidator/
├── src/
│   ├── deps/                    # Dependency Detection
│   │   ├── types.ts             # Core interfaces (Dependency, FileAnalysis, etc.)
│   │   ├── resolver.ts          # Path resolution (tsconfig aliases, barrels, baseUrl)
│   │   ├── extractor.ts         # AST extraction using ts-morph
│   │   ├── graph.ts             # Dependency graph construction & querying
│   │   └── index.ts             # Public exports
│   │
│   ├── diff/                    # Semantic File Comparison
│   │   ├── types.ts             # DiffResult types (identical, clean, dirty, structural)
│   │   ├── normalizer.ts        # AST normalization (strips whitespace, comments, import order)
│   │   ├── comparator.ts        # Compares two files semantically
│   │   └── index.ts             # Public exports
│   │
│   ├── report/                  # Analysis & Reporting
│   │   ├── types.ts             # FileMatch, CleanSubtree, BottleneckNode, AnalysisReport
│   │   ├── analyzer.ts          # Finds clean subtrees and bottlenecks
│   │   ├── html.ts              # Static HTML report generation
│   │   ├── terminal.ts          # CLI terminal output
│   │   └── index.ts             # Public exports
│   │
│   ├── server/                  # Interactive Web Server
│   │   ├── index.ts             # Express + WebSocket server, analysis endpoint
│   │   ├── html.ts              # Interactive dashboard (single-page app)
│   │   ├── state.ts             # Migration state, rollback/redo, git commits
│   │   └── cli.ts               # CLI argument parsing
│   │
│   ├── __tests__/               # Jest unit tests
│   │   ├── resolver.test.ts
│   │   ├── extractor.test.ts
│   │   ├── graph.test.ts
│   │   └── comparator.test.ts
│   │
│   ├── index.ts                 # Main exports
│   ├── verify.ts                # Verification script
│   ├── migrate-cli.ts           # CLI migration tool
│   └── demo-report.ts           # Demo report generator
│
├── test-fixture/                # Test project (mini Angular monorepo)
│   ├── apps/
│   │   ├── retail/              # "Retail" branch files
│   │   ├── restaurant/          # "Restaurant" branch files
│   │   └── merged/              # Destination for migrated files (starts empty)
│   └── ...
│
├── dist/                        # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── .consolidator-config.json    # Runtime configuration
```

---

## Core Modules

### 1. `deps/` - Dependency Detection

**Purpose:** Build a complete dependency graph of the codebase.

**Key Classes:**
- **`PathResolver`** - Resolves import specifiers to absolute file paths
  - Handles: relative (`./foo`), barrel (`./folder` → `index.ts`), baseUrl, path aliases (`@app/*`)
  - Parses `tsconfig.json` for configuration

- **`DependencyExtractor`** - Extracts all dependencies from a single file using ts-morph
  - Import/export declarations
  - Dynamic imports (`import()`)
  - Angular decorators (@Component, @NgModule, @Injectable)
  - Constructor injection
  - NgRx actions, reducers, effects, selectors

- **`DependencyGraph`** - Queryable graph structure
  - `getAnalysis(path)` - Get file's dependencies and exports
  - `getDependencies(path)` - What does this file import?
  - `getDependents(path)` - What imports this file?
  - `getTransitiveDependencies(path)` - Full dependency tree

- **`GraphBuilder`** - Constructs the graph from a directory
  - `fromTsconfig(path)` - Create builder with tsconfig settings
  - `build(rootDir, options)` - Scan and analyze all files

**Dependency Types Detected:**
```
TypeScript: import, import-type, import-side-effect, import-dynamic, require, export-from
Angular:    injection, inject-token, ngmodule-import/declaration/provider/export,
            template-component, template-pipe, template-directive, lazy-route
NgRx:       ngrx-action, ngrx-selector, ngrx-feature
```

---

### 2. `diff/` - Semantic Comparison

**Purpose:** Compare two files and determine if differences are meaningful.

**Key Classes:**
- **`ASTNormalizer`** - Normalizes AST for comparison
  - Strips whitespace formatting
  - Removes comments
  - Sorts imports alphabetically
  - Result: two files with only cosmetic differences become identical

- **`SemanticComparator`** - Compares two files
  - Returns: `identical`, `clean` (cosmetic only), `dirty` (real changes), `structural` (moved/renamed)

**DiffResult Types:**
```typescript
{ status: 'identical' }                           // Exact same content
{ status: 'clean', reason: 'whitespace-only' }    // Only formatting differs
{ status: 'clean', reason: 'comments-only' }      // Only comments differ
{ status: 'clean', reason: 'import-order-only' }  // Only import order differs
{ status: 'dirty', changes: [...] }               // Real semantic differences
{ status: 'structural', type: { kind: 'moved' }}  // File was moved/renamed
```

---

### 3. `report/` - Analysis & Reporting

**Purpose:** Analyze the comparison results and identify migration opportunities.

**Key Interfaces:**
- **`FileMatch`** - Result of comparing one file between branches
  ```typescript
  {
    relativePath: string;
    retailPath: string | null;
    restaurantPath: string | null;
    status: 'clean' | 'conflict' | 'retail-only' | 'restaurant-only';
    diff: DiffResult;
    dependencies: string[];
    dependents: string[];
  }
  ```

- **`CleanSubtree`** - A group of clean files that can be migrated together
  ```typescript
  {
    rootPath: string;      // Root file of the subtree
    files: string[];       // All files in the subtree
    totalFiles: number;
  }
  ```

- **`BottleneckNode`** - A conflict file blocking clean files
  ```typescript
  {
    relativePath: string;
    unlockCount: number;      // How many clean files this blocks
    impactScore: number;      // unlockCount / linesChanged
  }
  ```

**Key Class:**
- **`ReportAnalyzer`** - Processes file matches to find subtrees and bottlenecks

---

### 4. `server/` - Interactive Dashboard

**Purpose:** Web-based UI for exploring analysis and performing migrations.

**Components:**

- **`index.ts`** - Express server + WebSocket
  - `GET /` - Serves the dashboard HTML
  - `POST /api/analyze` - Runs full analysis
  - `POST /api/migrate` - Performs a migration
  - `POST /api/rollback` - Undoes last migration
  - `POST /api/build` - Runs build command
  - WebSocket broadcasts real-time progress

- **`html.ts`** - Single-page dashboard application
  - **Discovery Tab** - Summary stats, progress
  - **Clean Subtrees Tab** - Migratable file groups, ranked by size
  - **Conflicts Tab** - Files that differ between branches
  - **All Files Tab** - Complete file list with search
  - **Graph Tab** - Visual dependency graph (force-directed)
  - **Bottlenecks Tab** - Conflicts blocking the most clean files
  - **Timeline Tab** - Migration history with rollback/redo

- **`state.ts`** - Migration state management
  - Tracks all migrations performed
  - Each migration creates a git commit
  - Rollback = `git reset --hard` to parent commit
  - Redo = `git reset --hard` to migration commit
  - **Dual-branch handling:** Deletes from both retail AND restaurant

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER START                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. SCAN                                                        │
│     - Scan retail/src/**/*.ts → Map<relativePath, absolutePath> │
│     - Scan restaurant/src/**/*.ts → Map<relativePath, absolutePath>
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. BUILD GRAPH                                                 │
│     - GraphBuilder.fromTsconfig(tsconfig.json)                  │
│     - builder.build(restaurantSrcDir)                           │
│     - Result: DependencyGraph with all files and edges          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. COMPARE FILES                                               │
│     For each unique relativePath:                               │
│     - SemanticComparator.compare(retailFile, restaurantFile)    │
│     - Generate unified diff                                     │
│     - Lookup dependencies/dependents from graph                 │
│     - Create FileMatch record                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. ANALYZE                                                     │
│     - Find clean subtrees (clean files where all deps are clean)│
│     - Find bottlenecks (conflicts that block clean files)       │
│     - Rank by size/impact                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. SERVE DASHBOARD                                             │
│     - Send AnalysisReport to browser                            │
│     - User explores, selects subtree to migrate                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. MIGRATE (when user clicks migrate)                          │
│     - Validate: no external dependencies                        │
│     - Copy files: restaurant → merged                           │
│     - Update imports: @app/* → @appMerged/*                     │
│     - Delete from: retail AND restaurant                        │
│     - Update both tsconfigs with @appMerged/* aliases           │
│     - Git commit                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration

**`.consolidator-config.json`:**
```json
{
  "projectPath": "./test-fixture",
  "retailBranch": "retail",
  "restaurantBranch": "restaurant",
  "sharedPath": "libs/shared",
  "tsconfigPath": "test-fixture/apps/restaurant/tsconfig.app.json",
  "buildCommand": "nx build restaurant"
}
```

---

## Key Concepts

### Clean Subtree
A connected subgraph where:
1. Every file is **clean** (identical between retail and restaurant)
2. Every file's dependencies are also in the subtree (or already in merged)

These can be safely migrated without breaking either branch.

### Bottleneck
A **conflict** file that, if resolved, would unlock clean files for migration. Ranked by:
- `unlockCount`: How many clean files are blocked
- `impactScore`: `unlockCount / linesChanged` (bang for buck)

### Dual-Branch Migration
When migrating:
1. Files copied from restaurant → merged
2. Files deleted from **both** retail AND restaurant
3. Both tsconfigs updated with `@appMerged/*` aliases
4. Imports in both branches rewritten to use merged aliases

---

## Commands

```bash
npm start          # Start interactive server on :3000
npm run serve      # Build + start server
npm run build      # Compile TypeScript
npm test           # Run Jest tests
npm run verify     # Run verification against test-fixture
```

---

## Test Fixture

The `test-fixture/` directory contains a minimal Angular monorepo for testing:

- **`apps/retail/`** - Simulates the retail branch
- **`apps/restaurant/`** - Simulates the restaurant branch
- **`apps/merged/`** - Destination for migrated files (starts empty)

Files are designed to test various scenarios:
- Clean identical files
- Conflicts (different changes in both branches)
- One-sided files (retail-only, restaurant-only)
- Various import patterns (path aliases, barrels, relative)
- Angular patterns (NgModule, components, services)
- NgRx patterns (actions, reducers, effects, selectors)
