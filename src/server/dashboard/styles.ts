/**
 * Dashboard CSS Styles
 *
 * All styling for the branch consolidator dashboard.
 * GitHub-inspired dark theme.
 */

export const DASHBOARD_STYLES = `
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
`;
