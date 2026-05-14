/**
 * WebSocket Connection and Message Handling
 *
 * Manages real-time communication with the server.
 */

export const WEBSOCKET_SCRIPT = `
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
          if (msg.data) {
            MIGRATIONS = msg.data.migrations || [];
            REDO_STACK = msg.data.redoStack || [];
            CURRENT_COMMIT = msg.data.currentCommit;
            renderTimeline();
          }
          break;
        case 'migration':
          if (msg.data) {
            MIGRATIONS.push(msg.data);
            REDO_STACK = [];
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
          if (msg.data.clusters) {
            CLUSTERS = msg.data.clusters;
            if (CLUSTERS && CLUSTERS.packages && CLUSTERS.packages.length > 0) {
              renderClusters();
            }
          }
          break;

        // Clustering messages
        case 'cluster-start':
          document.getElementById('cluster-progress-text').textContent = 'Starting clustering for ' + msg.data.fileCount + ' files...';
          break;

        case 'cluster-progress':
          const progress = msg.data;
          document.getElementById('cluster-progress-text').textContent = progress.message;

          if (progress.type === 'community-assigned') {
            animateCommunityAssignment(progress.data);
          }
          break;

        case 'cluster-complete':
          CLUSTERS = msg.data;
          // Delay to let animation finish
          setTimeout(() => {
            renderClusters();
          }, 1000);
          break;

        case 'cluster-renamed':
          if (CLUSTERS) {
            const pkg = CLUSTERS.packages.find(p => p.id === msg.data.id);
            if (pkg) pkg.name = msg.data.name;
          }
          break;

        case 'cluster-file-moved':
          if (CLUSTERS) {
            const { file, from, to } = msg.data;

            // Remove from source
            if (from === 'unassigned') {
              CLUSTERS.unassignedFiles = CLUSTERS.unassignedFiles.filter(f => f !== file);
            } else {
              const fromPkg = CLUSTERS.packages.find(p => p.id === parseInt(from, 10));
              if (fromPkg) fromPkg.files = fromPkg.files.filter(f => f !== file);
            }

            // Add to destination
            if (to === 'unassigned') {
              CLUSTERS.unassignedFiles.push(file);
            } else {
              const toPkg = CLUSTERS.packages.find(p => p.id === parseInt(to, 10));
              if (toPkg) toPkg.files.push(file);
            }

            // Re-render
            renderClusters();
          }
          break;
      }
    }
`;
