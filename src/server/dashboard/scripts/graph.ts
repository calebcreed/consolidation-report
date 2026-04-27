/**
 * D3 Graph Visualization
 *
 * Force-directed dependency graph using D3.js.
 */

export const GRAPH_SCRIPT = `
    let graphSimulation = null;

    function renderD3Graph() {
      if (!REPORT || !REPORT.files) return;

      const container = document.getElementById('graph-svg-container');
      const svg = d3.select('#graph-svg');

      // Toggle visibility
      if (container.style.display === 'block') {
        container.style.display = 'none';
        document.getElementById('btn-show-graph').textContent = 'Show Dependency Graph';
        if (graphSimulation) graphSimulation.stop();
        return;
      }

      container.style.display = 'block';
      document.getElementById('btn-show-graph').textContent = 'Hide Graph';

      // Clear previous
      svg.selectAll('*').remove();

      const width = container.clientWidth;
      const height = 500;

      svg.attr('width', width).attr('height', height);

      // Create a group for all graph content (will be transformed by zoom)
      const g = svg.append('g').attr('class', 'graph-content');

      // Add zoom/pan behavior
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      // Double-click to reset zoom
      svg.on('dblclick.zoom', () => {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      });

      // Build nodes and links from report data
      const nodeMap = new Map();
      const nodes = [];
      const links = [];

      // Add all files as nodes
      REPORT.files.forEach(file => {
        const id = file.relativePath;
        const node = {
          id,
          status: file.status,
          label: id.split('/').pop()
        };
        nodeMap.set(id, node);
        nodes.push(node);
      });

      // Add links for dependencies
      REPORT.files.forEach(file => {
        const sourceId = file.relativePath;
        (file.dependencies || []).forEach(depPath => {
          if (nodeMap.has(depPath)) {
            links.push({ source: sourceId, target: depPath });
          }
        });
      });

      document.getElementById('graph-stats').textContent = nodes.length + ' nodes, ' + links.length + ' edges (scroll to zoom, drag to pan)';

      // Create simulation
      graphSimulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(25));

      // Draw links
      const link = g.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('class', 'graph-link')
        .attr('stroke-width', 1);

      // Draw nodes
      const node = g.append('g')
        .attr('class', 'nodes')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 8)
        .attr('class', d => 'graph-node-circle ' + d.status)
        .style('cursor', d => d.status === 'conflict' ? 'pointer' : 'default')
        .on('click', (event, d) => {
          if (d.status === 'conflict') {
            showConflictDiff(d.id);
          }
        })
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

      // Add labels
      const label = g.append('g')
        .attr('class', 'labels')
        .selectAll('text')
        .data(nodes)
        .enter().append('text')
        .attr('class', 'graph-label')
        .attr('dx', 12)
        .attr('dy', 4)
        .text(d => d.label);

      // Tooltips
      node.append('title').text(d => d.id + ' (' + d.status + ')');

      // Update positions on tick
      graphSimulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);

        label
          .attr('x', d => d.x)
          .attr('y', d => d.y);
      });

      function dragstarted(event) {
        if (!event.active) graphSimulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) graphSimulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }

    function showInGraph(path) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="graph"]').classList.add('active');
      document.getElementById('graph').classList.add('active');

      const container = document.getElementById('graph-svg-container');
      if (container.style.display !== 'block') {
        renderD3Graph();
      }
    }

    function showConflictDiff(relativePath) {
      // Switch to conflicts tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="conflicts"]').classList.add('active');
      document.getElementById('conflicts').classList.add('active');

      // Find the index of this conflict
      const conflicts = REPORT.files.filter(f => f.status === 'conflict');
      const idx = conflicts.findIndex(f => f.relativePath === relativePath);

      if (idx !== -1) {
        // Show the diff
        const diffEl = document.getElementById('diff-' + idx);
        if (diffEl) {
          diffEl.style.display = 'block';
          // Scroll to it
          diffEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
`;
