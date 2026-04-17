/**
 * Timeline Rendering
 *
 * Migration history with undo/redo visualization.
 */

export const TIMELINE_SCRIPT = `
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
`;
