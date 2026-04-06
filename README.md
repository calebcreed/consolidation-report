# WebPOS Consolidator

Analyzes divergence between retail and restaurant Angular codebases to help plan consolidation into a shared codebase.

## What It Does

1. **Parses Angular files** - Extracts components, services, modules, directives, pipes with their metadata
2. **Matches files** - Maps retail files to their restaurant counterparts by path, class name, or selector
3. **Three-way diff** - Compares both branches against the common ancestor to determine:
   - CLEAN: Identical in both branches
   - SAME_CHANGE: Both changed identically
   - RETAIL_ONLY: Only retail diverged
   - RESTAURANT_ONLY: Only restaurant diverged
   - CONFLICT: Both diverged differently
4. **Dependency graph** - Builds a graph of file dependencies (imports, DI, template selectors)
5. **Clean subtree detection** - Finds subtrees where the root and all descendants are clean/same-change
6. **Interactive report** - HTML report with filters, search, diffs, and graph visualization

## Installation

```bash
cd webpos-consolidator
npm install
npm run build
```

## Usage

### Full Analysis

```bash
npm start -- analyze \
  --retail ./apps/retail/src \
  --restaurant ./apps/restaurant/src \
  --base-commit abc123def \
  --output ./report.html
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `-r, --retail <path>` | Yes | Path to retail app source |
| `-t, --restaurant <path>` | Yes | Path to restaurant app source |
| `-b, --base-commit <hash>` | Yes | Git commit before the split |
| `-s, --shared <path>` | No | Path to shared directory (default: ./shared) |
| `-o, --output <path>` | No | HTML report output (default: ./consolidation-report.html) |
| `-m, --mapping <path>` | No | Mapping file path (default: ./consolidation-mapping.json) |
| `--repo-root <path>` | No | Git repo root (auto-detected if not specified) |

### Quick Stats

Get a quick summary without generating the full report:

```bash
npm start -- stats \
  --retail ./apps/retail/src \
  --restaurant ./apps/restaurant/src \
  --base-commit abc123def
```

### Generate Mapping Only

Generate the file mapping without running the full analysis:

```bash
npm start -- match \
  --retail ./apps/retail/src \
  --restaurant ./apps/restaurant/src \
  --output ./mapping.json
```

Edit the mapping file to add manual overrides, then run the full analysis.

## Finding the Base Commit

To find the commit where retail and restaurant diverged:

```bash
# Find when the apps/ directory structure was created
git log --oneline --all -- apps/retail apps/restaurant | tail -20

# Or find the merge-base if they were branches
git merge-base branch-a branch-b
```

## Output

### HTML Report

Open `consolidation-report.html` in a browser. Features:

- **Stats cards** - Overview of file categories
- **All Files tab** - Searchable, filterable list of all files with expandable diffs
- **Movable tab** - Clean subtrees that can be moved to shared immediately
- **Conflicts tab** - Files requiring manual merge
- **Graph tab** - Visual dependency graph (for smaller codebases)

### Mapping File

`consolidation-mapping.json` contains:

```json
{
  "mappings": [
    {
      "retailFile": "/path/to/retail/auth.service.ts",
      "restaurantFile": "/path/to/restaurant/auth.service.ts",
      "matchMethod": "path"
    }
  ],
  "retailOnly": [...],
  "restaurantOnly": [...],
  "manualOverrides": {
    "src/old-name.ts": "src/new-name.ts"
  }
}
```

Add entries to `manualOverrides` to fix incorrect matches, then re-run analysis.

## Consolidation Strategy

Based on the report:

1. **Start with clean subtrees** - These can be moved to shared with no changes
2. **Handle trivial merges** - RETAIL_ONLY and RESTAURANT_ONLY files need one branch's changes applied
3. **Tackle conflicts last** - These need manual review and merging

## Dependency Detection

The tool detects these Angular dependency patterns:

| Pattern | Example |
|---------|---------|
| ES imports | `import { X } from './x'` |
| NgModule imports | `@NgModule({ imports: [XModule] })` |
| Declarations | `@NgModule({ declarations: [XComponent] })` |
| Providers | `providers: [XService]` |
| Constructor DI | `constructor(private x: XService)` |
| Template selectors | `<app-x>` |
| Template pipes | `{{ y \| xPipe }}` |
| Directive selectors | `[appX]` |
