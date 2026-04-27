/**
 * API Functions
 *
 * All server API calls: config, analysis, build, migrate, rollback.
 */

export const API_SCRIPT = `
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

        let html = '<div style="padding: 16px;">';
        html += '<div style="margin-bottom: 16px; color: #8b949e;">Scanned: <code>' + data.scannedPath + '</code></div>';
        html += '<div style="margin-bottom: 16px;">Found <strong>' + data.totalFiles + '</strong> files with <strong>' + data.extensions.length + '</strong> unique extensions</div>';

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

    async function openSubtreeInVSCode(index, mode) {
      const subtree = REPORT.cleanSubtrees[index];
      try {
        const res = await fetch('/api/open-vscode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: mode === 'root' ? [subtree.rootPath] : subtree.files,
            mode: mode
          }),
        });
        if (res.ok) {
          appendOutput('Opened in VS Code', 'success');
        } else {
          const err = await res.json();
          appendOutput('Failed to open: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Failed to open: ' + e.message, 'error');
      }
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
`;
