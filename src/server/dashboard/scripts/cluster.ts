/**
 * Cluster UI Script
 *
 * Handles clustering visualization, animation, drag-and-drop, and cluster management.
 */

export const CLUSTER_SCRIPT = `
    // Cluster animation state
    let clusterSimulation = null;
    let clusterNodes = [];
    let clusterLinks = [];
    let clusterCommunities = new Map();

    // ============ Run Clustering ============

    async function runClustering() {
      if (!REPORT || !REPORT.files) {
        appendOutput('No report available. Run analysis first.', 'error');
        return;
      }

      const conflicts = REPORT.files.filter(f => f.status === 'conflict');
      if (conflicts.length === 0) {
        appendOutput('No conflict files to cluster.', 'error');
        return;
      }

      // Show animation container
      document.getElementById('cluster-empty').style.display = 'none';
      document.getElementById('cluster-workspace').style.display = 'none';
      document.getElementById('cluster-animation').style.display = 'block';
      document.getElementById('btn-run-cluster').disabled = true;
      document.getElementById('cluster-status').textContent = 'Clustering...';

      // Initialize animation
      initClusterAnimation(conflicts);

      try {
        const res = await fetch('/api/cluster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }

        // Response handled via WebSocket
      } catch (e) {
        appendOutput('Clustering failed: ' + e.message, 'error');
        document.getElementById('btn-run-cluster').disabled = false;
        document.getElementById('cluster-status').textContent = '';
      }
    }

    // ============ Load Test Data ============

    async function loadTestData() {
      document.getElementById('btn-load-test').disabled = true;
      document.getElementById('cluster-status').textContent = 'Loading test data...';

      try {
        const res = await fetch('/api/load-test-data', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error);
        }

        appendOutput('Loaded ' + data.fileCount + ' test files. Click "Run Clustering" to cluster them.', 'info');
        document.getElementById('cluster-status').textContent = 'Test data loaded (' + data.fileCount + ' files)';
      } catch (e) {
        appendOutput('Failed to load test data: ' + e.message, 'error');
        document.getElementById('cluster-status').textContent = '';
      } finally {
        document.getElementById('btn-load-test').disabled = false;
      }
    }

    // ============ Animation ============

    function initClusterAnimation(conflicts) {
      const container = document.getElementById('cluster-graph-container');
      const svg = d3.select('#cluster-graph-svg');

      svg.selectAll('*').remove();
      clusterCommunities.clear();

      const width = container.clientWidth;
      const height = 400;

      svg.attr('width', width).attr('height', height);

      // Create group for zoom/pan
      const g = svg.append('g').attr('class', 'cluster-graph-content');

      // Add zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform));
      svg.call(zoom);

      // Build nodes from conflict files
      clusterNodes = conflicts.map((file, i) => ({
        id: file.relativePath,
        index: i,
        label: file.relativePath.split('/').pop(),
        community: null,
        x: width / 2 + (Math.random() - 0.5) * width * 0.8,
        y: height / 2 + (Math.random() - 0.5) * height * 0.8,
      }));

      // Build links from dependencies
      const nodeMap = new Map(clusterNodes.map(n => [n.id, n]));
      clusterLinks = [];

      conflicts.forEach(file => {
        const source = nodeMap.get(file.relativePath);
        (file.dependencies || []).forEach(dep => {
          const target = nodeMap.get(dep);
          if (target) {
            clusterLinks.push({ source, target });
          }
        });
      });

      // Create simulation
      clusterSimulation = d3.forceSimulation(clusterNodes)
        .force('link', d3.forceLink(clusterLinks).id(d => d.id).distance(80).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-100))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(15));

      // Draw links
      const link = g.append('g')
        .attr('class', 'cluster-links')
        .selectAll('line')
        .data(clusterLinks)
        .enter().append('line')
        .attr('class', 'cluster-link')
        .attr('stroke-width', 1);

      // Draw nodes (initially gray/unassigned)
      const node = g.append('g')
        .attr('class', 'cluster-nodes')
        .selectAll('circle')
        .data(clusterNodes)
        .enter().append('circle')
        .attr('r', 6)
        .attr('class', 'cluster-node community-unassigned')
        .style('cursor', 'pointer')
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

      // Add tooltips
      node.append('title').text(d => d.id);

      // Update on tick
      clusterSimulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);
      });

      function dragstarted(event) {
        if (!event.active) clusterSimulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) clusterSimulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      // Update legend
      document.getElementById('cluster-legend').innerHTML = '<div class="graph-legend-item"><div class="graph-legend-dot" style="background: #484f58;"></div> Unassigned</div>';
    }

    function animateCommunityAssignment(data) {
      const { communityId, files, color } = data;

      // Update node communities
      const svg = d3.select('#cluster-graph-svg');
      const nodeMap = new Map(clusterNodes.map(n => [n.id, n]));

      files.forEach(fileId => {
        const node = nodeMap.get(fileId);
        if (node) {
          node.community = communityId;
          clusterCommunities.set(fileId, communityId);
        }
      });

      // Update node colors with transition
      svg.selectAll('.cluster-node')
        .transition()
        .duration(300)
        .attr('class', d => 'cluster-node community-' + (d.community !== null ? d.community % 10 : 'unassigned'))
        .attr('r', d => d.community !== null ? 8 : 6);

      // Add clustering force to group communities
      if (clusterSimulation) {
        const width = document.getElementById('cluster-graph-container').clientWidth;
        const height = 400;

        // Calculate cluster centers
        const clusterCenters = new Map();
        const clusterCounts = new Map();

        clusterNodes.forEach(n => {
          if (n.community !== null) {
            if (!clusterCenters.has(n.community)) {
              clusterCenters.set(n.community, { x: 0, y: 0 });
              clusterCounts.set(n.community, 0);
            }
            clusterCenters.get(n.community).x += n.x;
            clusterCenters.get(n.community).y += n.y;
            clusterCounts.set(n.community, clusterCounts.get(n.community) + 1);
          }
        });

        clusterCenters.forEach((center, id) => {
          const count = clusterCounts.get(id);
          center.x /= count;
          center.y /= count;
        });

        // Add force toward cluster centers
        clusterSimulation.force('cluster', (alpha) => {
          clusterNodes.forEach(d => {
            if (d.community !== null && clusterCenters.has(d.community)) {
              const center = clusterCenters.get(d.community);
              d.vx = (d.vx || 0) + (center.x - d.x) * alpha * 0.3;
              d.vy = (d.vy || 0) + (center.y - d.y) * alpha * 0.3;
            }
          });
        });

        clusterSimulation.alpha(0.5).restart();
      }

      // Update legend
      updateClusterLegend();
    }

    function updateClusterLegend() {
      const communities = new Set();
      clusterNodes.forEach(n => {
        if (n.community !== null) communities.add(n.community);
      });

      const colors = ['#3fb950', '#58a6ff', '#a371f7', '#f0883e', '#db61a2', '#7ee787', '#79c0ff', '#d2a8ff', '#ffa657', '#ff7b72'];
      let html = '';

      communities.forEach(id => {
        const color = colors[id % colors.length];
        const count = clusterNodes.filter(n => n.community === id).length;
        html += '<div class="graph-legend-item"><div class="graph-legend-dot" style="background: ' + color + ';"></div> Cluster ' + (id + 1) + ' (' + count + ')</div>';
      });

      const unassigned = clusterNodes.filter(n => n.community === null).length;
      if (unassigned > 0) {
        html += '<div class="graph-legend-item"><div class="graph-legend-dot" style="background: #484f58;"></div> Unassigned (' + unassigned + ')</div>';
      }

      document.getElementById('cluster-legend').innerHTML = html;
    }

    // ============ Render Clusters ============

    function renderClusters() {
      if (!CLUSTERS || CLUSTERS.packages.length === 0) {
        document.getElementById('cluster-empty').style.display = 'block';
        document.getElementById('cluster-workspace').style.display = 'none';
        document.getElementById('cluster-animation').style.display = 'none';
        return;
      }

      document.getElementById('cluster-empty').style.display = 'none';
      document.getElementById('cluster-animation').style.display = 'none';
      document.getElementById('cluster-workspace').style.display = 'block';

      renderClusterCards();
      renderUnassignedFiles();

      document.getElementById('btn-run-cluster').disabled = false;
      document.getElementById('cluster-status').textContent = CLUSTERS.packages.length + ' clusters, ' + CLUSTERS.unassignedFiles.length + ' unassigned';
    }

    function renderClusterCards() {
      const container = document.getElementById('cluster-cards');
      const colors = ['#3fb950', '#58a6ff', '#a371f7', '#f0883e', '#db61a2', '#7ee787', '#79c0ff', '#d2a8ff', '#ffa657', '#ff7b72'];

      container.innerHTML = CLUSTERS.packages.map((pkg, idx) => {
        const color = colors[pkg.id % colors.length];
        const filesHtml = pkg.files.slice(0, 10).map(f =>
          '<div class="cluster-file" draggable="true" data-file="' + escapeHtml(f) + '" data-cluster="' + pkg.id + '">' + escapeHtml(f.split('/').pop()) + '</div>'
        ).join('');

        const moreCount = pkg.files.length - 10;
        const moreHtml = moreCount > 0 ? '<div class="cluster-file-count">+ ' + moreCount + ' more files</div>' : '';

        return \`
          <div class="cluster-card" data-cluster-id="\${pkg.id}" ondragover="handleClusterDragOver(event)" ondragleave="handleClusterDragLeave(event)" ondrop="handleClusterDrop(event, \${pkg.id})">
            <div class="cluster-card-header">
              <div class="cluster-name" contenteditable="true" data-cluster-id="\${pkg.id}" onblur="saveClusterName(this)" onkeydown="handleNameKeydown(event, this)">\${escapeHtml(pkg.name)}</div>
              <div class="cluster-metrics">
                <span class="cluster-metric"><span class="cluster-metric-value">\${pkg.files.length}</span> files</span>
                <span class="cluster-metric">cohesion: <span class="cluster-metric-value">\${pkg.cohesion}</span></span>
              </div>
            </div>
            <div class="cluster-mini-graph" id="mini-graph-\${pkg.id}">
              <svg></svg>
            </div>
            <div class="cluster-files">\${filesHtml}</div>
            \${moreHtml}
          </div>
        \`;
      }).join('');

      // Render mini graphs
      CLUSTERS.packages.forEach(pkg => {
        renderMiniGraph(pkg);
      });

      // Setup drag handlers for files
      setupFileDragHandlers();
    }

    function renderMiniGraph(pkg) {
      const container = document.getElementById('mini-graph-' + pkg.id);
      if (!container) return;

      const svg = d3.select(container).select('svg');
      svg.selectAll('*').remove();

      const width = container.clientWidth || 320;
      const height = 120;

      svg.attr('width', width).attr('height', height);

      // Build nodes and links from package files
      const nodes = pkg.files.map((f, i) => ({
        id: f,
        index: i,
        x: width / 2 + (Math.random() - 0.5) * width * 0.6,
        y: height / 2 + (Math.random() - 0.5) * height * 0.6,
      }));

      const nodeSet = new Set(pkg.files);
      const links = [];

      if (REPORT && REPORT.files) {
        REPORT.files.forEach(file => {
          if (!nodeSet.has(file.relativePath)) return;
          (file.dependencies || []).forEach(dep => {
            if (nodeSet.has(dep)) {
              links.push({
                source: nodes.find(n => n.id === file.relativePath),
                target: nodes.find(n => n.id === dep),
              });
            }
          });
        });
      }

      // Create simulation
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(30).strength(0.5))
        .force('charge', d3.forceManyBody().strength(-30))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(8));

      // Draw links
      const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', '#30363d')
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 1);

      // Draw nodes
      const colors = ['#3fb950', '#58a6ff', '#a371f7', '#f0883e', '#db61a2', '#7ee787', '#79c0ff', '#d2a8ff', '#ffa657', '#ff7b72'];
      const color = colors[pkg.id % colors.length];

      const node = svg.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 4)
        .attr('fill', color)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .style('opacity', 0.8);

      // Update on tick
      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => Math.max(4, Math.min(width - 4, d.x)))
          .attr('cy', d => Math.max(4, Math.min(height - 4, d.y)));
      });

      // Stop after a bit to save CPU
      setTimeout(() => simulation.stop(), 2000);
    }

    function renderUnassignedFiles() {
      const container = document.getElementById('unassigned-files');
      const countEl = document.getElementById('unassigned-count');

      countEl.textContent = CLUSTERS.unassignedFiles.length;

      if (CLUSTERS.unassignedFiles.length === 0) {
        container.innerHTML = '<div class="unassigned-empty">No unassigned files</div>';
        return;
      }

      container.innerHTML = CLUSTERS.unassignedFiles.map(f =>
        '<div class="cluster-file" draggable="true" data-file="' + escapeHtml(f) + '" data-cluster="unassigned">' + escapeHtml(f.split('/').pop()) + '</div>'
      ).join('');

      setupFileDragHandlers();
    }

    // ============ Drag and Drop ============

    let draggedFile = null;
    let draggedFromCluster = null;

    function setupFileDragHandlers() {
      document.querySelectorAll('.cluster-file[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', handleDragStart);
        el.addEventListener('dragend', handleDragEnd);
      });
    }

    function handleDragStart(e) {
      draggedFile = e.target.dataset.file;
      draggedFromCluster = e.target.dataset.cluster;
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedFile);
    }

    function handleDragEnd(e) {
      e.target.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function handleClusterDragOver(e) {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }

    function handleClusterDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    async function handleClusterDrop(e, toClusterId) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');

      if (!draggedFile) return;

      const from = draggedFromCluster;
      const to = toClusterId;

      if (from === String(to)) return; // Same cluster

      try {
        const res = await fetch('/api/cluster/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: draggedFile,
            fromClusterId: from,
            toClusterId: to,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          appendOutput('Failed to move file: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Failed to move file: ' + e.message, 'error');
      }

      draggedFile = null;
      draggedFromCluster = null;
    }

    // Unassigned column drop handlers
    document.getElementById('unassigned-column')?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    });

    document.getElementById('unassigned-column')?.addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('drag-over');
    });

    document.getElementById('unassigned-column')?.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');

      if (!draggedFile) return;

      const from = draggedFromCluster;
      if (from === 'unassigned') return;

      try {
        const res = await fetch('/api/cluster/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file: draggedFile,
            fromClusterId: from,
            toClusterId: 'unassigned',
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          appendOutput('Failed to move file: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Failed to move file: ' + e.message, 'error');
      }

      draggedFile = null;
      draggedFromCluster = null;
    });

    // ============ Name Editing ============

    function handleNameKeydown(e, el) {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      } else if (e.key === 'Escape') {
        // Revert to original name
        const clusterId = parseInt(el.dataset.clusterId, 10);
        const pkg = CLUSTERS.packages.find(p => p.id === clusterId);
        if (pkg) el.textContent = pkg.name;
        el.blur();
      }
    }

    async function saveClusterName(el) {
      const clusterId = parseInt(el.dataset.clusterId, 10);
      const newName = el.textContent.trim();

      if (!newName) {
        // Revert if empty
        const pkg = CLUSTERS.packages.find(p => p.id === clusterId);
        if (pkg) el.textContent = pkg.name;
        return;
      }

      try {
        const res = await fetch('/api/cluster/' + clusterId + '/name', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });

        if (!res.ok) {
          const err = await res.json();
          appendOutput('Failed to rename cluster: ' + err.error, 'error');
        }
      } catch (e) {
        appendOutput('Failed to rename cluster: ' + e.message, 'error');
      }
    }
`;
