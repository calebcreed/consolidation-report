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

  generate(
    result: AnalysisResult,
    diffResults: Map<string, ThreeWayDiffResult>,
    outputPath: string
  ): void {
    const movableTrees = this.analyzer.getMovableTrees(result);
    const priorities = this.analyzer.getConsolidationPriority(result);

    // Prepare node data with diffs
    const nodesWithDiffs: ReportData['nodes'] = [];

    for (const node of result.nodes.values()) {
      const diffResult = diffResults.get(node.retailPath || node.restaurantPath || '');
      let diffs: { retail: string; restaurant: string } | undefined;

      if (diffResult) {
        const filename = node.relativePath;
        const { retailDiff, restaurantDiff } = this.differ.generateUnifiedDiff(
          diffResult.baseContent,
          diffResult.retailContent,
          diffResult.restaurantContent,
          filename
        );
        diffs = { retail: retailDiff, restaurant: restaurantDiff };
      }

      nodesWithDiffs.push({ ...node, diffs });
    }

    const reportData: ReportData = {
      generatedAt: new Date().toISOString(),
      stats: result.stats,
      nodes: nodesWithDiffs,
      edges: result.edges,
      movableTrees,
      priorities,
    };

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

  <script>
    const DATA = ${JSON.stringify(data, null, 2)};

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

    function renderFileList(filter = 'all', search = '') {
      const container = document.getElementById('file-list');
      container.innerHTML = '';

      let nodes = DATA.nodes;
      if (filter !== 'all') {
        nodes = nodes.filter(n => n.divergence?.type === filter);
      }
      if (search) {
        const lower = search.toLowerCase();
        nodes = nodes.filter(n => n.relativePath.toLowerCase().includes(lower));
      }

      nodes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      for (const node of nodes) {
        container.innerHTML += renderFileItem(node);
      }

      // Add click handlers
      container.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
          item.classList.toggle('expanded');
        });
      });
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
      container.innerHTML = '';

      for (const tree of DATA.movableTrees) {
        const node = DATA.nodes.find(n => n.id === tree.rootId);
        container.innerHTML += \`
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

      if (DATA.movableTrees.length === 0) {
        container.innerHTML = '<div class="tree-item"><span style="color:#8b949e">No clean subtrees found</span></div>';
      }
    }

    function renderConflictList() {
      const container = document.getElementById('conflict-list');
      container.innerHTML = '';

      const conflicts = DATA.nodes.filter(n => n.divergence?.type === 'CONFLICT');
      conflicts.sort((a, b) => {
        const aTotal = (a.divergence?.retailChanges?.additions || 0) + (a.divergence?.restaurantChanges?.additions || 0);
        const bTotal = (b.divergence?.retailChanges?.additions || 0) + (b.divergence?.restaurantChanges?.additions || 0);
        return bTotal - aTotal;
      });

      for (const node of conflicts) {
        container.innerHTML += renderFileItem(node);
      }

      container.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
      });
    }

    function renderGraph() {
      const container = document.getElementById('graph-container');
      container.innerHTML = '<div style="padding:20px;color:#8b949e;">Graph visualization requires D3.js. For a large codebase, consider using the JSON export with an external graph tool.</div>';

      // Simple SVG graph for smaller datasets
      if (DATA.nodes.length < 200) {
        renderSimpleGraph(container);
      }
    }

    function renderSimpleGraph(container) {
      const width = container.clientWidth;
      const height = 600;

      const nodeMap = new Map(DATA.nodes.map(n => [n.id, n]));
      const links = DATA.edges.map(e => ({ source: e.from, target: e.to, type: e.type }));

      // Filter to nodes that have edges
      const connectedIds = new Set();
      links.forEach(l => { connectedIds.add(l.source); connectedIds.add(l.target); });
      const nodes = DATA.nodes.filter(n => connectedIds.has(n.id)).slice(0, 100);

      // Color by divergence
      const colors = {
        CLEAN: '#3fb950',
        SAME_CHANGE: '#3fb950',
        RETAIL_ONLY: '#a371f7',
        RESTAURANT_ONLY: '#f0883e',
        CONFLICT: '#f85149'
      };

      let svg = \`<svg width="\${width}" height="\${height}" style="background:#161b22">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#30363d"/>
          </marker>
        </defs>\`;

      // Simple force-directed layout simulation
      const nodePositions = new Map();
      nodes.forEach((n, i) => {
        const angle = (i / nodes.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.35;
        nodePositions.set(n.id, {
          x: width/2 + Math.cos(angle) * radius,
          y: height/2 + Math.sin(angle) * radius
        });
      });

      // Draw edges
      const validLinks = links.filter(l => nodePositions.has(l.source) && nodePositions.has(l.target));
      validLinks.forEach(link => {
        const source = nodePositions.get(link.source);
        const target = nodePositions.get(link.target);
        if (source && target) {
          svg += \`<line x1="\${source.x}" y1="\${source.y}" x2="\${target.x}" y2="\${target.y}" stroke="#30363d" stroke-width="1" marker-end="url(#arrow)"/>\`;
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        const pos = nodePositions.get(node.id);
        if (pos) {
          const color = colors[node.divergence?.type] || '#8b949e';
          const label = node.relativePath.split('/').pop().substring(0, 15);
          svg += \`<circle cx="\${pos.x}" cy="\${pos.y}" r="8" fill="\${color}" style="cursor:pointer">
            <title>\${node.relativePath}</title>
          </circle>\`;
          svg += \`<text x="\${pos.x}" y="\${pos.y + 20}" text-anchor="middle" fill="#8b949e" font-size="9">\${label}</text>\`;
        }
      });

      svg += '</svg>';
      container.innerHTML = svg;
    }

    // Initial render
    renderFileList();
    renderMovableList();
    renderConflictList();
  </script>
</body>
</html>`;
  }
}
