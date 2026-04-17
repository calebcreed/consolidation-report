# Branch Consolidator - Validation Test Guide

This guide validates the tool against three acceptance criteria cards. All tests run against the included `test-fixture/` which simulates the WebPOS codebase structure.

## Setup

```bash
cd /path/to/webpos-consolidator
npm install
npm run build
npm start  # Starts server on http://localhost:3000
```

Open http://localhost:3000 in your browser.

---

## Card 1: Dependency Detection Engine

**User Story:** Detect all dependency types (imports, NgRx selectors/actions/reducers, config references, Angular module declarations) to build an accurate dependency graph.

### Test 1.1: Standard ES/TypeScript Imports

1. Click **Analyze** in the dashboard
2. In the file list, find `src/app/services/interceptor.ts`
3. Click to expand - verify it shows dependencies:
   - `../models/user.ts` (relative import)
   - `@app/core/tokens` (path alias)
   - `../core/services` (barrel import)

**Expected:** All three dependency types detected and displayed.

**Verify in code:** `test-fixture/apps/restaurant/src/app/services/interceptor.ts`

### Test 1.2: Angular-Specific Dependencies

1. Find `src/app/modules/+transferMerge/transfer-merge.module.ts`
2. Verify NgModule dependencies detected:
   - Component declarations (TabletTransferComponent, etc.)
   - Module imports (CommonModule, SharedModule)
   - Provider references

**Expected:** NgModule `declarations`, `imports`, `providers` arrays parsed.

### Test 1.3: NgRx Patterns (Actions/Reducers/Effects/Selectors)

1. Find `src/app/core/state/store-json/store-json.reducer.ts`
2. Verify dependencies include:
   - `./store-json.actions` (action imports)
   - Action type references (LOAD_STORE_JSON, etc.)

3. Find `src/app/core/state/store-json/store-json.effects.ts`
4. Verify it detects:
   - Action references in `ofType()` calls
   - Service injections

5. Find `src/app/core/state/store-json/store-json.selectors.ts`
6. Verify:
   - `createSelector` composition detected
   - Reducer state reference

**Expected:** Both OLD pattern (class-based actions) and NEW pattern (createAction) detected.

### Test 1.4: Non-Standard Patterns (LingaEngine.d.ts)

1. Find `src/app/typings/linga-engine.d.ts`
2. Verify it appears in the file list as a type declaration

**Expected:** `.d.ts` files included in analysis.

### Test 1.5: Dependency Graph is DAG

1. After analysis, check the console/output for cycle warnings
2. The graph should have no circular dependencies in the test fixture

**Expected:** No cycle errors. Graph traversal completes.

---

## Card 2: Clean Subtree Reports

**User Story:** Generate reports listing largest clean subtrees ranked by size and impact score.

### Test 2.1: Clean Subtree Identification

1. Click **Analyze**
2. Look at the **Clean Subtrees** section
3. Verify subtrees are listed with file counts

**Expected:** Multiple clean subtrees displayed, each showing:
- Root path
- Number of files
- List of included files

### Test 2.2: Ranking by Size

1. Check that subtrees are ordered by file count (descending)
2. Largest subtrees appear first

**Expected:** `src/app/app-routing.module.ts` subtree (12 files) should be near top.

### Test 2.3: Bottleneck Impact Score

1. Look at the **Bottlenecks** section
2. Find `store-json.actions.ts` listed as a bottleneck
3. Verify it shows:
   - Status: `conflict`
   - Unlocks: `6 files`
   - Impact score displayed

**Expected:** The bottleneck analysis identifies that fixing `store-json.actions.ts` would unlock 6 other clean files (reducer, effects, selectors, module, service, index).

### Test 2.4: Summary Statistics

1. Check the stats panel at top of dashboard:
   - Total files
   - Clean files
   - Conflicts
   - Immediately movable
   - Blocked clean (clean files blocked by dirty deps)

**Expected values (approximately):**
| Stat | Expected |
|------|----------|
| Total files | ~80 |
| Clean files | ~41 |
| Conflicts | ~8 |
| Immediately movable | ~35 |
| Blocked clean | 6 |

### Test 2.5: Understanding the Bottleneck

**Why 6 files are blocked:**

```
store-json.actions.ts (DIRTY - has extra action in retail)
    ↓
store-json.reducer.ts (CLEAN but blocked)
    ↓
store-json.selectors.ts (CLEAN but blocked)
    ↓
store-json-selector.service.ts (CLEAN but blocked)

store-json.effects.ts (CLEAN but blocked) - imports actions directly
store-json.module.ts (CLEAN but blocked) - imports reducer + effects
store-json/index.ts (CLEAN but blocked) - barrel exports all
```

**Verify:** Open `test-fixture/apps/retail/src/app/core/state/store-json/store-json.actions.ts` and note the extra `refreshStoreJsonCache` action at the bottom that doesn't exist in restaurant.

---

## Card 3: Prove Move Capability

**User Story:** Select a clean subtree, move it to shared directory, with automatic rollback on failure.

### Test 3.1: Select and Migrate a Clean Subtree

1. In the **Clean Subtrees** section, find a small subtree (e.g., `src/app/shared/shared.module.ts` - 3 files)
2. Click the **Migrate** button for that subtree
3. Watch the output panel for progress:
   - "Migrating clean subtree: X files"
   - "Loading TypeScript project..."
   - "Validating subtree..."
   - "Moving files..."
   - "Commit: [hash]"

**Expected:** Migration completes successfully.

### Test 3.2: Verify Files Moved

After migration, check the filesystem:

```bash
# Files should exist in merged:
ls test-fixture/apps/merged/src/app/shared/

# Files should be DELETED from restaurant:
ls test-fixture/apps/restaurant/src/app/shared/
# Should say "No such file or directory"

# Files should be DELETED from retail:
ls test-fixture/apps/retail/src/app/shared/
# Should say "No such file or directory"
```

### Test 3.3: Verify Import Paths Updated

1. Check files that imported from the moved subtree
2. Their imports should now use `@appMerged/*` aliases

**Note:** This is automatic via ts-morph AST manipulation.

### Test 3.4: Rollback Capability

1. Click **Rollback** button (or use the timeline to select a migration to undo)
2. Watch output for rollback progress
3. Verify files are restored:

```bash
# Files should be back in restaurant:
ls test-fixture/apps/restaurant/src/app/shared/
# Should show: currency.pipe.ts, highlight.directive.ts, shared.module.ts

# Files should be back in retail:
ls test-fixture/apps/retail/src/app/shared/
# Should show same files

# Merged should be empty:
ls test-fixture/apps/merged/src/app/shared/
# Should say "No such file or directory"
```

**Expected:** Full rollback via git reset. All files restored to original locations.

### Test 3.5: Migration Logging

1. Check the output panel during migration
2. Verify it logs:
   - Files being moved
   - Import path updates
   - Git commit hash
   - Any errors encountered

**Expected:** Full audit trail of operations.

### Test 3.6: Redo Capability

1. After rollback, click **Redo**
2. Migration should be re-applied
3. Files move back to merged

**Expected:** Redo restores the migration using git fast-forward.

---

## Edge Cases to Test

### Blocked Migration (Expected Failure)

1. Try to migrate `store-json/index.ts` subtree
2. Should FAIL with error: "Cannot migrate - subtree has dependencies outside the migration set"
3. This is CORRECT behavior - the actions file is dirty

**Expected:** Tool prevents invalid migrations.

### Diff Viewer

1. Find a file with `conflict` status
2. Click to view the diff between retail and restaurant
3. Verify unified diff displays correctly

**Expected:** Side-by-side or unified diff of conflicting files.

---

## Quick Validation Checklist

| Test | Pass/Fail |
|------|-----------|
| **Card 1: Dependency Detection** | |
| ES/TS imports detected | ☐ |
| Angular NgModule deps detected | ☐ |
| NgRx patterns detected | ☐ |
| .d.ts files included | ☐ |
| No cycle errors | ☐ |
| **Card 2: Clean Subtree Reports** | |
| Subtrees listed with file counts | ☐ |
| Ranked by size (descending) | ☐ |
| Bottlenecks show unlock count | ☐ |
| Summary stats accurate | ☐ |
| store-json.actions.ts blocks 6 files | ☐ |
| **Card 3: Move Capability** | |
| Migration moves files to merged | ☐ |
| Files deleted from retail + restaurant | ☐ |
| Rollback restores all files | ☐ |
| Redo re-applies migration | ☐ |
| Invalid migration blocked | ☐ |

---

## API Endpoints (for debugging)

```bash
# Get current state
curl http://localhost:3000/api/state

# Get config
curl http://localhost:3000/api/config

# Run analysis
curl -X POST http://localhost:3000/api/analyze

# Get report
curl http://localhost:3000/api/report

# Get bottlenecks
curl http://localhost:3000/api/report | jq '.bottlenecks'

# Get migrations history
curl http://localhost:3000/api/migrations
```

---

## Files to Examine

| File | Purpose |
|------|---------|
| `test-fixture/apps/restaurant/src/app/services/interceptor.ts` | Multiple import patterns |
| `test-fixture/apps/restaurant/src/app/core/state/store-json/` | Full NgRx pattern example |
| `test-fixture/apps/retail/src/app/core/state/store-json/store-json.actions.ts` | Bottleneck (has extra action) |
| `test-fixture/apps/restaurant/src/app/modules/+transferMerge/` | Angular module with components |
| `test-fixture/apps/restaurant/src/app/diff-examples/` | Various diff scenarios (d1-d15) |

---

## Success Criteria

All three cards are validated if:

1. **Dependency Detection:** Graph shows accurate dependencies including Angular/NgRx patterns
2. **Clean Subtree Reports:** Bottleneck correctly identifies `store-json.actions.ts` as blocking 6 files
3. **Move Capability:** Can migrate a subtree, verify files moved, rollback, and redo

Questions? Check `ARCHITECTURE.md` for system design or `TODO.md` for current status.
