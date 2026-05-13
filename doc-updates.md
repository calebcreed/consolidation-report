# Updates for WebPOS Consolidation Plan Document

## Section 5.2 Tool Architecture (Replace existing content)

The Branch Consolidator is a standalone TypeScript tool with five integrated modules:

**Dependency Detection (deps/)**

Builds a complete dependency graph of the codebase using TypeScript AST parsing via ts-morph.

- Path resolution: Resolves all import specifiers to absolute file paths, including:
  - Relative imports (./foo, ../bar)
  - Barrel files (folder → index.ts)
  - baseUrl imports (Payments/foo when tsconfig has baseUrl: "src")
  - Path aliases (@app/*, @core/*) parsed directly from tsconfig.json
- Dependency types detected (30+ patterns):
  - Standard ES imports, re-exports, dynamic import(), require()
  - Angular: constructor injection, @Inject() tokens, NgModule arrays (imports/declarations/providers/exports), template component selectors, pipes, directives, lazy-loaded routes
  - NgRx: actions in reducers and effects (both old class-based and new createAction style), selectors, feature state registration
  - Other: .d.ts type references, triple-slash directives

**Semantic Comparison (diff/)**

Compares files between retail and restaurant using AST normalization, not byte-for-byte comparison.

- Normalization: Strips whitespace, comments, and import ordering before comparison
- Classification: Each file pair is marked as:
  - Clean: Semantically identical (safe to migrate)
  - Conflict: Semantic differences exist (requires manual merge)
  - Retail-only / Restaurant-only: File exists in only one branch

**Clean Subtree Detection (report/)**

Identifies maximal connected subgraphs where every node is clean.

- Dirtiness propagation: A file that imports any dirty dependency becomes dirty itself
- Subtree ranking: Clean subtrees are sorted by size (file count) for prioritization
- Bottleneck identification: Highlights high-dependency files that block many others from being clean

**Migration Engine (server/state.ts)**

Executes atomic migrations with full safety guarantees.

- Dual-branch deletion: Moves files from restaurant to apps/merged/ AND deletes the matching files from retail
- Import rewriting: Updates imports in migrated files to use new @appMerged/* path aliases
- External reference updates: Rewrites imports in files that depend on migrated code
- tsconfig updates: Automatically adds new path aliases to the merged directory's tsconfig
- Pre-migration validation: Blocks migration if any dependency is dirty (prevents broken imports)
- Git commits: Each migration is a single atomic commit with descriptive message

**Interactive Dashboard (server/)**

Web UI at localhost:3000 providing live visualization and controls.

- Discovery tab: Configure project paths, run initial analysis
- Clean Subtrees tab: Browse migrateable subtrees ranked by size; one-click "Migrate" button
- Conflicts tab: View all dirty files and one-sided files
- All Files tab: Searchable list with diff status and dependency counts
- Graph tab: D3-based interactive visualization; nodes colored by status
- Bottlenecks tab: Files with highest dependent count that block progress
- Timeline tab: Migration history with rollback/redo controls

Additional features:
- Real-time output: WebSocket stream shows live progress during analysis, migration, and build
- Build verification: Runs configurable build command (e.g., tsc --noEmit) to verify imports after migration
- Git-based rollback: Undo any migration with one click; redo stack preserved for re-application
- Copy Errors: Formats build errors for pasting into Claude/AI assistant

---

## Section 6.1 Methodology (Replace existing content)

Analysis is performed by running the Branch Consolidator against the codebase:

1. Clone and build the tool:

   git clone <repo-url> webpos-consolidator
   cd webpos-consolidator
   npm install
   npm run build

2. Create a configuration file (.consolidator-config.json) in the tool directory:

   {
     "projectPath": "/path/to/webpos",
     "retailBranch": "retail",
     "restaurantBranch": "restaurant",
     "sharedPath": "apps/merged",
     "tsconfigPath": "/path/to/webpos/apps/restaurant/tsconfig.app.json",
     "buildCommand": "npx tsc --noEmit"
   }

3. Start the server:

   npm start

4. Open http://localhost:3000 in your browser and click "Analyze"

The tool scans apps/retail/src and apps/restaurant/src, builds the dependency graph, compares all files, and identifies clean subtrees.

---

## Section 6.3 Results Interpretation (Add after the table)

Based on the numbers shown (927 total, 611 clean, 272 conflicts, 210 clean subtrees, 32/32 bottlenecks):

**66% of files are already identical** — The divergence is concentrated, not pervasive. Two-thirds of the codebase can move to shared with zero merge risk.

**32/32 bottlenecks are clean** — This is excellent news. Bottlenecks are high-dependency files that block many others from being migrated. Having all of them clean means there are no structural barriers to migration.

**210 clean subtrees** — These represent 210 independent, zero-risk migration opportunities. The Clean Subtrees tab shows them ranked by size; start with the largest ones for maximum impact.

**272 conflict files** — This is the actual work requiring human attention. These need to be categorized (per §10.4) into: trivial formatting differences, auto-mergeable logic changes, and architectural divergences requiring the capability model from §8.

Key questions answered by this data:

- What percentage is already shared? — 66% (611 of 927 files)
- What's the low-hanging fruit? — The largest clean subtrees, viewable in the dashboard
- Where are the conflicts concentrated? — The Conflicts tab groups them by directory
- What's the realistic timeline? — 611 files can migrate immediately; 272 require careful merging

---

## Section 6.3 Table - Missing Values

To fill in the missing values (Retail-only, Restaurant-only, Largest clean subtree), run the tool and check:

- Retail-only / Restaurant-only: In the Conflicts tab, filter by "retail-only" or "restaurant-only" status
- Largest clean subtree: The first entry in the Clean Subtrees tab shows the largest one with its file count

Note: 927 - 611 - 272 = 44 one-sided files total. The exact split between retail-only and restaurant-only depends on the current state of the codebase.
