/**
 * Dashboard HTML Template
 *
 * The structural HTML for the branch consolidator dashboard.
 * Contains all elements, tabs, panels but no scripts or styles.
 */

export const DASHBOARD_TEMPLATE = `
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <h1>Branch Consolidator</h1>
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
            <input type="text" id="config-project" placeholder="/path/to/branch">
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
`;
