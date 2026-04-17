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
          break;
      }
    }
`;
