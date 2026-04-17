/**
 * Initialization and Event Handlers
 *
 * Sets up tabs, filters, search, and initializes the dashboard.
 */

export const INIT_SCRIPT = `
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
`;
