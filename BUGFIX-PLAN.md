# Clean Subtree Migration Bug - Analysis & Fix

## Problem Statement

Migration fails with "Cannot migrate - subtree has dependencies outside the migration set" even though:
1. All files in the subtree are identical between branches
2. All dependency files exist and ARE in the clean subtree

## Root Cause

**Path normalization mismatch between migration code and ts-morph**

The `migratingFiles` set was built using **relative** paths:
```javascript
const restaurantPath = path.join(restaurantDir, file);  // ./test-fixture/apps/restaurant/...
migratingFiles.add(restaurantPath);
```

But ts-morph returns **absolute** paths:
```javascript
const resolvedPath = resolved.getFilePath();  // /Users/calebcreed/Downloads/.../test-fixture/apps/restaurant/...
```

So `migratingFiles.has(resolvedPath)` always returns `false`, causing valid dependencies to be flagged as "NOT in migration set".

## Investigation Steps

1. ✅ Checked if dependency files exist: They do
2. ✅ Checked if files are identical: They are
3. ✅ Checked dependency extractor: Working correctly (4 deps found)
4. ✅ Checked graph lookups: Working correctly (all targets in graph)
5. ✅ Checked analysis report: Clean subtrees correctly identified with all 7 files
6. ❌ **Checked migration validation**: Path mismatch found!

Key diagnostic:
```
subtree.files = ['src/app/core/state/store-json/store-json.actions.ts', ...]
migratingFiles = Set('./test-fixture/apps/restaurant/src/app/core/state/store-json/store-json.actions.ts')
ts-morph resolvedPath = '/Users/calebcreed/.../test-fixture/apps/restaurant/src/app/core/state/store-json/store-json.actions.ts'

migratingFiles.has(resolvedPath) => FALSE (path mismatch!)
```

## Fix Applied

**File:** `src/server/state-migration.ts`

Changed path construction to use `path.resolve()` for absolute paths:

```typescript
// Before (relative paths)
const restaurantDir = path.join(config.projectPath, 'apps/restaurant');
const restaurantPath = path.join(restaurantDir, file);
migratingFiles.add(restaurantPath);

// After (absolute paths)
const projectPath = path.resolve(config.projectPath);
const restaurantDir = path.join(projectPath, 'apps/restaurant');
const restaurantPath = path.resolve(restaurantDir, file);
migratingFiles.add(restaurantPath);
```

## Verification

1. ✅ `npm run build` - Compiles successfully
2. ✅ `npm test` - 75 tests pass
3. 🔜 Test migration via UI

## Remaining Issue (Not Blocking)

Angular template symbolic dependencies (`selector:`, `pipe:`, `directive:`) are included in dependency arrays but cannot be resolved to file paths. These block some clean subtrees from being detected.

Future fix: Resolve these symbolic references to actual component file paths.
