/**
 * Render Functions
 *
 * Functions that render lists: subtrees, conflicts, all files, bottlenecks.
 */

export const RENDER_SCRIPT = `
    // Global state for filtering
    let currentFilter = 'all';
    let searchQuery = '';

    function renderReport() {
      if (!REPORT) return;

      const statusCounts = { clean: 0, conflict: 0, 'restaurant-only': 0, 'retail-only': 0 };
      REPORT.files.forEach(f => { statusCounts[f.status] = (statusCounts[f.status] || 0) + 1; });

      document.getElementById('stats-row').style.display = 'flex';
      document.getElementById('stat-total').textContent = REPORT.stats.totalFiles;
      document.getElementById('stat-clean').textContent = statusCounts.clean || 0;
      document.getElementById('stat-conflicts').textContent = statusCounts.conflict || 0;
      document.getElementById('stat-subtrees').textContent = REPORT.cleanSubtrees.length;
      document.getElementById('stat-bottlenecks').textContent = REPORT.bottlenecks.filter(b => b.impactScore > 0).length + '/' + REPORT.bottlenecks.length;

      renderSubtrees();
      renderConflicts();
      renderAllFiles();
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
        const unifiedDiff = file.unifiedDiff || '';
        let diffHtml = '';

        if (unifiedDiff) {
          const lines = unifiedDiff.split('\\n');
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

      if (currentFilter !== 'all') {
        files = files.filter(f => f.status === currentFilter);
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        files = files.filter(f => f.relativePath.toLowerCase().includes(q));
      }

      if (files.length === 0) {
        filesList.innerHTML = '<div class="empty-state">No files match the current filter.</div>';
        return;
      }

      filesList.innerHTML = files.map((file, idx) => {
        const badgeClass = file.status === 'clean' ? 'badge-clean' :
                          file.status === 'conflict' ? 'badge-conflict' :
                          file.status === 'restaurant-only' ? 'badge-restaurant' : 'badge-retail';

        const deps = file.dependencies || [];
        const dependents = file.dependents || [];
        const hasDeps = deps.length > 0 || dependents.length > 0;

        const depsHtml = deps.length > 0
          ? '<div class="deps-section"><strong>Dependencies (' + deps.length + '):</strong><ul class="deps-list">' +
            deps.map(d => '<li>' + d + '</li>').join('') + '</ul></div>'
          : '';

        const dependentsHtml = dependents.length > 0
          ? '<div class="deps-section"><strong>Dependents (' + dependents.length + '):</strong><ul class="deps-list">' +
            dependents.map(d => '<li>' + d + '</li>').join('') + '</ul></div>'
          : '';

        return \`
          <div class="file-expanded">
            <div class="list-item \${hasDeps ? 'clickable' : ''}" \${hasDeps ? 'onclick="toggleFileDeps(' + idx + ')"' : ''}>
              <span class="badge \${badgeClass}">\${file.status}</span>
              <div class="list-item-content">
                <div class="list-item-path">\${file.relativePath}</div>
                <div class="list-item-meta">
                  \${deps.length} dependencies · \${dependents.length} dependents
                  \${hasDeps ? '<span class="expand-hint">(click to expand)</span>' : ''}
                </div>
              </div>
              <button class="btn btn-small" onclick="event.stopPropagation(); showInGraph('\${file.relativePath}')">Graph</button>
            </div>
            <div id="file-deps-\${idx}" class="deps-expanded" style="display: none;">
              \${depsHtml}
              \${dependentsHtml}
            </div>
          </div>
        \`;
      }).join('');
    }

    function toggleFileDeps(idx) {
      const el = document.getElementById('file-deps-' + idx);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    }

    function renderBottlenecks() {
      const bottlenecksList = document.getElementById('bottlenecks-list');

      if (!REPORT.bottlenecks || REPORT.bottlenecks.length === 0) {
        bottlenecksList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔓</div><div>No bottlenecks found. Either all files are clean or no dirty files block clean files.</div></div>';
        return;
      }

      bottlenecksList.innerHTML = REPORT.bottlenecks.map((b, i) => {
        const impactBadge = b.impactScore > 0
          ? \`<span class="badge badge-blue">Score: \${b.impactScore.toFixed(2)}</span>\`
          : '';

        const file = REPORT.files.find(f => f.relativePath === b.relativePath);
        const unifiedDiff = file?.unifiedDiff || '';
        let diffHtml = '';

        if (unifiedDiff) {
          const lines = unifiedDiff.split('\\n');
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

        const statusBadge = b.status === 'conflict' ? 'badge-conflict' :
                           b.status === 'retail-only' ? 'badge-retail' : 'badge-restaurant';

        return \`
          <div class="file-expanded">
            <div class="list-item">
              <span class="badge badge-green">Unlocks \${b.unlockCount}</span>
              \${impactBadge}
              <span class="badge">\${b.linesChanged} lines</span>
              <span class="badge \${statusBadge}">\${b.status}</span>
              <div class="list-item-content">
                <div class="list-item-path">\${b.relativePath}</div>
                <div class="list-item-meta">\${b.unlockedPaths && b.unlockedPaths.length > 0 ? 'Would unlock: ' + b.unlockedPaths.slice(0, 3).join(', ') + (b.unlockCount > 3 ? '...' : '') : ''}</div>
              </div>
              <button class="btn btn-small" onclick="toggleBottleneckDiff(\${i})">Diff</button>
            </div>
            <div id="bottleneck-diff-\${i}" style="display: none;">\${diffHtml}</div>
          </div>
        \`;
      }).join('');
    }
`;
