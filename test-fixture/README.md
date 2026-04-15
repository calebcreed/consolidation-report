# Test Fixture

This is a test fixture for the branch-consolidator tool. It simulates a real-world Nx monorepo with two divergent branches (`retail` and `restaurant`) that need to be consolidated into a `merged` directory.

## Structure

```
test-fixture/
├── apps/
│   ├── retail/           # Retail branch app
│   │   ├── src/
│   │   │   ├── app/      # Application code
│   │   │   └── environments/
│   │   └── tsconfig.app.json
│   ├── restaurant/       # Restaurant branch app
│   │   ├── src/
│   │   │   ├── app/
│   │   │   └── environments/
│   │   └── tsconfig.app.json
│   └── merged/           # Target for consolidated code (initially empty-ish)
│       └── src/
├── tsconfig.base.json    # Base TypeScript config
├── nx.json               # Nx workspace config
└── package.json
```

## What This Tests

The fixture includes examples of all dependency patterns the consolidator must handle:

### TypeScript Import Patterns (S1-S11)
- **S1-S2**: Relative imports (`./foo`, `../bar`)
- **S3**: Barrel imports (`./folder` → `index.ts`)
- **S4**: baseUrl imports (`Payments/foo`)
- **S5-S6**: Path alias imports (`@app/*`, `@core/*`)
- **S7-S8**: Re-exports (`export { X } from`)
- **S9**: Side-effect imports (`import './polyfills'`)
- **S10**: Dynamic imports (`await import()`)
- **S11**: Type-only imports (`import type { X }`)

### Angular Patterns (A1-A12)
- **A1-A2**: Constructor injection, `@Inject`
- **A3-A6**: NgModule imports/declarations/providers/exports
- **A7-A9**: Template components/pipes/directives
- **A10**: Lazy-loaded routes
- **A11-A12**: `forRoot`/`forChild`, `providedIn`

### NgRx Patterns (N1-N5)
- **N1-N2**: Actions in reducers/effects (both old and new syntax)
- **N3-N4**: Selectors and selector composition
- **N5**: Feature state registration

### Diff Scenarios (D1-D15)
- **D1-D4**: Identical, different, retail-only, restaurant-only files
- **D5-D9**: Structural changes (moved, renamed, split, merged)
- **D10-D12**: Clean differences (whitespace, comments, import order)
- **D13-D15**: Dirty differences (variable renames, added/removed features)

## Usage

### 1. Install dependencies (from consolidator root)

```bash
cd ..  # Go to consolidator root
npm install
npm run build
```

### 2. Initialize git in the test fixture (required for migrations)

```bash
cd test-fixture
git init && git add -A && git commit -m "Initial commit"
cd ..
```

Or use the npm script:
```bash
npm run init:fixture
```

### 3. Run the interactive server

```bash
npm run serve -- --project ./test-fixture --port 3000
```

Then open http://localhost:3000 in your browser.

### 3. Or run programmatically

```javascript
const { StateManager } = require('./dist/v2/server/state');
const { GraphBuilder } = require('./dist/v2/deps');
const { ReportAnalyzer } = require('./dist/v2/report');

const stateManager = new StateManager();
stateManager.saveConfig({
  projectPath: './test-fixture',
  retailBranch: 'retail',
  restaurantBranch: 'restaurant',
  sharedPath: 'apps/merged',
  tsconfigPath: './test-fixture/apps/restaurant/tsconfig.app.json',
  buildCommand: 'echo "Build skipped"',
});

// Run analysis, migrate clean subtrees, etc.
```

## Key Files to Examine

| File | Patterns Demonstrated |
|------|----------------------|
| `apps/restaurant/src/app/services/interceptor.ts` | S1, S2, S5, A1 |
| `apps/restaurant/src/app/core/state/store-json/` | N1-N5 (all NgRx) |
| `apps/restaurant/src/app/modules/+transferMerge/` | S3, S7, A3-A6 |
| `apps/restaurant/src/app/diff-examples/` | D1-D15 |

## Expected Behavior

When you run the consolidator on this fixture:

1. **Analysis** should find ~20-30 clean subtrees (files identical in both branches with no dirty dependencies)

2. **Migration** should:
   - Move files from `apps/restaurant/src/` to `apps/merged/src/`
   - Add `@appMerged/*` aliases to tsconfig
   - Update external imports to use merged aliases
   - Create git commits for each migration

3. **Rollback** should restore to any previous state via git reset

## Path Aliases

The restaurant app uses these path aliases (defined in `tsconfig.app.json`):

| Alias | Target |
|-------|--------|
| `@app/*` | `app/*` |
| `@core/*` | `app/core/*` |
| `@env/*` | `environments/*` |
| `@auth/*` | `app/modules/+auth/*` |
| ... | ... |

After migration, `@appMerged/*` aliases are added pointing to `../../merged/src/app/*`.
