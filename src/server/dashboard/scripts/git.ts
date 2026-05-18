/**
 * Git Analysis Scripts
 *
 * Functions for exploring and analyzing git history.
 */

export const GIT_SCRIPT = `
  // Git Analysis Functions

  async function gitExplore() {
    const branchA = document.getElementById('git-branch-a').value.trim();
    const branchB = document.getElementById('git-branch-b').value.trim();
    const statusEl = document.getElementById('git-status');
    const resultsEl = document.getElementById('git-results');

    statusEl.textContent = 'Exploring git history...';

    try {
      const resp = await fetch('/api/git-explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchA, branchB })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Request failed');
      }

      const data = await resp.json();
      statusEl.textContent = '';
      renderGitExploreResults(data);
    } catch (e) {
      statusEl.textContent = 'Error: ' + e.message;
      console.error('Git explore error:', e);
    }
  }

  async function gitAnalyze() {
    const branchA = document.getElementById('git-branch-a').value.trim();
    const branchB = document.getElementById('git-branch-b').value.trim();
    const filterPath = document.getElementById('git-filter-path').value.trim();
    const commitLimit = parseInt(document.getElementById('git-commit-limit').value) || 500;
    const statusEl = document.getElementById('git-status');
    const resultsEl = document.getElementById('git-results');

    statusEl.textContent = 'Analyzing commits (this may take a moment)...';

    try {
      const resp = await fetch('/api/git-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchA, branchB, filterPath, commitLimit })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Request failed');
      }

      const data = await resp.json();
      statusEl.textContent = '';
      renderGitAnalyzeResults(data);
    } catch (e) {
      statusEl.textContent = 'Error: ' + e.message;
      console.error('Git analyze error:', e);
    }
  }

  function renderGitExploreResults(data) {
    const resultsEl = document.getElementById('git-results');

    let html = '<div class="git-explore-results">';

    // Recommendation box
    html += '<div class="git-recommendation" style="background: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px;">';
    html += '<h4 style="margin: 0 0 8px 0; color: #58a6ff;">Recommendation</h4>';
    html += '<p style="margin: 0; color: #c9d1d9;">' + escapeHtml(data.recommendation) + '</p>';
    html += '</div>';

    // Key info
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">';

    if (data.mergeBase) {
      html += '<div class="git-info-card" style="background: #238636; padding: 12px; border-radius: 6px;">';
      html += '<div style="font-size: 11px; opacity: 0.8;">Merge Base</div>';
      html += '<div style="font-family: monospace; font-size: 13px;">' + data.mergeBase.slice(0, 12) + '</div>';
      html += '</div>';
    } else {
      html += '<div class="git-info-card" style="background: #da3633; padding: 12px; border-radius: 6px;">';
      html += '<div style="font-size: 11px; opacity: 0.8;">Merge Base</div>';
      html += '<div style="font-size: 13px;">None (separate histories)</div>';
      html += '</div>';
    }

    if (data.branchARoot) {
      html += '<div class="git-info-card" style="background: #1f6feb; padding: 12px; border-radius: 6px;">';
      html += '<div style="font-size: 11px; opacity: 0.8;">Branch A Root</div>';
      html += '<div style="font-family: monospace; font-size: 13px;">' + data.branchARoot.slice(0, 12) + '</div>';
      html += '</div>';
    }

    if (data.branchBRoot) {
      html += '<div class="git-info-card" style="background: #8957e5; padding: 12px; border-radius: 6px;">';
      html += '<div style="font-size: 11px; opacity: 0.8;">Branch B Root</div>';
      html += '<div style="font-family: monospace; font-size: 13px;">' + data.branchBRoot.slice(0, 12) + '</div>';
      html += '</div>';
    }

    html += '</div>';

    // Oldest commits
    if (data.branchAOldest || data.branchBOldest) {
      html += '<h4 style="margin: 16px 0 8px 0; color: #8b949e;">Oldest Commits</h4>';
      html += '<div style="display: grid; gap: 8px;">';

      if (data.branchAOldest) {
        html += '<div style="background: #161b22; padding: 12px; border-radius: 6px; border-left: 3px solid #1f6feb;">';
        html += '<div style="font-size: 11px; color: #8b949e;">Branch A: ' + data.branchAOldest.date + '</div>';
        html += '<div style="font-family: monospace; font-size: 12px; color: #58a6ff;">' + data.branchAOldest.hash.slice(0, 8) + '</div>';
        html += '<div style="color: #c9d1d9; font-size: 13px; margin-top: 4px;">' + escapeHtml(data.branchAOldest.message) + '</div>';
        html += '</div>';
      }

      if (data.branchBOldest) {
        html += '<div style="background: #161b22; padding: 12px; border-radius: 6px; border-left: 3px solid #8957e5;">';
        html += '<div style="font-size: 11px; color: #8b949e;">Branch B: ' + data.branchBOldest.date + '</div>';
        html += '<div style="font-family: monospace; font-size: 12px; color: #58a6ff;">' + data.branchBOldest.hash.slice(0, 8) + '</div>';
        html += '<div style="color: #c9d1d9; font-size: 13px; margin-top: 4px;">' + escapeHtml(data.branchBOldest.message) + '</div>';
        html += '</div>';
      }

      html += '</div>';
    }

    // Merge commits
    if (data.mergeCommits && data.mergeCommits.length > 0) {
      html += '<h4 style="margin: 16px 0 8px 0; color: #8b949e;">Recent Merge Commits (' + data.mergeCommits.length + ')</h4>';
      html += '<div style="display: grid; gap: 8px; max-height: 300px; overflow-y: auto;">';

      for (const commit of data.mergeCommits) {
        html += '<div style="background: #161b22; padding: 10px; border-radius: 6px; display: flex; gap: 12px; align-items: flex-start;">';
        html += '<div style="font-family: monospace; font-size: 11px; color: #58a6ff; white-space: nowrap;">' + commit.hash.slice(0, 8) + '</div>';
        html += '<div style="flex: 1;">';
        html += '<div style="font-size: 12px; color: #8b949e;">' + commit.date + '</div>';
        html += '<div style="font-size: 13px; color: #c9d1d9;">' + escapeHtml(commit.message) + '</div>';
        html += '</div>';
        html += '</div>';
      }

      html += '</div>';
    }

    html += '</div>';
    resultsEl.innerHTML = html;
  }

  function renderGitAnalyzeResults(data) {
    const resultsEl = document.getElementById('git-results');

    let html = '<div class="git-analyze-results">';

    // Summary stats
    html += '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">';

    html += '<div style="background: #1f6feb; padding: 12px; border-radius: 6px; text-align: center;">';
    html += '<div style="font-size: 24px; font-weight: bold;">' + data.branchA.totalCommits + '</div>';
    html += '<div style="font-size: 11px; opacity: 0.8;">Commits (A)</div>';
    html += '</div>';

    html += '<div style="background: #8957e5; padding: 12px; border-radius: 6px; text-align: center;">';
    html += '<div style="font-size: 24px; font-weight: bold;">' + data.branchB.totalCommits + '</div>';
    html += '<div style="font-size: 11px; opacity: 0.8;">Commits (B)</div>';
    html += '</div>';

    html += '<div style="background: #da3633; padding: 12px; border-radius: 6px; text-align: center;">';
    html += '<div style="font-size: 24px; font-weight: bold;">' + data.conflicts.length + '</div>';
    html += '<div style="font-size: 11px; opacity: 0.8;">Conflict Files</div>';
    html += '</div>';

    html += '<div style="background: #238636; padding: 12px; border-radius: 6px; text-align: center;">';
    html += '<div style="font-size: 24px; font-weight: bold;">' + (data.branchA.clusters.length + data.branchB.clusters.length) + '</div>';
    html += '<div style="font-size: 11px; opacity: 0.8;">Total Clusters</div>';
    html += '</div>';

    html += '</div>';

    // Tabs for branch A, branch B, conflicts
    html += '<div class="git-tabs" style="display: flex; gap: 8px; margin-bottom: 12px;">';
    html += '<button class="btn btn-small git-tab-btn active" data-git-tab="branch-a" onclick="switchGitTab(\\'branch-a\\')">Branch A (' + data.branchA.clusters.length + ' clusters)</button>';
    html += '<button class="btn btn-small git-tab-btn" data-git-tab="branch-b" onclick="switchGitTab(\\'branch-b\\')">Branch B (' + data.branchB.clusters.length + ' clusters)</button>';
    html += '<button class="btn btn-small git-tab-btn" data-git-tab="conflicts" onclick="switchGitTab(\\'conflicts\\')">Conflicts (' + data.conflicts.length + ')</button>';
    html += '</div>';

    // Branch A clusters
    html += '<div id="git-tab-branch-a" class="git-tab-content">';
    html += renderGitClusters(data.branchA.clusters, '#1f6feb');
    html += '</div>';

    // Branch B clusters
    html += '<div id="git-tab-branch-b" class="git-tab-content" style="display: none;">';
    html += renderGitClusters(data.branchB.clusters, '#8957e5');
    html += '</div>';

    // Conflicts list
    html += '<div id="git-tab-conflicts" class="git-tab-content" style="display: none;">';
    html += '<div style="display: grid; gap: 4px; max-height: 400px; overflow-y: auto;">';
    for (const file of data.conflicts.slice(0, 100)) {
      html += '<div style="background: #161b22; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #f85149;">' + escapeHtml(file) + '</div>';
    }
    if (data.conflicts.length > 100) {
      html += '<div style="color: #8b949e; padding: 8px;">...and ' + (data.conflicts.length - 100) + ' more</div>';
    }
    html += '</div>';
    html += '</div>';

    html += '</div>';
    resultsEl.innerHTML = html;

    // Store for later use
    window.GIT_ANALYSIS = data;
  }

  function renderGitClusters(clusters, color) {
    if (!clusters || clusters.length === 0) {
      return '<div style="color: #8b949e; padding: 16px;">No clusters found</div>';
    }

    let html = '<div style="display: grid; gap: 12px; max-height: 400px; overflow-y: auto;">';

    for (const cluster of clusters) {
      html += '<div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; border-left: 3px solid ' + color + ';">';

      // Header
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
      html += '<h4 style="margin: 0; color: #c9d1d9; font-size: 14px;">' + escapeHtml(cluster.name) + '</h4>';
      html += '<span style="background: ' + color + '; padding: 2px 8px; border-radius: 10px; font-size: 11px;">' + cluster.files.length + ' files</span>';
      html += '</div>';

      // Commit messages (if any)
      if (cluster.commitMessages && cluster.commitMessages.length > 0) {
        html += '<div style="margin-bottom: 8px;">';
        html += '<div style="font-size: 11px; color: #8b949e; margin-bottom: 4px;">Recent commits:</div>';
        for (const msg of cluster.commitMessages.slice(0, 3)) {
          html += '<div style="font-size: 12px; color: #8b949e; padding-left: 8px; border-left: 2px solid #30363d; margin-bottom: 2px;">' + escapeHtml(msg.slice(0, 80)) + '</div>';
        }
        html += '</div>';
      }

      // Files (collapsed by default)
      html += '<details style="margin-top: 8px;">';
      html += '<summary style="cursor: pointer; color: #58a6ff; font-size: 12px;">Show files</summary>';
      html += '<div style="margin-top: 8px; display: grid; gap: 2px; max-height: 150px; overflow-y: auto;">';
      for (const file of cluster.files) {
        html += '<div style="font-family: monospace; font-size: 11px; color: #8b949e; padding: 2px 0;">' + escapeHtml(file) + '</div>';
      }
      html += '</div>';
      html += '</details>';

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function switchGitTab(tabName) {
    // Update buttons
    document.querySelectorAll('.git-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-git-tab') === tabName);
    });

    // Update content
    document.querySelectorAll('.git-tab-content').forEach(content => {
      content.style.display = content.id === 'git-tab-' + tabName ? 'block' : 'none';
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
`;
