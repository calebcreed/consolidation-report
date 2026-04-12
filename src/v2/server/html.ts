/**
 * Interactive HTML Report Generator
 *
 * Generates the HTML dashboard with live controls for migration/build/rollback
 */

import { AnalysisReport } from '../report/types';
import { ServerConfig } from './state';

export function generateInteractiveHtml(report: AnalysisReport | null, config: ServerConfig | null): string {
  const reportJson = report ? JSON.stringify(report) : 'null';
  const configJson = config ? JSON.stringify(config) : 'null';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebPOS Consolidator</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 5px; font-size: 24px; }
    h2 { color: #c9d1d9; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    .subtitle { color: #8b949e; font-size: 13px; margin-bottom: 20px; }

    /* Header bar */
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #30363d; }
    .header-left { display: flex; align-items: center; gap: 15px; }
    .header-right { display: flex; align-items: center; gap: 10px; }

    .status-badge { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .status-badge.ready { background: #23863633; color: #3fb950; }
    .status-badge.building { background: #388bfd33; color: #58a6ff; }
    .status-badge.error { background: #f8514933; color: #f85149; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; }
    .status-badge.ready .status-dot { background: #3fb950; }
    .status-badge.building .status-dot { background: #58a6ff; animation: pulse 1s infinite; }
    .status-badge.error .status-dot { background: #f85149; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /* Buttons */
    .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; }
    .btn:hover { background: #30363d; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #238636; border-color: #238636; color: white; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; border-color: #da3633; color: white; }
    .btn-danger:hover { background: #f85149; }
    .btn-small { padding: 4px 10px; font-size: 12px; }

    /* Config panel */
    .config-panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .config-panel.collapsed .config-content { display: none; }
    .config-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
    .config-header h3 { font-size: 14px; color: #c9d1d9; }
    .config-content { margin-top: 16px; }
    .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .config-field { display: flex; flex-direction: column; gap: 4px; }
    .config-field label { font-size: 12px; color: #8b949e; }
    .config-field input { padding: 8px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; font-size: 13px; }
    .config-field input:focus { outline: none; border-color: #58a6ff; }
    .config-actions { margin-top: 16px; display: flex; gap: 10px; }

    /* Main layout */
    .main-grid { display: grid; grid-template-columns: 1fr 400px; gap: 20px; }
    @media (max-width: 1200px) { .main-grid { grid-template-columns: 1fr; } }

    /* Lists */
    .list-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; max-height: 400px; overflow-y: auto; }
    .list-item { padding: 12px 16px; border-bottom: 1px solid #21262d; display: flex; align-items: center; gap: 12px; }
    .list-item:last-child { border-bottom: none; }
    .list-item:hover { background: #1c2128; }
    .list-item-content { flex: 1; min-width: 0; }
    .list-item-path { font-family: monospace; font-size: 13px; color: #c9d1d9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .list-item-meta { font-size: 11px; color: #8b949e; margin-top: 2px; }

    .badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
    .badge-green { background: #23863633; color: #3fb950; }
    .badge-blue { background: #388bfd33; color: #58a6ff; }
    .badge-purple { background: #a371f733; color: #a371f7; }

    /* Timeline */
    .timeline-section { margin-bottom: 8px; }
    .timeline-section-header { font-size: 11px; text-transform: uppercase; color: #8b949e; padding: 8px 12px; font-weight: 600; letter-spacing: 0.5px; }
    .redo-section { opacity: 0.7; }
    .redo-section .timeline-item { background: #1a1f29; }
    .timeline-current-marker { text-align: center; padding: 12px; color: #58a6ff; font-weight: 600; font-size: 13px; border-top: 1px dashed #30363d; border-bottom: 1px dashed #30363d; margin: 4px 0; }
    .timeline-item { position: relative; padding-left: 40px; margin: 2px 0; }
    .timeline-marker { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; background: #30363d; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #8b949e; }
    .timeline-item::before { content: ''; position: absolute; left: 19px; top: -2px; width: 2px; height: calc(100% + 4px); background: #30363d; z-index: -1; }
    .timeline-section .timeline-item:first-child::before { top: 50%; height: calc(50% + 2px); }
    .timeline-section .timeline-item:last-child::before { height: calc(50% + 2px); }
    .timeline-section .timeline-item:only-child::before { display: none; }
    .timeline-latest .timeline-marker { background: #238636; color: #fff; }
    .timeline-redo .timeline-marker { background: #1f6feb; color: #fff; }
    .redo-marker { font-size: 14px; }
    .commit-hash { font-family: monospace; background: #30363d; padding: 1px 5px; border-radius: 4px; font-size: 11px; }

    /* Output panel */
    .output-panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; display: flex; flex-direction: column; height: 500px; }
    .output-header { padding: 12px 16px; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; }
    .output-header h3 { font-size: 14px; color: #c9d1d9; }
    .output-content { flex: 1; overflow-y: auto; padding: 12px; font-family: monospace; font-size: 12px; line-height: 1.6; }
    .output-line { white-space: pre-wrap; word-break: break-all; }
    .output-line.error { color: #f85149; }
    .output-line.success { color: #3fb950; }
    .output-line.info { color: #58a6ff; }
    .output-actions { padding: 12px 16px; border-top: 1px solid #30363d; display: flex; gap: 10px; }

    /* Empty state */
    .empty-state { padding: 40px; text-align: center; color: #8b949e; }
    .empty-state-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }

    /* Tabs */
    .tabs { display: flex; gap: 5px; margin-bottom: 16px; border-bottom: 1px solid #30363d; }
    .tab { padding: 10px 16px; cursor: pointer; border: none; background: none; color: #8b949e; font-size: 13px; border-bottom: 2px solid transparent; }
    .tab:hover { color: #c9d1d9; }
    .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Stats */
    .stats-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; min-width: 100px; }
    .stat-value { font-size: 24px; font-weight: 600; color: #58a6ff; }
    .stat-value.green { color: #3fb950; }
    .stat-value.red { color: #f85149; }
    .stat-value.yellow { color: #d29922; }
    .stat-label { font-size: 11px; color: #8b949e; margin-top: 2px; }

    /* Filter buttons */
    .filter-btn { transition: all 0.15s; }
    .filter-btn.active { background: #388bfd33; border-color: #58a6ff; color: #58a6ff; }

    /* Diff display - git style */
    .diff-container { background: #0d1117; border-radius: 6px; margin: 8px 16px 16px; overflow: hidden; border: 1px solid #30363d; }
    .diff-header { padding: 8px 12px; background: #161b22; border-bottom: 1px solid #30363d; font-size: 12px; color: #8b949e; }
    .diff-content { max-height: 400px; overflow-y: auto; overflow-x: auto; }
    .diff-line { padding: 0 12px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 12px; white-space: pre; line-height: 1.5; min-height: 20px; }
    .diff-line.added { background: #1a4721; color: #3fb950; }
    .diff-line.removed { background: #5d1f1f; color: #f85149; }
    .diff-line.context { color: #8b949e; background: #0d1117; }
    .diff-line.hunk { background: #1f2937; color: #58a6ff; font-weight: 500; }
    .diff-line.header { background: #161b22; color: #c9d1d9; font-weight: 600; }

    /* D3 Graph */
    #graph-svg-container { width: 100%; height: 500px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; display: none; }
    #graph-svg { width: 100%; height: 100%; }
    .graph-node-circle { cursor: pointer; stroke-width: 2px; }
    .graph-node-circle.clean { fill: #238636; stroke: #3fb950; }
    .graph-node-circle.conflict { fill: #da3633; stroke: #f85149; }
    .graph-node-circle.restaurant-only { fill: #8957e5; stroke: #a371f7; }
    .graph-node-circle.retail-only { fill: #1f6feb; stroke: #58a6ff; }
    .graph-node-circle.external { fill: #484f58; stroke: #6e7681; }
    .graph-link { stroke: #30363d; stroke-opacity: 0.6; }
    .graph-label { font-size: 10px; fill: #c9d1d9; pointer-events: none; }
    .graph-legend { position: absolute; top: 10px; right: 10px; background: #161b22; padding: 10px; border-radius: 6px; border: 1px solid #30363d; font-size: 11px; }
    .graph-legend-item { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .graph-legend-dot { width: 10px; height: 10px; border-radius: 50%; }

    /* File status badges */
    .badge-clean { background: #23863633; color: #3fb950; }
    .badge-conflict { background: #f8514933; color: #f85149; }
    .badge-restaurant { background: #a371f733; color: #a371f7; }
    .badge-retail { background: #388bfd33; color: #58a6ff; }

    /* Graph tree */
    .graph-node { padding: 4px 12px; border-bottom: 1px solid #21262d; }
    .graph-node:hover { background: #1c2128; }
    .graph-node .path { color: #c9d1d9; }
    .graph-node .status { font-size: 11px; margin-left: 8px; }
    .graph-node.clean .status { color: #3fb950; }
    .graph-node.dirty .status { color: #f85149; }
    .graph-indent { display: inline-block; width: 20px; color: #30363d; }

    /* Expanded file item */
    .file-expanded { background: #1c2128; }
    .file-expanded .list-item { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <h1>WebPOS Consolidator</h1>
        <div class="status-badge ready" id="status-badge">
          <span class="status-dot"></span>
          <span id="status-text">Ready</span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn" id="btn-analyze" onclick="runAnalysis()">Analyze</button>
        <button class="btn btn-primary" id="btn-build" onclick="runBuild()">Build</button>
        <button class="btn btn-danger" id="btn-rollback" onclick="runRollback()">Rollback</button>
      </div>
    </div>

    <!-- Config Panel -->
    <div class="config-panel" id="config-panel">
      <div class="config-header" onclick="toggleConfig()">
        <h3>Configuration</h3>
        <span id="config-toggle">▼</span>
      </div>
      <div class="config-content">
        <div class="config-grid">
          <div class="config-field">
            <label>Project Path</label>
            <input type="text" id="config-project" placeholder="/path/to/webpos">
          </div>
          <div class="config-field">
            <label>Build Command</label>
            <input type="text" id="config-build" placeholder="nx build restaurant">
          </div>
          <div class="config-field">
            <label>Shared Path</label>
            <input type="text" id="config-shared" placeholder="libs/shared">
          </div>
          <div class="config-field">
            <label>tsconfig Path</label>
            <input type="text" id="config-tsconfig" placeholder="apps/restaurant/tsconfig.app.json">
          </div>
        </div>
        <div class="config-actions">
          <button class="btn btn-primary" onclick="saveConfig()">Save Configuration</button>
        </div>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="stats-row" id="stats-row" style="display: none;">
      <div class="stat">
        <div class="stat-value" id="stat-total">0</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat">
        <div class="stat-value green" id="stat-clean">0</div>
        <div class="stat-label">Clean</div>
      </div>
      <div class="stat">
        <div class="stat-value red" id="stat-conflicts">0</div>
        <div class="stat-label">Conflicts</div>
      </div>
      <div class="stat">
        <div class="stat-value green" id="stat-subtrees">0</div>
        <div class="stat-label">Clean Subtrees</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-bottlenecks">0</div>
        <div class="stat-label">Bottlenecks</div>
      </div>
    </div>

    <!-- Main Grid -->
    <div class="main-grid">
      <!-- Left: Subtrees and Bottlenecks -->
      <div class="left-panel">
        <div class="tabs">
          <button class="tab" data-tab="discovery">Discovery</button>
          <button class="tab active" data-tab="subtrees">Clean Subtrees</button>
          <button class="tab" data-tab="conflicts">Conflicts</button>
          <button class="tab" data-tab="all-files">All Files</button>
          <button class="tab" data-tab="graph">Graph</button>
          <button class="tab" data-tab="bottlenecks">Bottlenecks</button>
          <button class="tab" data-tab="timeline">Timeline</button>
        </div>

        <div id="discovery" class="tab-content">
          <p class="subtitle">Discover file types and patterns in the project.</p>
          <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center;">
            <input type="text" id="discovery-path" placeholder="Directory path (e.g., apps/restaurant/src)" style="flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; font-size: 13px;">
            <button class="btn btn-primary" onclick="discoverFileTypes()">Scan File Types</button>
          </div>
          <div class="list-container" id="discovery-results" style="max-height: 500px;">
            <div class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <div>Enter a directory path and click "Scan File Types" to discover all file extensions in the project.</div>
            </div>
          </div>
        </div>

        <div id="subtrees" class="tab-content active">
          <p class="subtitle">Click "Migrate" to move a subtree to shared. Ranked by size.</p>
          <div class="list-container" id="subtrees-list">
            <div class="empty-state">
              <div class="empty-state-icon">📊</div>
              <div>No analysis yet. Click "Analyze" to scan your project.</div>
            </div>
          </div>
        </div>

        <div id="conflicts" class="tab-content">
          <p class="subtitle">Files with differences that need manual resolution.</p>
          <div class="list-container" id="conflicts-list" style="max-height: 600px;">
            <div class="empty-state">
              <div class="empty-state-icon">⚠️</div>
              <div>No analysis yet. Click "Analyze" to scan your project.</div>
            </div>
          </div>
        </div>

        <div id="all-files" class="tab-content">
          <p class="subtitle">All matched files with their status.</p>
          <div class="filter-bar" style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-small filter-btn active" data-filter="all">All</button>
            <button class="btn btn-small filter-btn" data-filter="clean">Clean</button>
            <button class="btn btn-small filter-btn" data-filter="conflict">Conflicts</button>
            <button class="btn btn-small filter-btn" data-filter="restaurant-only">Restaurant Only</button>
            <button class="btn btn-small filter-btn" data-filter="retail-only">Retail Only</button>
            <input type="text" id="file-search" placeholder="Search files..." style="flex: 1; min-width: 200px; padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; background: #0d1117; color: #c9d1d9; font-size: 13px;">
          </div>
          <div class="list-container" id="all-files-list" style="max-height: 500px;">
            <div class="empty-state">
              <div class="empty-state-icon">📁</div>
              <div>No analysis yet. Click "Analyze" to scan your project.</div>
            </div>
          </div>
        </div>

        <div id="graph" class="tab-content">
          <p class="subtitle">Full dependency graph. Nodes colored by status.</p>
          <div class="graph-controls" style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-primary" id="btn-show-graph" onclick="renderD3Graph()">Show Dependency Graph</button>
            <span style="color: #8b949e; font-size: 12px;" id="graph-stats"></span>
          </div>
          <div id="graph-svg-container" style="position: relative;">
            <svg id="graph-svg"></svg>
            <div class="graph-legend">
              <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #238636;"></div> Clean</div>
              <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #da3633;"></div> Conflict</div>
              <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #8957e5;"></div> Restaurant Only</div>
              <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #1f6feb;"></div> Retail Only</div>
              <div class="graph-legend-item"><div class="graph-legend-dot" style="background: #484f58;"></div> External</div>
            </div>
          </div>
        </div>

        <div id="bottlenecks" class="tab-content">
          <p class="subtitle">Resolving these would unlock the most files. Ranked by impact score.</p>
          <div class="list-container" id="bottlenecks-list">
            <div class="empty-state">
              <div class="empty-state-icon">🔓</div>
              <div>No analysis yet. Click "Analyze" to scan your project.</div>
            </div>
          </div>
        </div>

        <div id="timeline" class="tab-content">
          <p class="subtitle">Migration history. Click a commit to rollback to that point.</p>
          <div class="list-container" id="timeline-list">
            <div class="empty-state">
              <div class="empty-state-icon">📜</div>
              <div>No migrations yet. Migrate a subtree to see the timeline.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Output Panel -->
      <div class="output-panel">
        <div class="output-header">
          <h3>Output</h3>
          <button class="btn btn-small" onclick="clearOutput()">Clear</button>
        </div>
        <div class="output-content" id="output-content">
          <div class="output-line info">Ready. Configure your project path and click Analyze.</div>
        </div>
        <div class="output-actions">
          <button class="btn" onclick="copyErrors()">Copy Errors</button>
          <button class="btn btn-danger" id="btn-stop" onclick="stopBuild()" style="display: none;">Stop Build</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Initial data from server
    let REPORT = ${reportJson};
    let CONFIG = ${configJson};
    let MIGRATIONS = [];
    let REDO_STACK = [];
    let CURRENT_COMMIT = null;
    let ws = null;

    // Connect WebSocket
    function connectWS() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host);

      ws.onopen = () => {
        appendOutput('Connected to server', 'info');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      };

      ws.onclose = () => {
        appendOutput('Disconnected. Reconnecting...', 'error');
        setTimeout(connectWS, 2000);
      };
    }

    function handleMessage(msg) {
      switch (msg.type) {
        case 'output':
          const isError = msg.data.toLowerCase().includes('error') || msg.data.includes('✖');
          const isSuccess = msg.data.includes('succeeded') || msg.data.includes('complete');
          appendOutput(msg.data, isError ? 'error' : isSuccess ? 'success' : '');
          break;
        case 'report':
        case 'report-updated':
          REPORT = msg.data;
          renderReport();
          break;
        case 'build-start':
          setStatus('building', 'Building...');
          document.getElementById('btn-stop').style.display = 'block';
          break;
        case 'build-complete':
          setStatus(msg.data.success ? 'ready' : 'error', msg.data.success ? 'Build Succeeded' : 'Build Failed');
          document.getElementById('btn-stop').style.display = 'none';
          break;
        case 'rollback':
          setStatus('ready', 'Rolled Back');
          appendOutput('Rollback complete', 'success');
          break;
        case 'timeline-updated':
          // Full timeline update (after undo/redo)
          if (msg.data) {
            MIGRATIONS = msg.data.migrations || [];
            REDO_STACK = msg.data.redoStack || [];
            CURRENT_COMMIT = msg.data.currentCommit;
            renderTimeline();
          }
          break;
        case 'migration':
          // Add new migration to timeline, clear redo stack
          if (msg.data) {
            MIGRATIONS.push(msg.data);
            REDO_STACK = []; // New migration clears redo
            renderTimeline();
          }
          break;
        case 'init':
          if (msg.data.config) {
            CONFIG = msg.data.config;
            loadConfigToForm();
          }
          if (msg.data.report) {
            REPORT = msg.data.report;
            renderReport();
          }
          break;
      }
    }

    function setStatus(type, text) {
      const badge = document.getElementById('status-badge');
      badge.className = 'status-badge ' + type;
      document.getElementById('status-text').textContent = text;
    }

    function appendOutput(text, type = '') {
      const content = document.getElementById('output-content');
      const line = document.createElement('div');
      line.className = 'output-line' + (type ? ' ' + type : '');
      line.textContent = text;
      content.appendChild(line);
      content.scrollTop = content.scrollHeight;
    }

    function clearOutput() {
      document.getElementById('output-content').innerHTML = '';
    }

    // Config
    function toggleConfig() {
      const panel = document.getElementById('config-panel');
      panel.classList.toggle('collapsed');
      document.getElementById('config-toggle').textContent = panel.classList.contains('collapsed') ? '▶' : '▼';
    }

    function loadConfigToForm() {
      if (!CONFIG) return;
      document.getElementById('config-project').value = CONFIG.projectPath || '';
      document.getElementById('config-build').value = CONFIG.buildCommand || 'nx build restaurant';
      document.getElementById('config-shared').value = CONFIG.sharedPath || 'libs/shared';
      document.getElementById('config-tsconfig').value = CONFIG.tsconfigPath?.replace(CONFIG.projectPath + '/', '') || 'apps/restaurant/tsconfig.app.json';

      // Collapse config if already set
      if (CONFIG.projectPath) {
        document.getElementById('config-panel').classList.add('collapsed');
        document.getElementById('config-toggle').textContent = '▶';
      }
    }

    async function saveConfig() {
      const projectPath = document.getElementById('config-project').value;
      const buildCommand = document.getElementById('config-build').value;
      const sharedPath = document.getElementById('config-shared').value;
      const tsconfigRel = document.getElementById('config-tsconfig').value;

      CONFIG = {
        projectPath,
        buildCommand,
        sharedPath,
        tsconfigPath: projectPath + '/' + tsconfigRel,
        retailBranch: 'retail',
        restaurantBranch: 'restaurant',
      };

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(CONFIG),
      });

      if (res.ok) {
        appendOutput('Configuration saved', 'success');
        toggleConfig();
      } else {
        const err = await res.json();
        appendOutput('Failed to save config: ' + err.error, 'error');
      }
    }

    // Discovery
    async function discoverFileTypes() {
      const pathInput = document.getElementById('discovery-path');
      const resultsDiv = document.getElementById('discovery-results');
      const subPath = pathInput.value.trim();

      resultsDiv.innerHTML = '<div class="empty-state">Scanning...</div>';

      try {
        const res = await fetch('/api/discover/filetypes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subPath }),
        });

        const data = await res.json();

        if (!res.ok) {
          resultsDiv.innerHTML = '<div class="empty-state" style="color: #f85149;">Error: ' + (data.error || 'Unknown error') + '</div>';
          return;
        }

        if (data.extensions.length === 0) {
          resultsDiv.innerHTML = '<div class="empty-state">No files found in this directory.</div>';
          return;
        }

        // Group by category
        const categories = {
          'Code': ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte'],
          'Styles': ['.css', '.scss', '.sass', '.less', '.styl'],
          'Markup': ['.html', '.htm', '.xml', '.svg'],
          'Data': ['.json', '.yaml', '.yml', '.toml'],
          'Config': ['.config', '.rc', '.env', '.gitignore', '.npmrc'],
          'Docs': ['.md', '.txt', '.rst'],
          'Assets': ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'],
        };

        let html = '<div style="padding: 16px;">';
        html += '<div style="margin-bottom: 16px; color: #8b949e;">Scanned: <code>' + data.scannedPath + '</code></div>';
        html += '<div style="margin-bottom: 16px;">Found <strong>' + data.totalFiles + '</strong> files with <strong>' + data.extensions.length + '</strong> unique extensions</div>';

        // Sort by count descending
        const sorted = data.extensions.sort((a, b) => b.count - a.count);

        html += '<table style="width: 100%; border-collapse: collapse;">';
        html += '<tr style="border-bottom: 1px solid #30363d;"><th style="text-align: left; padding: 8px;">Extension</th><th style="text-align: right; padding: 8px;">Count</th><th style="text-align: left; padding: 8px;">Sample Files</th></tr>';

        sorted.forEach(ext => {
          const samples = ext.samples.slice(0, 3).map(s => s.split('/').pop()).join(', ');
          html += '<tr style="border-bottom: 1px solid #21262d;">';
          html += '<td style="padding: 8px; font-family: monospace;">' + ext.extension + '</td>';
          html += '<td style="padding: 8px; text-align: right;">' + ext.count + '</td>';
          html += '<td style="padding: 8px; color: #8b949e; font-size: 12px;">' + samples + (ext.samples.length > 3 ? '...' : '') + '</td>';
          html += '</tr>';
        });

        html += '</table></div>';
        resultsDiv.innerHTML = html;

      } catch (e) {
        resultsDiv.innerHTML = '<div class="empty-state" style="color: #f85149;">Error: ' + e.message + '</div>';
      }
    }

    // Actions
    async function runAnalysis() {
      setStatus('building', 'Analyzing...');
      document.getElementById('btn-analyze').disabled = true;

      try {
        const res = await fetch('/api/analyze', { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
          REPORT = data;
          renderReport();
          setStatus('ready', 'Analysis Complete');
        } else {
          setStatus('error', 'Analysis Failed');
          appendOutput('Error: ' + data.error, 'error');
        }
      } catch (e) {
        setStatus('error', 'Analysis Failed');
        appendOutput('Error: ' + e.message, 'error');
      }

      document.getElementById('btn-analyze').disabled = false;
    }

    async function runBuild() {
      try {
        await fetch('/api/build', { method: 'POST' });
      } catch (e) {
        appendOutput('Error: ' + e.message, 'error');
      }
    }

    function stopBuild() {
      fetch('/api/build/stop', { method: 'POST' });
    }

    async function runRollback() {
      // Rollback the last migration
      const activeMigrations = MIGRATIONS.filter(m => m.status !== 'rolled-back');
      if (activeMigrations.length === 0) {
        appendOutput('No migrations to rollback', 'error');
        return;
      }
      const lastMigration = activeMigrations[activeMigrations.length - 1];
      await rollbackTo(lastMigration.id);
    }

    async function migrateSubtree(index) {
      const subtree = REPORT.cleanSubtrees[index];
      if (!confirm('Migrate "' + subtree.rootPath + '" (' + subtree.totalFiles + ' files) to shared?')) return;

      setStatus('building', 'Migrating...');

      try {
        const res = await fetch('/api/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtreeIndex: index }),
        });

        if (res.ok) {
          appendOutput('Migration complete. Running build...', 'success');
          runBuild();
        } else {
          const err = await res.json();
          setStatus('error', 'Migration Failed');
          appendOutput('Migration failed: ' + err.error, 'error');
        }
      } catch (e) {
        setStatus('error', 'Migration Failed');
        appendOutput('Error: ' + e.message, 'error');
      }
    }

    async function copyErrors() {
      try {
        const res = await fetch('/api/errors');
        const data = await res.json();
        await navigator.clipboard.writeText(data.errors);
        appendOutput('Errors copied to clipboard!', 'success');
      } catch (e) {
        appendOutput('Failed to copy: ' + e.message, 'error');
      }
    }

    // Global state for filtering
    let currentFilter = 'all';
    let searchQuery = '';

    // Render
    function renderReport() {
      if (!REPORT) return;

      // Count statuses
      const statusCounts = { clean: 0, conflict: 0, 'restaurant-only': 0, 'retail-only': 0 };
      REPORT.files.forEach(f => { statusCounts[f.status] = (statusCounts[f.status] || 0) + 1; });

      // Show stats
      document.getElementById('stats-row').style.display = 'flex';
      document.getElementById('stat-total').textContent = REPORT.stats.totalFiles;
      document.getElementById('stat-clean').textContent = statusCounts.clean || 0;
      document.getElementById('stat-conflicts').textContent = statusCounts.conflict || 0;
      document.getElementById('stat-subtrees').textContent = REPORT.cleanSubtrees.length;
      document.getElementById('stat-bottlenecks').textContent = REPORT.bottlenecks.filter(b => b.impactScore > 0).length + '/' + REPORT.bottlenecks.length;

      // Render subtrees
      renderSubtrees();

      // Render conflicts
      renderConflicts();

      // Render all files
      renderAllFiles();

      // Render bottlenecks
      renderBottlenecks();
    }

    function renderSubtrees() {
      const subtreesList = document.getElementById('subtrees-list');
      if (REPORT.cleanSubtrees.length === 0) {
        subtreesList.innerHTML = '<div class="empty-state">No clean subtrees found</div>';
      } else {
        subtreesList.innerHTML = REPORT.cleanSubtrees.map((tree, i) => \`
          <div class="list-item">
            <span class="badge badge-green">\${tree.totalFiles} files</span>
            <div class="list-item-content">
              <div class="list-item-path">\${tree.rootPath}</div>
              <div class="list-item-meta">\${tree.files.slice(0, 3).join(', ')}\${tree.files.length > 3 ? '...' : ''}</div>
            </div>
            <button class="btn btn-primary btn-small" onclick="migrateSubtree(\${i})">Migrate</button>
          </div>
        \`).join('');
      }
    }

    function renderConflicts() {
      const conflictsList = document.getElementById('conflicts-list');
      const conflicts = REPORT.files.filter(f => f.status === 'conflict');

      if (conflicts.length === 0) {
        conflictsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><div>No conflicts! All matching files are clean.</div></div>';
        return;
      }

      conflictsList.innerHTML = conflicts.map((file, i) => {
        // Use unified diff if available
        const unifiedDiff = file.unifiedDiff || '';
        let diffHtml = '';

        if (unifiedDiff) {
          const lines = unifiedDiff.split('\\n');
          // Skip the header lines (---, +++, @@) and show them styled
          const diffLines = lines.map(line => {
            let lineClass = 'context';
            if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'added';
            else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'removed';
            else if (line.startsWith('@@')) lineClass = 'hunk';
            else if (line.startsWith('---') || line.startsWith('+++')) lineClass = 'header';
            return \`<div class="diff-line \${lineClass}">\${escapeHtml(line)}</div>\`;
          }).join('');

          diffHtml = \`
            <div class="diff-container">
              <div class="diff-header">
                <span>retail vs restaurant</span>
              </div>
              <div class="diff-content">\${diffLines}</div>
            </div>
          \`;
        }

        return \`
          <div class="file-expanded">
            <div class="list-item">
              <span class="badge badge-conflict">conflict</span>
              <div class="list-item-content">
                <div class="list-item-path">\${file.relativePath}</div>
                <div class="list-item-meta">\${(file.dependencies || []).length} dependencies · \${(file.dependents || []).length} dependents</div>
              </div>
              <button class="btn btn-small" onclick="toggleDiff(\${i})">Diff</button>
            </div>
            <div id="diff-\${i}" style="display: none;">\${diffHtml}</div>
          </div>
        \`;
      }).join('');
    }

    function renderAllFiles() {
      const filesList = document.getElementById('all-files-list');
      let files = REPORT.files;

      // Apply filter
      if (currentFilter !== 'all') {
        files = files.filter(f => f.status === currentFilter);
      }

      // Apply search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        files = files.filter(f => f.relativePath.toLowerCase().includes(q));
      }

      if (files.length === 0) {
        filesList.innerHTML = '<div class="empty-state">No files match the current filter.</div>';
        return;
      }

      filesList.innerHTML = files.map(file => {
        const badgeClass = file.status === 'clean' ? 'badge-clean' :
                          file.status === 'conflict' ? 'badge-conflict' :
                          file.status === 'restaurant-only' ? 'badge-restaurant' : 'badge-retail';
        return \`
          <div class="list-item">
            <span class="badge \${badgeClass}">\${file.status}</span>
            <div class="list-item-content">
              <div class="list-item-path">\${file.relativePath}</div>
              <div class="list-item-meta">\${file.dependencyCount || 0} deps · \${file.dependentCount || 0} dependents</div>
            </div>
            <button class="btn btn-small" onclick="showInGraph('\${file.relativePath}')">Graph</button>
          </div>
        \`;
      }).join('');
    }

    function renderBottlenecks() {
      const bottlenecksList = document.getElementById('bottlenecks-list');

      if (!REPORT.bottlenecks || REPORT.bottlenecks.length === 0) {
        bottlenecksList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔓</div><div>No dirty files found.</div></div>';
        return;
      }

      // Show all bottlenecks, sorted by impact score (already sorted by server)
      bottlenecksList.innerHTML = REPORT.bottlenecks.map((b, i) => {
        const badgeClass = b.unlockCount > 0 ? 'badge-green' : 'badge-purple';
        const impactBadge = b.impactScore > 0
          ? \`<span class="badge badge-blue">Score: \${b.impactScore.toFixed(2)}</span>\`
          : '';
        return \`
          <div class="list-item">
            <span class="badge \${badgeClass}">Unlocks \${b.unlockCount}</span>
            \${impactBadge}
            <span class="badge">\${b.linesChanged || '?'} lines</span>
            <div class="list-item-content">
              <div class="list-item-path">\${b.relativePath}</div>
              <div class="list-item-meta">\${b.status}\${b.unlockedPaths && b.unlockedPaths.length > 0 ? ' · Would unlock: ' + b.unlockedPaths.slice(0, 3).join(', ') : ''}</div>
            </div>
          </div>
        \`;
      }).join('');
    }

    // D3.js Force-Directed Graph
    let graphSimulation = null;

    function renderD3Graph() {
      if (!REPORT || !REPORT.files) return;

      const container = document.getElementById('graph-svg-container');
      const svg = d3.select('#graph-svg');

      // Toggle visibility
      if (container.style.display === 'block') {
        container.style.display = 'none';
        document.getElementById('btn-show-graph').textContent = 'Show Dependency Graph';
        if (graphSimulation) graphSimulation.stop();
        return;
      }

      container.style.display = 'block';
      document.getElementById('btn-show-graph').textContent = 'Hide Graph';

      // Clear previous
      svg.selectAll('*').remove();

      const width = container.clientWidth;
      const height = 500;

      svg.attr('width', width).attr('height', height);

      // Create a group for all graph content (will be transformed by zoom)
      const g = svg.append('g').attr('class', 'graph-content');

      // Add zoom/pan behavior
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      // Double-click to reset zoom
      svg.on('dblclick.zoom', () => {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      });

      // Build nodes and links from report data
      const nodeMap = new Map();
      const nodes = [];
      const links = [];

      // Add all files as nodes
      REPORT.files.forEach(file => {
        const id = file.relativePath;
        const node = {
          id,
          status: file.status,
          label: id.split('/').pop() // Just filename
        };
        nodeMap.set(id, node);
        nodes.push(node);
      });

      // Add links for dependencies
      REPORT.files.forEach(file => {
        const sourceId = file.relativePath;
        (file.dependencies || []).forEach(depPath => {
          if (nodeMap.has(depPath)) {
            links.push({ source: sourceId, target: depPath });
          }
        });
      });

      document.getElementById('graph-stats').textContent = nodes.length + ' nodes, ' + links.length + ' edges (scroll to zoom, drag to pan)';

      // Create simulation - no boundary constraints, spread out more
      graphSimulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(25));

      // Draw links
      const link = g.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('class', 'graph-link')
        .attr('stroke-width', 1);

      // Draw nodes
      const node = g.append('g')
        .attr('class', 'nodes')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 8)
        .attr('class', d => 'graph-node-circle ' + d.status)
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

      // Add labels
      const label = g.append('g')
        .attr('class', 'labels')
        .selectAll('text')
        .data(nodes)
        .enter().append('text')
        .attr('class', 'graph-label')
        .attr('dx', 12)
        .attr('dy', 4)
        .text(d => d.label);

      // Tooltips
      node.append('title').text(d => d.id + ' (' + d.status + ')');

      // Update positions on tick - NO boundary constraints
      graphSimulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);

        label
          .attr('x', d => d.x)
          .attr('y', d => d.y);
      });

      function dragstarted(event) {
        if (!event.active) graphSimulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) graphSimulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }

    function showInGraph(path) {
      // Switch to graph tab and show graph
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="graph"]').classList.add('active');
      document.getElementById('graph').classList.add('active');

      // Show the graph if not already shown
      const container = document.getElementById('graph-svg-container');
      if (container.style.display !== 'block') {
        renderD3Graph();
      }
    }

    function toggleDiff(index) {
      const diffEl = document.getElementById('diff-' + index);
      diffEl.style.display = diffEl.style.display === 'none' ? 'block' : 'none';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function renderTimeline() {
      const timelineList = document.getElementById('timeline-list');

      if (MIGRATIONS.length === 0 && REDO_STACK.length === 0) {
        timelineList.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">📜</div>
            <div>No migrations yet. Migrate a subtree to see the timeline.</div>
          </div>
        \`;
        return;
      }

      let html = '';

      // Redo section (future - things that were undone)
      if (REDO_STACK.length > 0) {
        html += '<div class="timeline-section redo-section">';
        html += '<div class="timeline-section-header">Future (Redo Available)</div>';

        // Show redo stack (first item = next to redo)
        REDO_STACK.slice().reverse().forEach((m, i) => {
          const date = new Date(m.timestamp);
          const timeStr = date.toLocaleTimeString();
          const commitShort = m.commitHash ? m.commitHash.substring(0, 7) : '?';
          const redoCount = REDO_STACK.length - i;

          html += \`
            <div class="list-item timeline-item timeline-redo">
              <div class="timeline-marker redo-marker">↻</div>
              <div class="list-item-content">
                <div class="list-item-path">\${m.subtreeRoot}</div>
                <div class="list-item-meta">
                  <span class="commit-hash">\${commitShort}</span> · \${m.files.length} files · \${timeStr}
                </div>
              </div>
              <button class="btn btn-primary btn-small" onclick="redoTo('\${m.id}')" title="Redo to this migration">
                Redo\${redoCount > 1 ? ' (' + redoCount + ')' : ''}
              </button>
            </div>
          \`;
        });

        html += '</div>';
      }

      // Current position indicator
      html += '<div class="timeline-current-marker">◆ Current Position</div>';

      // Undo section (past - active migrations)
      if (MIGRATIONS.length > 0) {
        html += '<div class="timeline-section undo-section">';
        html += '<div class="timeline-section-header">Past (Undo Available)</div>';

        // Show active migrations (newest first)
        MIGRATIONS.slice().reverse().forEach((m, i) => {
          const date = new Date(m.timestamp);
          const timeStr = date.toLocaleTimeString();
          const commitShort = m.commitHash ? m.commitHash.substring(0, 7) : '?';
          const isLatest = i === 0;
          const undoCount = i + 1;

          html += \`
            <div class="list-item timeline-item timeline-undo \${isLatest ? 'timeline-latest' : ''}">
              <div class="timeline-marker">\${MIGRATIONS.length - i}</div>
              <div class="list-item-content">
                <div class="list-item-path">\${m.subtreeRoot}</div>
                <div class="list-item-meta">
                  <span class="commit-hash">\${commitShort}</span> · \${m.files.length} files · \${timeStr}
                </div>
              </div>
              <button class="btn btn-danger btn-small" onclick="rollbackTo('\${m.id}')" title="Undo to before this migration">
                Undo\${undoCount > 1 ? ' (' + undoCount + ')' : ''}
              </button>
            </div>
          \`;
        });

        html += '</div>';
      }

      timelineList.innerHTML = html;
    }

    async function rollbackTo(migrationId) {
      const migration = MIGRATIONS.find(m => m.id === migrationId);
      if (!migration) return;

      const idx = MIGRATIONS.findIndex(m => m.id === migrationId);
      const undoCount = MIGRATIONS.length - idx;

      if (!confirm(\`Undo \${undoCount} migration(s) back to before "\${migration.subtreeRoot}"?\`)) return;

      try {
        const res = await fetch('/api/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ migrationId })
        });
        if (!res.ok) {
          const err = await res.json();
          appendOutput('Undo failed: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Error: ' + e.message, 'error');
      }
    }

    async function redoTo(migrationId) {
      const migration = REDO_STACK.find(m => m.id === migrationId);
      if (!migration) return;

      const idx = REDO_STACK.findIndex(m => m.id === migrationId);
      const redoCount = REDO_STACK.length - idx;

      if (!confirm(\`Redo \${redoCount} migration(s) forward to "\${migration.subtreeRoot}"?\`)) return;

      try {
        const res = await fetch('/api/redo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ migrationId })
        });
        if (!res.ok) {
          const err = await res.json();
          appendOutput('Redo failed: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Error: ' + e.message, 'error');
      }
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderAllFiles();
      });
    });

    // Search input
    document.getElementById('file-search').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderAllFiles();
    });

    // Init
    loadConfigToForm();
    if (REPORT) renderReport();
    connectWS();

    // Load migrations on startup
    fetch('/api/migrations')
      .then(r => r.json())
      .then(data => {
        MIGRATIONS = data.active || [];
        REDO_STACK = data.redoStack || [];
        CURRENT_COMMIT = data.currentCommit;
        renderTimeline();
      })
      .catch(e => console.error('Failed to load migrations:', e));
  </script>
</body>
</html>`;
}
