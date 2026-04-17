/**
 * UI Utility Functions
 *
 * Status badge, output panel, config panel, and helper functions.
 */

export const UI_SCRIPT = `
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

      if (CONFIG.projectPath) {
        document.getElementById('config-panel').classList.add('collapsed');
        document.getElementById('config-toggle').textContent = '▶';
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function toggleDiff(index) {
      const diffEl = document.getElementById('diff-' + index);
      diffEl.style.display = diffEl.style.display === 'none' ? 'block' : 'none';
    }

    function toggleBottleneckDiff(index) {
      const diffEl = document.getElementById('bottleneck-diff-' + index);
      diffEl.style.display = diffEl.style.display === 'none' ? 'block' : 'none';
    }
`;
