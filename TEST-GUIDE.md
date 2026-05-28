# Branch Consolidator - Manual Test Guide

This guide walks a reviewer through all features of the Branch Consolidator tool.

**Estimated time:** 15-20 minutes

**Prerequisites:**
- Access to the Linga VM
- WebPOS repo at `/workspaces/webpos`
- Node.js installed

---

## 1. Setup

```bash
# Navigate to the consolidator
cd /workspaces/webpos/consolidation-report

# Pull latest
git pull

# Install dependencies (if needed)
npm install

# Build
npm run build
```

**Expected:** Build completes without errors.

---

## 2. Update Source Data

```bash
# Fix git permissions if needed
sudo chown -R $(whoami) /workspaces/webpos/.git

# Run the update script
./update-branches.sh
```

**Expected:**
- Script fetches from origin
- Copies restaurant (master) and retail (retail-master) source files
- Shows file counts for both branches (should be 800+ TypeScript files each)

---

## 3. Start the Server

```bash
npm start
```

**Expected:** Server starts on http://localhost:3000

Open in browser: http://localhost:3000

---

## 4. Configure the Project

In the UI:

1. Click the **Configuration** panel to expand it
2. Set the fields:
   - **Project Path:** `/workspaces/webpos`
   - **Build Command:** `npx tsc --noEmit`
   - **Shared Path:** `apps/merged`
   - **tsconfig Path:** `/workspaces/webpos/apps/app/tsconfig.app.json`
3. Click **Save Configuration**

**Expected:** Configuration saves successfully.

---

## 5. Run Analysis

1. Click the **Analyze** button in the header

**Expected:**
- Output panel shows progress messages
- Stats row appears showing:
  - Total Files (~900)
  - Clean files (~600)
  - Conflict files (~270)
  - Clean Subtrees count
  - Bottlenecks count

---

## 6. Test Each Tab

### 6.1 Clean Subtrees Tab
1. Click **Clean Subtrees** tab
2. Review the list of subtrees ranked by size

**Expected:** Shows list of clean subtrees with file counts and "Migrate" buttons.

### 6.2 Conflicts Tab
1. Click **Conflicts** tab
2. Scroll through the conflict files

**Expected:** Shows ~270 files with conflict status.

### 6.3 All Files Tab
1. Click **All Files** tab
2. Try the filter buttons (All, Clean, Conflicts, Restaurant Only, Retail Only)
3. Try the search box - search for "auth" or "cart"

**Expected:** Filters work correctly. Search narrows the list.

### 6.4 Graph Tab
1. Click **Graph** tab
2. Click **Show Dependency Graph**
3. Try zooming and panning
4. Hover over nodes to see file names

**Expected:** D3 graph renders with colored nodes (green=clean, red=conflict, etc.)

### 6.5 Bottlenecks Tab
1. Click **Bottlenecks** tab
2. Review files ranked by impact score

**Expected:** Shows high-impact files that block other files from being clean.

### 6.6 Timeline Tab
1. Click **Timeline** tab

**Expected:** Shows "No migrations yet" or list of past migrations if any exist.

---

## 7. Test Clustering

1. Click **Clusters** tab
2. Click **Run Clustering**
3. Wait for clustering to complete

**Expected:**
- Progress messages in output
- Cluster cards appear showing grouped files
- Unassigned files sidebar on the right

### 7.1 Test Drag and Drop (if implemented)
1. Try dragging a file from one cluster to another
2. Try dragging a file to "Unassigned"

**Expected:** Files move between clusters.

---

## 8. Test Git Analysis

1. Click **Git Analysis** tab
2. Verify the default values:
   - Branch A: `origin/master`
   - Branch B: `origin/retail-master`
   - Filter Path: `apps/app/src`
   - Commit Limit: `500`

### 8.1 Explore History
1. Click **Explore History**

**Expected:**
- Shows merge base commit (if found)
- Shows branch root commits
- Shows recent merge commits
- Shows recommendation text

### 8.2 Analyze Commits
1. Click **Analyze Commits**
2. Wait for analysis (may take a minute)

**Expected:**
- Shows commit counts for each branch
- Shows conflict file count
- Shows clusters for Branch A and Branch B
- Tabs to switch between viewing each

---

## 9. Test Jira Export

After running clustering:

```bash
# In a separate terminal
curl -X POST http://localhost:3000/api/export-jira \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "PNC", "issueType": "Task"}'
```

**Expected:** Returns JSON with:
- `bulkImport` - Jira bulk create format
- `issues` - Array of individual issues
- `csv` - CSV format string
- `summary` - Stats (totalClusters, totalFiles, totalPoints)

### 9.1 Save Export to File
```bash
curl -X POST http://localhost:3000/api/export-jira \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "PNC"}' \
  -o jira-export.json

# View the summary
cat jira-export.json | jq '.summary'
```

---

## 10. Test Migration (Optional - Makes Changes)

⚠️ **Warning:** This will move files. Only do this on a test branch.

```bash
# Create a test branch first
cd /workspaces/webpos
git checkout -b test-consolidator-migration
```

1. Go to **Clean Subtrees** tab
2. Find a small subtree (1-3 files)
3. Click **Migrate**

**Expected:**
- Output shows migration progress
- Files are moved to shared directory
- Timeline tab shows the migration

### 10.1 Test Rollback
1. Go to **Timeline** tab
2. Click the rollback button on the migration

**Expected:**
- Files are restored to original location
- Migration is marked as rolled back

```bash
# Clean up test branch
cd /workspaces/webpos
git checkout master
git branch -D test-consolidator-migration
```

---

## 11. API Endpoint Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET/POST | Get or set configuration |
| `/api/analyze` | POST | Run full analysis |
| `/api/report` | GET | Get current analysis report |
| `/api/cluster` | POST | Run clustering algorithm |
| `/api/clusters` | GET | Get current cluster state |
| `/api/cluster/move` | POST | Move file between clusters |
| `/api/git-explore` | POST | Explore git history landmarks |
| `/api/git-analyze` | POST | Analyze commits for clustering |
| `/api/export-jira` | POST | Export clusters to Jira JSON |
| `/api/migrate` | POST | Migrate a clean subtree |
| `/api/rollback` | POST | Rollback a migration |

---

## 12. Checklist

- [ ] Setup and build successful
- [ ] Update branches script works
- [ ] Server starts and UI loads
- [ ] Configuration saves
- [ ] Analysis runs and shows stats
- [ ] Clean Subtrees tab shows data
- [ ] Conflicts tab shows data
- [ ] All Files tab filtering works
- [ ] Graph tab renders visualization
- [ ] Bottlenecks tab shows data
- [ ] Clustering runs and shows results
- [ ] Git Analysis - Explore works
- [ ] Git Analysis - Analyze works
- [ ] Jira export returns valid JSON
- [ ] (Optional) Migration works
- [ ] (Optional) Rollback works

---

## Troubleshooting

**"No config set" error:**
- Make sure you saved the configuration in step 4

**Git permission errors:**
- Run: `sudo chown -R $(whoami) /workspaces/webpos/.git`

**Build fails:**
- Check Node version: `node --version` (should be 18+)
- Try: `rm -rf node_modules && npm install`

**Analysis shows 0 files:**
- Check that update-branches.sh ran successfully
- Verify files exist in `src/apps/restaurant` and `src/apps/retail`

**Graph doesn't render:**
- Try hard refresh (Ctrl+Shift+R)
- Check browser console for errors
