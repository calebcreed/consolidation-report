# Branch Consolidator - Validation Test Guide

Quick validation of the three acceptance criteria cards.

## Setup

```bash
cd /path/to/webpos-consolidator
npm install
npm run build
npm start
```

Open http://localhost:3000 in your browser.

---

## Card 1: Dependency Detection Engine

**Goal:** Verify the tool detects imports, NgRx patterns, and Angular module declarations.

1. Click **Analyze** button, wait for completion
2. In the **All Files** tab, search for `interceptor`
3. Click on `src/app/services/interceptor.ts` to expand
4. **Verify:** Shows **8 dependencies** including:
   - `src/app/models/user.ts` (relative import)
   - `src/environments/environment.ts` (path alias `@env`)
   - `src/app/core/state/state.constants.ts` (path alias `@app`)

5. Search for `store-json.reducer`
6. Click to expand
7. **Verify:** Shows dependency on `store-json.actions.ts` (NgRx action import)

8. Search for `transfer-merge.module`
9. Click to expand
10. **Verify:** Shows 4 dependencies (SharedModule, StoreJsonModule, components barrel, services barrel)

**Pass criteria:** All three files show their dependencies correctly.

---

## Card 2: Clean Subtree Reports

**Goal:** Verify clean subtrees are identified and bottlenecks show impact.

After analysis, check the **stats panel** at top:

| Stat | Expected |
|------|----------|
| Total Files | 85 |
| Clean | 38 |
| Conflicts | 14 |
| Clean Subtrees | 24 |
| Bottlenecks | 1/1 |

1. Click the **Clean Subtrees** tab
2. **Verify:** Subtrees are listed with file counts, largest first

3. Click the **Bottlenecks** tab
4. **Verify:** Shows `store-json.actions.ts` with:
   - Status: `conflict`
   - Unlocks: **6 files**
   - Click "Diff" to see the difference between branches

**Pass criteria:** Stats match, bottleneck shows correct unlock count.

---

## Card 3: Move Capability

**Goal:** Verify migration moves files and rollback restores them.

1. Click the **Clean Subtrees** tab
2. Find `src/app/shared/shared.module.ts` (2 files)
3. Click **Migrate** button
4. **Verify output panel shows:**
   - "Migrating clean subtree: 2 files"
   - "Moving files..."
   - "Migration complete"
   - Commit hash

5. Click **Rollback** button
6. **Verify output panel shows:**
   - "Rolling back..."
   - "Rollback complete"

7. *(Optional)* Verify filesystem:
```bash
# After migrate - files should be in merged:
ls test-fixture/apps/merged/src/app/shared/

# After rollback - files should be back in restaurant:
ls test-fixture/apps/restaurant/src/app/shared/
```

**Pass criteria:** Migration completes, rollback restores files.

---

## Quick Checklist

| Test | Pass |
|------|------|
| **Card 1** | |
| interceptor.ts shows 8 dependencies | ☐ |
| store-json.reducer.ts shows actions import | ☐ |
| transfer-merge.module.ts shows 4 imports | ☐ |
| **Card 2** | |
| Stats: 85 total, 38 clean, 14 conflicts | ☐ |
| 24 clean subtrees listed | ☐ |
| Bottleneck: store-json.actions.ts unlocks 6 | ☐ |
| **Card 3** | |
| Migrate moves files to merged | ☐ |
| Rollback restores files | ☐ |

---

## Notes

- The test fixture includes a deliberate bottleneck: `retail/store-json.actions.ts` has an extra action that doesn't exist in restaurant, making it a conflict that blocks 6 other clean files.
- **Build errors are expected** - the test fixture is a mock project without a real Nx workspace. The migration itself completes successfully; only the build verification fails.
- To skip the build, edit `.consolidator-config.json` and change `buildCommand` to `echo 'skipped'`.
- For real projects, configure the actual build command (e.g., `nx build restaurant`).
