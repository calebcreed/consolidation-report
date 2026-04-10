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
    .stat-label { font-size: 11px; color: #8b949e; margin-top: 2px; }
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
        <div class="stat-value green" id="stat-movable">0</div>
        <div class="stat-label">Immediately Movable</div>
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
          <button class="tab active" data-tab="subtrees">Clean Subtrees</button>
          <button class="tab" data-tab="bottlenecks">Bottlenecks</button>
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

        <div id="bottlenecks" class="tab-content">
          <p class="subtitle">Resolving these would unlock the most files. Ranked by impact score.</p>
          <div class="list-container" id="bottlenecks-list">
            <div class="empty-state">
              <div class="empty-state-icon">🔓</div>
              <div>No analysis yet. Click "Analyze" to scan your project.</div>
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
          <button class="btn" onclick="copyErrors()">Copy Errors for Claude</button>
          <button class="btn btn-danger" id="btn-stop" onclick="stopBuild()" style="display: none;">Stop Build</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Initial data from server
    let REPORT = ${reportJson};
    let CONFIG = ${configJson};
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
      if (!confirm('This will undo the last migration. Continue?')) return;

      try {
        const res = await fetch('/api/rollback', { method: 'POST' });
        if (!res.ok) {
          const err = await res.json();
          appendOutput('Rollback failed: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Error: ' + e.message, 'error');
      }
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

    // Render
    function renderReport() {
      if (!REPORT) return;

      // Show stats
      document.getElementById('stats-row').style.display = 'flex';
      document.getElementById('stat-total').textContent = REPORT.stats.totalFiles;
      document.getElementById('stat-movable').textContent = REPORT.stats.immediatelyMovable;
      document.getElementById('stat-subtrees').textContent = REPORT.cleanSubtrees.length;
      document.getElementById('stat-bottlenecks').textContent = REPORT.bottlenecks.filter(b => b.unlockCount > 0).length;

      // Render subtrees
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

      // Render bottlenecks
      const bottlenecksList = document.getElementById('bottlenecks-list');
      const meaningfulBottlenecks = REPORT.bottlenecks.filter(b => b.unlockCount > 0);
      if (meaningfulBottlenecks.length === 0) {
        bottlenecksList.innerHTML = '<div class="empty-state">No bottlenecks found</div>';
      } else {
        bottlenecksList.innerHTML = meaningfulBottlenecks.map((b, i) => \`
          <div class="list-item">
            <span class="badge badge-blue">Unlocks \${b.unlockCount}</span>
            <span class="badge badge-purple">\${b.linesChanged || '?'} lines</span>
            <div class="list-item-content">
              <div class="list-item-path">\${b.relativePath}</div>
              <div class="list-item-meta">\${b.status} · Impact: \${(b.impactScore || 0).toFixed(2)}</div>
            </div>
          </div>
        \`).join('');
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

    // Init
    loadConfigToForm();
    if (REPORT) renderReport();
    connectWS();
  </script>
</body>
</html>`;
}
