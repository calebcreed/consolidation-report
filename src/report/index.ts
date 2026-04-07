import * as fs from 'fs';
import * as path from 'path';
import { AnalysisResult, FileNode, DependencyEdge } from '../config';
import { GraphAnalyzer } from '../graph/analyzer';
import { ThreeWayDiffResult, GitDiffer } from '../diff';

interface ReportData {
  generatedAt: string;
  stats: AnalysisResult['stats'];
  nodes: Array<FileNode & { diffs?: { retail: string; restaurant: string } }>;
  edges: DependencyEdge[];
  movableTrees: ReturnType<GraphAnalyzer['getMovableTrees']>;
  priorities: ReturnType<GraphAnalyzer['getConsolidationPriority']>;
}

export class ReportGenerator {
  private differ: GitDiffer;
  private analyzer: GraphAnalyzer;

  constructor(differ: GitDiffer) {
    this.differ = differ;
    this.analyzer = new GraphAnalyzer();
  }

  private escapeJsonForHtml(json: string): string {
    // Escape sequences that would break HTML or script parsing
    return json
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  generate(
    result: AnalysisResult,
    diffResults: Map<string, ThreeWayDiffResult>,
    outputPath: string
  ): void {
    const movableTrees = this.analyzer.getMovableTrees(result);
    const priorities = this.analyzer.getConsolidationPriority(result);

    // Prepare node data - only include diffs for CONFLICT files to keep HTML size manageable
    const nodesWithDiffs: ReportData['nodes'] = [];
    const MAX_DIFF_LINES = 100;
    const MAX_DIFFS = 50; // Only embed diffs for first 50 conflict files
    let diffCount = 0;

    for (const node of result.nodes.values()) {
      let diffs: { retail: string; restaurant: string } | undefined;

      // Only include diffs for conflict files, and limit total
      if (node.divergence?.type === 'CONFLICT' && diffCount < MAX_DIFFS) {
        const diffResult = diffResults.get(node.retailPath || node.restaurantPath || '');
        if (diffResult) {
          const filename = node.relativePath;
          let { retailDiff, restaurantDiff } = this.differ.generateUnifiedDiff(
            diffResult.baseContent,
            diffResult.retailContent,
            diffResult.restaurantContent,
            filename
          );

          // Truncate large diffs
          const truncate = (diff: string): string => {
            const lines = diff.split('\n');
            if (lines.length > MAX_DIFF_LINES) {
              return lines.slice(0, MAX_DIFF_LINES).join('\n') + '\n... truncated (' + (lines.length - MAX_DIFF_LINES) + ' more lines)';
            }
            return diff;
          };

          diffs = { retail: truncate(retailDiff), restaurant: truncate(restaurantDiff) };
          diffCount++;
        }
      }

      // Slim down node data - only include essential fields
      nodesWithDiffs.push({
        id: node.id,
        relativePath: node.relativePath,
        type: node.type,
        divergence: node.divergence,
        dependencies: node.dependencies.slice(0, 20), // Limit deps shown
        dependents: node.dependents.slice(0, 20),
        isCleanSubtree: node.isCleanSubtree,
        diffs,
      } as ReportData['nodes'][0]);
    }

    console.log(`  Including diffs for ${diffCount} conflict files`);

    // Limit edges for large codebases
    const maxEdges = 1000;
    const edges = result.edges.length > maxEdges
      ? result.edges.slice(0, maxEdges)
      : result.edges;

    const reportData: ReportData = {
      generatedAt: new Date().toISOString(),
      stats: result.stats,
      nodes: nodesWithDiffs,
      edges,
      movableTrees: movableTrees.slice(0, 50), // Limit movable trees
      priorities: priorities.slice(0, 100), // Limit priorities
    };

    console.log(`  Report data: ${nodesWithDiffs.length} nodes, ${edges.length} edges`);

    const html = this.generateHtml(reportData);
    fs.writeFileSync(outputPath, html);
    console.log(`Report generated: ${outputPath}`);
  }

  private generateHtml(data: ReportData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebPOS Consolidation Report</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
    .container { max-width: 1600px; margin: 0 auto; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 10px; }
    h2 { color: #8b949e; font-size: 18px; margin: 20px 0 10px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    h3 { color: #c9d1d9; font-size: 14px; margin: 15px 0 8px; }
    .meta { color: #8b949e; font-size: 12px; margin-bottom: 20px; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 600; color: #58a6ff; }
    .stat-label { font-size: 12px; color: #8b949e; margin-top: 5px; }
    .stat-card.clean .stat-value { color: #3fb950; }
    .stat-card.conflict .stat-value { color: #f85149; }
    .stat-card.retail .stat-value { color: #a371f7; }
    .stat-card.restaurant .stat-value { color: #f0883e; }

    .tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 1px solid #30363d; }
    .tab { padding: 10px 20px; cursor: pointer; border: none; background: none; color: #8b949e; font-size: 14px; border-bottom: 2px solid transparent; }
    .tab:hover { color: #c9d1d9; }
    .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .file-list { background: #161b22; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
    .file-item { padding: 12px 15px; border-bottom: 1px solid #30363d; cursor: pointer; display: flex; align-items: center; gap: 10px; }
    .file-item:last-child { border-bottom: none; }
    .file-item:hover { background: #1f2428; }
    .file-item.expanded { background: #1f2428; }

    .file-path { flex: 1; font-family: monospace; font-size: 13px; }
    .file-type { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #30363d; color: #8b949e; }
    .file-type.component { background: #388bfd33; color: #58a6ff; }
    .file-type.service { background: #3fb95033; color: #3fb950; }
    .file-type.module { background: #a371f733; color: #a371f7; }

    .divergence-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .divergence-badge.CLEAN { background: #3fb95033; color: #3fb950; }
    .divergence-badge.SAME_CHANGE { background: #3fb95033; color: #3fb950; }
    .divergence-badge.RETAIL_ONLY { background: #a371f733; color: #a371f7; }
    .divergence-badge.RESTAURANT_ONLY { background: #f0883e33; color: #f0883e; }
    .divergence-badge.CONFLICT { background: #f8514933; color: #f85149; }

    .changes { font-size: 11px; color: #8b949e; }
    .changes .add { color: #3fb950; }
    .changes .del { color: #f85149; }

    .file-details { padding: 15px; background: #0d1117; border-top: 1px solid #30363d; display: none; }
    .file-item.expanded + .file-details { display: block; }

    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .detail-section { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 10px; }
    .detail-section h4 { font-size: 12px; color: #8b949e; margin-bottom: 8px; }

    .diff-container { max-height: 400px; overflow: auto; }
    .diff { font-family: monospace; font-size: 12px; white-space: pre; line-height: 1.4; }
    .diff-line { padding: 0 10px; }
    .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-line.hunk { background: #388bfd26; color: #58a6ff; }

    .deps-list { font-size: 12px; }
    .dep-item { padding: 4px 0; color: #8b949e; }
    .dep-item a { color: #58a6ff; text-decoration: none; }
    .dep-item a:hover { text-decoration: underline; }

    .tree-item { padding: 10px 15px; border-bottom: 1px solid #30363d; }
    .tree-item:last-child { border-bottom: none; }
    .tree-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .tree-files { font-size: 12px; color: #8b949e; padding-left: 20px; }

    #graph-container { width: 100%; height: 600px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; }

    .filter-bar { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
    .filter-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; background: #161b22; color: #c9d1d9; cursor: pointer; font-size: 12px; }
    .filter-btn:hover { background: #1f2428; }
    .filter-btn.active { background: #388bfd33; border-color: #58a6ff; color: #58a6ff; }

    .search-box { padding: 8px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; width: 300px; }
    .search-box:focus { outline: none; border-color: #58a6ff; }

    .priority-high { border-left: 3px solid #3fb950; }
    .priority-medium { border-left: 3px solid #f0883e; }
    .priority-low { border-left: 3px solid #f85149; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WebPOS Consolidation Report</h1>
    <p class="meta">Generated: ${data.generatedAt}</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.stats.totalFiles}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat-card clean">
        <div class="stat-value">${data.stats.cleanFiles}</div>
        <div class="stat-label">Clean (Identical)</div>
      </div>
      <div class="stat-card clean">
        <div class="stat-value">${data.stats.sameChangeFiles}</div>
        <div class="stat-label">Same Change</div>
      </div>
      <div class="stat-card retail">
        <div class="stat-value">${data.stats.retailOnlyFiles}</div>
        <div class="stat-label">Retail Only Changed</div>
      </div>
      <div class="stat-card restaurant">
        <div class="stat-value">${data.stats.restaurantOnlyFiles}</div>
        <div class="stat-label">Restaurant Only Changed</div>
      </div>
      <div class="stat-card conflict">
        <div class="stat-value">${data.stats.conflictFiles}</div>
        <div class="stat-label">Conflicts</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="files">All Files</button>
      <button class="tab" data-tab="movable">Movable to Shared</button>
      <button class="tab" data-tab="conflicts">Conflicts</button>
      <button class="tab" data-tab="graph">Dependency Graph</button>
    </div>

    <div id="files" class="tab-content active">
      <div class="filter-bar">
        <input type="text" class="search-box" placeholder="Search files..." id="file-search">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="CLEAN">Clean</button>
        <button class="filter-btn" data-filter="SAME_CHANGE">Same Change</button>
        <button class="filter-btn" data-filter="RETAIL_ONLY">Retail Only</button>
        <button class="filter-btn" data-filter="RESTAURANT_ONLY">Restaurant Only</button>
        <button class="filter-btn" data-filter="CONFLICT">Conflicts</button>
      </div>
      <div class="file-list" id="file-list"></div>
    </div>

    <div id="movable" class="tab-content">
      <h2>Clean Subtrees (Safe to Move to Shared)</h2>
      <p class="meta">These subtrees have no divergence and all their dependencies are also clean.</p>
      <div class="file-list" id="movable-list"></div>
    </div>

    <div id="conflicts" class="tab-content">
      <h2>Files Requiring Manual Merge</h2>
      <p class="meta">Both branches modified these files differently. Review and merge manually.</p>
      <div class="file-list" id="conflict-list"></div>
    </div>

    <div id="graph" class="tab-content">
      <h2>Dependency Graph</h2>
      <div id="graph-container"></div>
    </div>
  </div>

  <script id="report-data" type="application/json">
${this.escapeJsonForHtml(JSON.stringify(data))}
  </script>
  <script>
    let DATA;
    try {
      DATA = JSON.parse(document.getElementById('report-data').textContent);
      console.log('Loaded DATA:', DATA.nodes.length, 'nodes,', DATA.edges.length, 'edges');
    } catch (e) {
      console.error('Failed to parse report data:', e);
      document.body.innerHTML = '<div style="padding:20px;color:red;">Error loading report data: ' + e.message + '</div>';
      throw e;
    }

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

    let currentPage = 0;
    const PAGE_SIZE = 100;
    const CHUNK_SIZE = 20; // Render this many items per frame
    let filteredNodes = [];
    let renderAbort = null;

    function renderFileList(filter = 'all', search = '', resetPage = true) {
      const container = document.getElementById('file-list');

      // Abort any in-progress render
      if (renderAbort) renderAbort.abort = true;
      const thisRender = { abort: false };
      renderAbort = thisRender;

      if (resetPage) currentPage = 0;

      filteredNodes = DATA.nodes;
      if (filter !== 'all') {
        filteredNodes = filteredNodes.filter(n => n.divergence?.type === filter);
      }
      if (search) {
        const lower = search.toLowerCase();
        filteredNodes = filteredNodes.filter(n => n.relativePath.toLowerCase().includes(lower));
      }
      filteredNodes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      const start = currentPage * PAGE_SIZE;
      const pageNodes = filteredNodes.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(filteredNodes.length / PAGE_SIZE);

      // Show loading state with progress
      container.innerHTML = '<div style="padding:20px;color:#8b949e;">Loading...</div>';

      // Render in chunks to avoid blocking UI
      let rendered = 0;
      const fragment = document.createDocumentFragment();

      function renderChunk() {
        if (thisRender.abort) return;

        const chunk = pageNodes.slice(rendered, rendered + CHUNK_SIZE);
        for (const node of chunk) {
          const div = document.createElement('div');
          div.innerHTML = renderFileItem(node);
          while (div.firstChild) fragment.appendChild(div.firstChild);
        }
        rendered += chunk.length;

        if (rendered < pageNodes.length) {
          // Update progress and yield to UI
          container.innerHTML = '<div style="padding:20px;color:#8b949e;">Loading ' + rendered + '/' + pageNodes.length + '...</div>';
          requestAnimationFrame(renderChunk);
        } else {
          // Done - finalize
          finishRender();
        }
      }

      function finishRender() {
        if (thisRender.abort) return;

        container.innerHTML = '';
        container.appendChild(fragment);

        // Add pagination
        if (totalPages > 1) {
          const paginationDiv = document.createElement('div');
          paginationDiv.style.cssText = 'padding:15px;text-align:center;border-top:1px solid #30363d;';
          paginationDiv.innerHTML = \`
            <span style="color:#8b949e;">Showing \${start + 1}-\${Math.min(start + PAGE_SIZE, filteredNodes.length)} of \${filteredNodes.length}</span>
            <div style="margin-top:10px;">
              \${currentPage > 0 ? '<button class="page-btn" data-dir="-1" style="margin-right:10px;padding:5px 15px;background:#238636;color:white;border:none;border-radius:4px;cursor:pointer;">Previous</button>' : ''}
              \${currentPage < totalPages - 1 ? '<button class="page-btn" data-dir="1" style="padding:5px 15px;background:#238636;color:white;border:none;border-radius:4px;cursor:pointer;">Next</button>' : ''}
            </div>
          \`;
          container.appendChild(paginationDiv);
        }

        // Add click handlers
        container.querySelectorAll('.file-item').forEach(item => {
          item.addEventListener('click', () => item.classList.toggle('expanded'));
        });

        container.querySelectorAll('.page-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            currentPage += parseInt(btn.dataset.dir);
            const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
            const search = document.getElementById('file-search').value;
            renderFileList(activeFilter, search, false);
            container.scrollIntoView({ behavior: 'smooth' });
          });
        });
      }

      requestAnimationFrame(renderChunk);
    }

    function renderFileItem(node) {
      const divType = node.divergence?.type || 'UNKNOWN';
      const retailChanges = node.divergence?.retailChanges || { additions: 0, deletions: 0 };
      const restChanges = node.divergence?.restaurantChanges || { additions: 0, deletions: 0 };

      let changesHtml = '';
      if (divType !== 'CLEAN') {
        changesHtml = \`<span class="changes">
          Retail: <span class="add">+\${retailChanges.additions}</span>/<span class="del">-\${retailChanges.deletions}</span>
          | Restaurant: <span class="add">+\${restChanges.additions}</span>/<span class="del">-\${restChanges.deletions}</span>
        </span>\`;
      }

      const retailDiff = node.diffs?.retail || '';
      const restDiff = node.diffs?.restaurant || '';

      return \`
        <div class="file-item" data-id="\${node.id}">
          <span class="file-path">\${node.relativePath}</span>
          <span class="file-type \${node.type}">\${node.type}</span>
          <span class="divergence-badge \${divType}">\${divType.replace('_', ' ')}</span>
          \${changesHtml}
        </div>
        <div class="file-details">
          <div class="detail-grid">
            <div class="detail-section">
              <h4>Retail vs Base</h4>
              <div class="diff-container">
                <div class="diff">\${formatDiff(retailDiff)}</div>
              </div>
            </div>
            <div class="detail-section">
              <h4>Restaurant vs Base</h4>
              <div class="diff-container">
                <div class="diff">\${formatDiff(restDiff)}</div>
              </div>
            </div>
          </div>
          <div class="detail-section" style="margin-top: 15px;">
            <h4>Dependencies (\${node.dependencies.length})</h4>
            <div class="deps-list">
              \${node.dependencies.map(d => \`<div class="dep-item">\${d}</div>\`).join('')}
            </div>
          </div>
          <div class="detail-section" style="margin-top: 10px;">
            <h4>Dependents (\${node.dependents.length})</h4>
            <div class="deps-list">
              \${node.dependents.map(d => \`<div class="dep-item">\${d}</div>\`).join('')}
            </div>
          </div>
        </div>
      \`;
    }

    function formatDiff(diff) {
      if (!diff) return '<span style="color:#8b949e">No changes</span>';
      return diff.split('\\n').map(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          return \`<div class="diff-line add">\${escapeHtml(line)}</div>\`;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          return \`<div class="diff-line del">\${escapeHtml(line)}</div>\`;
        } else if (line.startsWith('@@')) {
          return \`<div class="diff-line hunk">\${escapeHtml(line)}</div>\`;
        }
        return \`<div class="diff-line">\${escapeHtml(line)}</div>\`;
      }).join('');
    }

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderMovableList() {
      const container = document.getElementById('movable-list');

      if (DATA.movableTrees.length === 0) {
        container.innerHTML = '<div class="tree-item"><span style="color:#8b949e">No clean subtrees found</span></div>';
        return;
      }

      // Build HTML efficiently - limit to first 50 trees
      const trees = DATA.movableTrees.slice(0, 50);
      let html = '';
      for (const tree of trees) {
        html += \`
          <div class="tree-item">
            <div class="tree-header">
              <span class="file-path">\${tree.rootId}</span>
              <span class="divergence-badge CLEAN">\${tree.totalFiles} files</span>
            </div>
            <div class="tree-files">
              \${tree.files.slice(0, 10).join(', ')}\${tree.files.length > 10 ? '...' : ''}
            </div>
          </div>
        \`;
      }
      if (DATA.movableTrees.length > 50) {
        html += '<div class="tree-item"><span style="color:#8b949e">... and ' + (DATA.movableTrees.length - 50) + ' more</span></div>';
      }
      container.innerHTML = html;
    }

    function renderConflictList() {
      const container = document.getElementById('conflict-list');

      const conflicts = DATA.nodes.filter(n => n.divergence?.type === 'CONFLICT');
      conflicts.sort((a, b) => {
        const aTotal = (a.divergence?.retailChanges?.additions || 0) + (a.divergence?.restaurantChanges?.additions || 0);
        const bTotal = (b.divergence?.retailChanges?.additions || 0) + (b.divergence?.restaurantChanges?.additions || 0);
        return bTotal - aTotal;
      });

      // Limit to first 100 conflicts
      const limited = conflicts.slice(0, 100);
      let html = '';
      for (const node of limited) {
        html += renderFileItem(node);
      }
      if (conflicts.length > 100) {
        html += '<div style="padding:15px;color:#8b949e;">... and ' + (conflicts.length - 100) + ' more conflicts. Use the All Files tab to see all.</div>';
      }
      container.innerHTML = html;

      container.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
      });
    }

    let graphRendered = false;

    function renderGraph() {
      const container = document.getElementById('graph-container');

      if (!graphRendered) {
        // Show button to start rendering
        container.innerHTML = \`
          <div style="padding:40px;text-align:center;">
            <p style="color:#8b949e;margin-bottom:20px;">Graph has \${DATA.nodes.length} nodes and \${DATA.edges.length} edges.</p>
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
      setTimeout(() => {
        doRenderGraph();
      }, 50);
    }

    function doRenderGraph() {
      const container = document.getElementById('graph-container');
      const width = container.clientWidth || 1200;
      const height = 600;

      // Color by divergence
      const colors = {
        CLEAN: '#3fb950',
        SAME_CHANGE: '#3fb950',
        RETAIL_ONLY: '#a371f7',
        RESTAURANT_ONLY: '#f0883e',
        CONFLICT: '#f85149'
      };

      // Prioritize conflict nodes, then limit total
      const MAX_NODES = 200;
      const MAX_EDGES = 400;

      // Sort nodes: conflicts first, then by number of connections
      const edgeCount = new Map();
      DATA.edges.forEach(e => {
        edgeCount.set(e.from, (edgeCount.get(e.from) || 0) + 1);
        edgeCount.set(e.to, (edgeCount.get(e.to) || 0) + 1);
      });

      const sortedNodes = [...DATA.nodes].sort((a, b) => {
        // Conflicts first
        if (a.divergence?.type === 'CONFLICT' && b.divergence?.type !== 'CONFLICT') return -1;
        if (b.divergence?.type === 'CONFLICT' && a.divergence?.type !== 'CONFLICT') return 1;
        // Then by edge count
        return (edgeCount.get(b.id) || 0) - (edgeCount.get(a.id) || 0);
      });

      const nodes = sortedNodes.slice(0, MAX_NODES).map(n => ({ ...n, id: n.id }));
      const nodeIds = new Set(nodes.map(n => n.id));

      const links = DATA.edges
        .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
        .slice(0, MAX_EDGES)
        .map(e => ({ source: e.from, target: e.to, type: e.type }));

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
        .attr('fill', d => colors[d.divergence?.type] || '#8b949e')
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
      node.append('title').text(d => d.relativePath + ' (' + (d.divergence?.type || 'unknown') + ')');

      // Add labels (only for smaller graphs)
      if (nodes.length < 100) {
        const labels = g.append('g')
          .selectAll('text')
          .data(nodes)
          .enter().append('text')
          .text(d => d.relativePath.split('/').pop().substring(0, 12))
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

    // Initial render - staggered to keep UI responsive
    try {
      console.log('Rendering file list...');
      renderFileList();
      // Delay other renders to let file list start first
      setTimeout(() => {
        console.log('Rendering movable list...');
        renderMovableList();
      }, 100);
      setTimeout(() => {
        console.log('Rendering conflict list...');
        renderConflictList();
        console.log('Initial render complete');
      }, 200);
    } catch (e) {
      console.error('Render error:', e);
      document.getElementById('file-list').innerHTML = '<div style="padding:20px;color:red;">Render error: ' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
  }
}
