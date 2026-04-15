/**
 * HTML Report Generator - Creates interactive HTML reports
 */

import * as fs from 'fs';
import { AnalysisReport } from './types';

export class HtmlReporter {
  /**
   * Generate and save HTML report
   */
  generate(report: AnalysisReport, outputPath: string): void {
    const html = this.renderHtml(report);
    fs.writeFileSync(outputPath, html);
  }

  private escapeJsonForHtml(json: string): string {
    return json
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  private renderHtml(report: AnalysisReport): string {
    const { stats, cleanSubtrees, bottlenecks, files } = report;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Branch Consolidation Report</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 10px; font-size: 24px; }
    h2 { color: #c9d1d9; font-size: 18px; margin: 25px 0 15px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    h3 { color: #8b949e; font-size: 14px; margin: 15px 0 10px; }
    .meta { color: #8b949e; font-size: 13px; margin-bottom: 25px; }

    /* Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 30px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: 600; color: #58a6ff; }
    .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
    .stat-pct { font-size: 11px; color: #8b949e; }
    .stat-card.clean .stat-value { color: #3fb950; }
    .stat-card.warn .stat-value { color: #f0883e; }
    .stat-card.conflict .stat-value { color: #f85149; }
    .stat-card.movable .stat-value { color: #a371f7; }

    /* Tabs */
    .tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 1px solid #30363d; }
    .tab { padding: 10px 20px; cursor: pointer; border: none; background: none; color: #8b949e; font-size: 14px; border-bottom: 2px solid transparent; }
    .tab:hover { color: #c9d1d9; }
    .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* List containers */
    .list-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
    .list-item { padding: 14px 16px; border-bottom: 1px solid #21262d; display: flex; align-items: center; gap: 12px; }
    .list-item:last-child { border-bottom: none; }
    .list-item:hover { background: #1c2128; }

    /* Subtree items */
    .subtree-item { cursor: pointer; }
    .subtree-item.expanded { background: #1c2128; }
    .subtree-rank { color: #8b949e; font-size: 14px; width: 30px; }
    .subtree-size { background: #238636; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; min-width: 70px; text-align: center; }
    .subtree-path { flex: 1; font-family: monospace; font-size: 13px; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subtree-files { padding: 10px 16px 16px 58px; background: #0d1117; border-top: 1px solid #21262d; display: none; }
    .subtree-item.expanded + .subtree-files { display: block; }
    .subtree-file { font-family: monospace; font-size: 12px; color: #8b949e; padding: 3px 0; }

    /* Bottleneck items */
    .bottleneck-item { cursor: pointer; }
    .bottleneck-item.expanded { background: #1c2128; }
    .bottleneck-rank { color: #8b949e; font-size: 14px; width: 30px; }
    .bottleneck-unlock { background: #388bfd; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; min-width: 90px; text-align: center; }
    .bottleneck-lines { background: #30363d; color: #8b949e; padding: 2px 8px; border-radius: 10px; font-size: 11px; min-width: 70px; text-align: center; }
    .bottleneck-impact { background: #238636; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; min-width: 80px; text-align: center; }
    .bottleneck-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .bottleneck-status.conflict { background: #f8514933; color: #f85149; }
    .bottleneck-status.retail-only { background: #a371f733; color: #a371f7; }
    .bottleneck-status.restaurant-only { background: #f0883e33; color: #f0883e; }
    .bottleneck-path { flex: 1; font-family: monospace; font-size: 13px; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bottleneck-unlocks { padding: 10px 16px 16px 58px; background: #0d1117; border-top: 1px solid #21262d; display: none; }
    .bottleneck-item.expanded + .bottleneck-unlocks { display: block; }
    .bottleneck-unlock-file { font-family: monospace; font-size: 12px; color: #3fb950; padding: 3px 0; }
    .bottleneck-unlock-file::before { content: '→ '; color: #8b949e; }

    /* File list */
    .file-item { padding: 12px 16px; }
    .file-path { flex: 1; font-family: monospace; font-size: 13px; }
    .file-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .file-status.clean { background: #3fb95033; color: #3fb950; }
    .file-status.same-change { background: #3fb95033; color: #3fb950; }
    .file-status.retail-only { background: #a371f733; color: #a371f7; }
    .file-status.restaurant-only { background: #f0883e33; color: #f0883e; }
    .file-status.conflict { background: #f8514933; color: #f85149; }
    .file-clean-subtree { font-size: 10px; padding: 2px 6px; border-radius: 8px; background: #23863633; color: #3fb950; }

    /* Search and filter */
    .filter-bar { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; align-items: center; }
    .search-box { padding: 8px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; width: 280px; font-size: 13px; }
    .search-box:focus { outline: none; border-color: #58a6ff; }
    .filter-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; background: #161b22; color: #c9d1d9; cursor: pointer; font-size: 12px; }
    .filter-btn:hover { background: #1c2128; }
    .filter-btn.active { background: #388bfd33; border-color: #58a6ff; color: #58a6ff; }

    /* Empty state */
    .empty-state { padding: 40px; text-align: center; color: #8b949e; }

    /* Pagination */
    .pagination { padding: 15px; text-align: center; border-top: 1px solid #21262d; }
    .pagination-info { color: #8b949e; font-size: 12px; margin-bottom: 10px; }
    .pagination-btn { padding: 6px 14px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; margin: 0 5px; }
    .pagination-btn:hover { background: #2ea043; }
    .pagination-btn:disabled { background: #30363d; cursor: not-allowed; }

    /* Conflict items */
    .conflict-item { cursor: pointer; }
    .conflict-item.expanded { background: #1c2128; }
    .conflict-path { flex: 1; font-family: monospace; font-size: 13px; color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .conflict-details { padding: 16px; background: #0d1117; border-top: 1px solid #21262d; display: none; }
    .conflict-item.expanded + .conflict-details { display: block; }
    .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .diff-section { background: #161b22; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
    .diff-header { padding: 10px 12px; background: #21262d; font-size: 12px; font-weight: 500; color: #c9d1d9; border-bottom: 1px solid #30363d; }
    .diff-content { max-height: 400px; overflow: auto; padding: 8px 0; }
    .diff-line { font-family: monospace; font-size: 12px; padding: 1px 12px; white-space: pre; }
    .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-line.hunk { background: #388bfd26; color: #58a6ff; }
    .diff-line.context { color: #8b949e; }
    .no-diff { padding: 20px; color: #8b949e; text-align: center; font-size: 13px; }

    /* Graph */
    #graph-container { width: 100%; height: 600px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
    .graph-legend { display: flex; gap: 20px; margin-bottom: 15px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #8b949e; }
    .legend-dot { width: 12px; height: 12px; border-radius: 50%; }
    .legend-dot.clean { background: #3fb950; }
    .legend-dot.retail-only { background: #a371f7; }
    .legend-dot.restaurant-only { background: #f0883e; }
    .legend-dot.conflict { background: #f85149; }
    .legend-dot.same-change { background: #56d364; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Branch Consolidation Report</h1>
    <p class="meta">Generated: ${report.generatedAt}</p>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalFiles}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat-card clean">
        <div class="stat-value">${stats.cleanFiles}</div>
        <div class="stat-label">Clean</div>
        <div class="stat-pct">${stats.totalFiles > 0 ? ((stats.cleanFiles / stats.totalFiles) * 100).toFixed(1) : 0}%</div>
      </div>
      <div class="stat-card clean">
        <div class="stat-value">${stats.sameChangeFiles}</div>
        <div class="stat-label">Same Change</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-value">${stats.retailOnlyFiles}</div>
        <div class="stat-label">Retail Only</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-value">${stats.restaurantOnlyFiles}</div>
        <div class="stat-label">Restaurant Only</div>
      </div>
      <div class="stat-card conflict">
        <div class="stat-value">${stats.conflictFiles}</div>
        <div class="stat-label">Conflicts</div>
      </div>
      <div class="stat-card movable">
        <div class="stat-value">${stats.immediatelyMovable}</div>
        <div class="stat-label">Immediately Movable</div>
        <div class="stat-pct">${stats.totalFiles > 0 ? ((stats.immediatelyMovable / stats.totalFiles) * 100).toFixed(1) : 0}%</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" data-tab="subtrees">Clean Subtrees (${cleanSubtrees.length})</button>
      <button class="tab" data-tab="bottlenecks">Bottlenecks (${bottlenecks.filter(b => b.unlockCount > 0).length})</button>
      <button class="tab" data-tab="conflicts">Conflicts (${files.filter(f => f.status === 'conflict').length})</button>
      <button class="tab" data-tab="files">All Files (${files.length})</button>
      <button class="tab" data-tab="graph">Dependency Graph</button>
    </div>

    <!-- Clean Subtrees Tab -->
    <div id="subtrees" class="tab-content active">
      <h3>Clean subtrees can be safely moved to the shared folder. Ranked by size (largest first).</h3>
      <div class="list-container" id="subtrees-list"></div>
    </div>

    <!-- Bottlenecks Tab -->
    <div id="bottlenecks" class="tab-content">
      <h3>Ranked by impact score (files unlocked per line changed). Higher impact = best ROI for consolidation effort.</h3>
      <div class="list-container" id="bottlenecks-list"></div>
    </div>

    <!-- Conflicts Tab -->
    <div id="conflicts" class="tab-content">
      <h3>Files with different changes in both branches. Click to expand and see diffs.</h3>
      <div class="list-container" id="conflicts-list"></div>
    </div>

    <!-- All Files Tab -->
    <div id="files" class="tab-content">
      <div class="filter-bar">
        <input type="text" class="search-box" placeholder="Search files..." id="file-search">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="clean">Clean</button>
        <button class="filter-btn" data-filter="same-change">Same Change</button>
        <button class="filter-btn" data-filter="retail-only">Retail Only</button>
        <button class="filter-btn" data-filter="restaurant-only">Restaurant Only</button>
        <button class="filter-btn" data-filter="conflict">Conflict</button>
      </div>
      <div class="list-container" id="files-list"></div>
    </div>

    <!-- Dependency Graph Tab -->
    <div id="graph" class="tab-content">
      <h3>Interactive dependency graph. Nodes colored by status. Drag to move, scroll to zoom.</h3>
      <div class="graph-legend">
        <div class="legend-item"><span class="legend-dot clean"></span> Clean</div>
        <div class="legend-item"><span class="legend-dot same-change"></span> Same Change</div>
        <div class="legend-item"><span class="legend-dot retail-only"></span> Retail Only</div>
        <div class="legend-item"><span class="legend-dot restaurant-only"></span> Restaurant Only</div>
        <div class="legend-item"><span class="legend-dot conflict"></span> Conflict</div>
      </div>
      <div id="graph-container"></div>
    </div>
  </div>

  <script id="report-data" type="application/json">
${this.escapeJsonForHtml(JSON.stringify(report))}
  </script>

  <script>
    const DATA = JSON.parse(document.getElementById('report-data').textContent);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'graph') renderGraph();
      });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFileList(btn.dataset.filter);
      });
    });

    // Search
    document.getElementById('file-search').addEventListener('input', (e) => {
      const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
      renderFileList(activeFilter, e.target.value);
    });

    // Render clean subtrees
    function renderSubtrees() {
      const container = document.getElementById('subtrees-list');

      if (DATA.cleanSubtrees.length === 0) {
        container.innerHTML = '<div class="empty-state">No clean subtrees found</div>';
        return;
      }

      let html = '';
      DATA.cleanSubtrees.forEach((tree, i) => {
        html += \`
          <div class="list-item subtree-item" data-index="\${i}">
            <span class="subtree-rank">\${i + 1}.</span>
            <span class="subtree-size">\${tree.totalFiles} files</span>
            <span class="subtree-path">\${tree.rootPath}</span>
          </div>
          <div class="subtree-files">
            \${tree.files.slice(0, 20).map(f => \`<div class="subtree-file">\${f}</div>\`).join('')}
            \${tree.files.length > 20 ? \`<div class="subtree-file" style="color:#58a6ff">... and \${tree.files.length - 20} more</div>\` : ''}
          </div>
        \`;
      });
      container.innerHTML = html;

      // Click to expand
      container.querySelectorAll('.subtree-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
      });
    }

    // Render bottlenecks
    function renderBottlenecks() {
      const container = document.getElementById('bottlenecks-list');

      const meaningful = DATA.bottlenecks.filter(b => b.unlockCount > 0);

      if (meaningful.length === 0) {
        container.innerHTML = '<div class="empty-state">No bottlenecks found - no single file is blocking clean subtrees</div>';
        return;
      }

      let html = '';
      meaningful.forEach((b, i) => {
        const statusClass = b.status.replace('-', '-');
        const impactDisplay = b.impactScore >= 0.01 ? b.impactScore.toFixed(2) : '<0.01';
        html += \`
          <div class="list-item bottleneck-item" data-index="\${i}">
            <span class="bottleneck-rank">\${i + 1}.</span>
            <span class="bottleneck-unlock">Unlocks \${b.unlockCount}</span>
            <span class="bottleneck-lines" title="Lines to change">\${b.linesChanged} lines</span>
            <span class="bottleneck-impact" title="Impact score (unlocks per line)">\${impactDisplay} impact</span>
            <span class="bottleneck-status \${statusClass}">\${b.status.replace('-', ' ').toUpperCase()}</span>
            <span class="bottleneck-path">\${b.relativePath}</span>
          </div>
          <div class="bottleneck-unlocks">
            \${b.unlockedPaths.map(p => \`<div class="bottleneck-unlock-file">\${p}</div>\`).join('')}
            \${b.unlockCount > b.unlockedPaths.length ? \`<div class="bottleneck-unlock-file" style="color:#8b949e">... and \${b.unlockCount - b.unlockedPaths.length} more</div>\` : ''}
          </div>
        \`;
      });
      container.innerHTML = html;

      // Click to expand
      container.querySelectorAll('.bottleneck-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
      });
    }

    // Render file list with pagination
    const PAGE_SIZE = 100;
    let currentPage = 0;
    let filteredFiles = [];

    function renderFileList(filter = 'all', search = '', resetPage = true) {
      if (resetPage) currentPage = 0;

      const container = document.getElementById('files-list');

      filteredFiles = DATA.files;
      if (filter !== 'all') {
        filteredFiles = filteredFiles.filter(f => f.status === filter);
      }
      if (search) {
        const lower = search.toLowerCase();
        filteredFiles = filteredFiles.filter(f => f.relativePath.toLowerCase().includes(lower));
      }
      filteredFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      const start = currentPage * PAGE_SIZE;
      const pageFiles = filteredFiles.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(filteredFiles.length / PAGE_SIZE);

      if (filteredFiles.length === 0) {
        container.innerHTML = '<div class="empty-state">No files match the filter</div>';
        return;
      }

      let html = '';
      pageFiles.forEach(f => {
        const statusClass = f.status;
        html += \`
          <div class="list-item file-item">
            <span class="file-path">\${f.relativePath}</span>
            <span class="file-status \${statusClass}">\${f.status.replace('-', ' ').toUpperCase()}</span>
            \${f.isCleanSubtree ? '<span class="file-clean-subtree">movable</span>' : ''}
          </div>
        \`;
      });

      // Pagination
      if (totalPages > 1) {
        html += \`
          <div class="pagination">
            <div class="pagination-info">Showing \${start + 1}-\${Math.min(start + PAGE_SIZE, filteredFiles.length)} of \${filteredFiles.length}</div>
            <button class="pagination-btn" \${currentPage === 0 ? 'disabled' : ''} onclick="changePage(-1)">Previous</button>
            <button class="pagination-btn" \${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="changePage(1)">Next</button>
          </div>
        \`;
      }

      container.innerHTML = html;
    }

    function changePage(dir) {
      currentPage += dir;
      const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
      const search = document.getElementById('file-search').value;
      renderFileList(activeFilter, search, false);
    }

    // Render conflicts list
    function renderConflicts() {
      const container = document.getElementById('conflicts-list');
      const conflicts = DATA.files.filter(f => f.status === 'conflict');

      if (conflicts.length === 0) {
        container.innerHTML = '<div class="empty-state">No conflicts found</div>';
        return;
      }

      let html = '';
      conflicts.forEach((f, i) => {
        const retailDiff = f.diffText?.retail || '';
        const restaurantDiff = f.diffText?.restaurant || '';

        html += \`
          <div class="list-item conflict-item" data-index="\${i}">
            <span class="conflict-path">\${f.relativePath}</span>
            <span class="file-status conflict">CONFLICT</span>
          </div>
          <div class="conflict-details">
            <div class="diff-grid">
              <div class="diff-section">
                <div class="diff-header">Retail vs Base</div>
                <div class="diff-content">
                  \${retailDiff ? formatDiff(retailDiff) : '<div class="no-diff">No diff available</div>'}
                </div>
              </div>
              <div class="diff-section">
                <div class="diff-header">Restaurant vs Base</div>
                <div class="diff-content">
                  \${restaurantDiff ? formatDiff(restaurantDiff) : '<div class="no-diff">No diff available</div>'}
                </div>
              </div>
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;

      // Click to expand
      container.querySelectorAll('.conflict-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
      });
    }

    function formatDiff(diff) {
      return diff.split('\\n').map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return \`<div class="diff-line add">\${escapeHtml(line)}</div>\`;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          return \`<div class="diff-line del">\${escapeHtml(line)}</div>\`;
        } else if (line.startsWith('@@')) {
          return \`<div class="diff-line hunk">\${escapeHtml(line)}</div>\`;
        }
        return \`<div class="diff-line context">\${escapeHtml(line)}</div>\`;
      }).join('');
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Graph rendering
    let graphRendered = false;

    function renderGraph() {
      const container = document.getElementById('graph-container');

      if (!graphRendered) {
        // Build edges from dependencies
        const edges = [];
        const nodeIds = new Set(DATA.files.map(f => f.relativePath));

        DATA.files.forEach(f => {
          f.dependencies.forEach(dep => {
            if (nodeIds.has(dep)) {
              edges.push({ source: f.relativePath, target: dep });
            }
          });
        });

        // Show button to start rendering
        container.innerHTML = \`
          <div style="padding:40px;text-align:center;">
            <p style="color:#8b949e;margin-bottom:20px;">Graph has \${DATA.files.length} nodes and \${edges.length} edges.</p>
            <button id="render-graph-btn" style="padding:10px 20px;background:#238636;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
              Render Graph
            </button>
            <p style="color:#8b949e;margin-top:15px;font-size:12px;">Large graphs may take a moment to layout.</p>
          </div>
        \`;
        document.getElementById('render-graph-btn').addEventListener('click', () => {
          graphRendered = true;
          actuallyRenderGraph();
        });
        return;
      }
    }

    function actuallyRenderGraph() {
      const container = document.getElementById('graph-container');
      container.innerHTML = '<div style="padding:20px;color:#8b949e;">Rendering graph...</div>';

      // Use setTimeout to let the UI update before heavy computation
      setTimeout(() => doRenderGraph(), 50);
    }

    function doRenderGraph() {
      const container = document.getElementById('graph-container');
      const width = container.clientWidth || 1200;
      const height = 600;

      // Color by status
      const colors = {
        'clean': '#3fb950',
        'same-change': '#56d364',
        'retail-only': '#a371f7',
        'restaurant-only': '#f0883e',
        'conflict': '#f85149'
      };

      // Build edges from dependencies
      const nodeIds = new Set(DATA.files.map(f => f.relativePath));
      const edges = [];
      DATA.files.forEach(f => {
        f.dependencies.forEach(dep => {
          if (nodeIds.has(dep)) {
            edges.push({ source: f.relativePath, target: dep });
          }
        });
      });

      // Only include connected nodes
      const connectedIds = new Set();
      edges.forEach(e => {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      });

      const nodes = DATA.files
        .filter(f => connectedIds.has(f.relativePath))
        .map(f => ({ id: f.relativePath, status: f.status }));

      const links = edges.filter(e => connectedIds.has(e.source) && connectedIds.has(e.target));

      console.log('Rendering graph with', nodes.length, 'nodes and', links.length, 'edges');

      if (nodes.length === 0) {
        container.innerHTML = '<div style="padding:20px;color:#8b949e;">No connected nodes to display.</div>';
        return;
      }

      // Clear and create SVG
      container.innerHTML = '';
      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', '#161b22');

      // Add zoom behavior
      const g = svg.append('g');
      svg.call(d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => g.attr('transform', event.transform)));

      // Create force simulation
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));

      // Draw links
      const link = g.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', '#30363d')
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.6);

      // Draw nodes
      const node = g.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 6)
        .attr('fill', d => colors[d.status] || '#8b949e')
        .attr('stroke', '#0d1117')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }));

      // Add tooltips
      node.append('title').text(d => d.id + ' (' + d.status + ')');

      // Add labels (only for smaller graphs)
      if (nodes.length < 100) {
        const labels = g.append('g')
          .selectAll('text')
          .data(nodes)
          .enter().append('text')
          .text(d => d.id.split('/').pop().substring(0, 12))
          .attr('font-size', 8)
          .attr('fill', '#8b949e')
          .attr('text-anchor', 'middle')
          .attr('dy', 15);

        simulation.on('tick', () => {
          link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
              .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
          node.attr('cx', d => d.x).attr('cy', d => d.y);
          labels.attr('x', d => d.x).attr('y', d => d.y);
        });
      } else {
        simulation.on('tick', () => {
          link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
              .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
          node.attr('cx', d => d.x).attr('cy', d => d.y);
        });
      }

      // Stop simulation after settling
      simulation.alpha(1).restart();
      setTimeout(() => simulation.stop(), 5000);
    }

    // Initial render
    renderSubtrees();
    renderBottlenecks();
    renderConflicts();
    renderFileList();
  </script>
</body>
</html>`;
  }
}
