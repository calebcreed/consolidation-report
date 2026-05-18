/**
 * API Routes - all Express route handlers
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { Router, Request, Response } from 'express';
import { StateManager, ServerConfig } from './state';
import { WebSocketManager } from './server-websocket';
import { runAnalysis } from './server-analysis';
import { discoverFileTypes } from './server-utils';
import { generateInteractiveHtml } from './html';
import { runClusteringWithProgress } from './server-clustering';
import { analyzeGitHistory } from '../git/commit-clustering';

export function createRoutes(
  stateManager: StateManager,
  wsManager: WebSocketManager
): Router {
  const router = Router();

  // API: Get current state
  router.get('/api/state', (req: Request, res: Response) => {
    res.json(stateManager.getState());
  });

  // API: Get/Set config
  router.get('/api/config', (req: Request, res: Response) => {
    res.json(stateManager.getConfig());
  });

  router.post('/api/config', (req: Request, res: Response) => {
    try {
      const config: ServerConfig = req.body;
      stateManager.saveConfig(config);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // API: Run analysis
  router.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const config = stateManager.getConfig();
      if (!config) {
        return res.status(400).json({ error: 'No config set. Configure project path first.' });
      }

      wsManager.output('Starting analysis...');

      const report = await runAnalysis(config, (msg) => wsManager.output(msg));

      stateManager.setReport(report);
      wsManager.broadcast({ type: 'report', data: report });

      res.json(report);
    } catch (e: any) {
      wsManager.output(`Error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get report
  router.get('/api/report', (req: Request, res: Response) => {
    const report = stateManager.getReport();
    if (!report) {
      return res.status(404).json({ error: 'No report available. Run analysis first.' });
    }
    res.json(report);
  });

  // API: Load mock test data (for testing clustering)
  router.post('/api/load-test-data', (req: Request, res: Response) => {
    try {
      const mockPath = path.join(process.cwd(), 'test-cluster-data', 'mock-report.json');
      if (!fs.existsSync(mockPath)) {
        return res.status(404).json({ error: 'Mock report not found. Run: node scripts/test-clustering.js first' });
      }

      const mockData = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));

      // Convert to report format
      const report = {
        generatedAt: new Date().toISOString(),
        files: mockData.files.map((f: any) => ({
          ...f,
          absolutePath: path.join(process.cwd(), 'test-cluster-data', 'src', 'app', f.relativePath),
        })),
        stats: {
          totalFiles: mockData.files.length,
          conflictFiles: mockData.files.length,
          retailOnlyFiles: 0,
          restaurantOnlyFiles: 0,
          identicalFiles: 0,
        },
        cleanSubtrees: [],
        bottlenecks: [],
      };

      stateManager.setReport(report as any);
      wsManager.broadcast({ type: 'report', data: report });
      wsManager.output(`Loaded ${report.files.length} test files for clustering demo`);

      res.json({ success: true, fileCount: report.files.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Migrate a subtree
  router.post('/api/migrate', async (req: Request, res: Response) => {
    try {
      const { subtreeIndex } = req.body;
      const report = stateManager.getReport();

      if (!report) {
        return res.status(400).json({ error: 'No report available. Run analysis first.' });
      }

      const subtree = report.cleanSubtrees[subtreeIndex];
      if (!subtree) {
        return res.status(400).json({ error: 'Invalid subtree index' });
      }

      wsManager.output(`Migrating subtree: ${subtree.rootPath}`);
      wsManager.output(`Files to move: ${subtree.files.length}`);

      const record = await stateManager.migrate(subtree);

      // Remove migrated subtree from report
      report.cleanSubtrees.splice(subtreeIndex, 1);

      // Mark migrated files in the report
      const migratedSet = new Set(subtree.files);
      report.files = report.files.filter(f => !migratedSet.has(f.relativePath));
      report.stats.totalFiles = report.files.length;
      report.stats.immediatelyMovable = report.cleanSubtrees.reduce((sum, s) => sum + s.files.length, 0);

      wsManager.broadcast({ type: 'migration', data: record });
      wsManager.broadcast({ type: 'report-updated', data: report });
      res.json(record);
    } catch (e: any) {
      wsManager.output(`Migration error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Run build
  router.post('/api/build', async (req: Request, res: Response) => {
    try {
      wsManager.output('Starting build...');
      wsManager.broadcast({ type: 'build-start', data: null });

      const result = await stateManager.build();

      wsManager.broadcast({ type: 'build-complete', data: result });
      res.json(result);
    } catch (e: any) {
      wsManager.output(`Build error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Stop build
  router.post('/api/build/stop', (req: Request, res: Response) => {
    stateManager.stopBuild();
    res.json({ success: true });
  });

  // API: Rollback
  router.post('/api/rollback', async (req: Request, res: Response) => {
    try {
      const { migrationId } = req.body || {};
      wsManager.output(migrationId ? `Rolling back to before ${migrationId}...` : 'Rolling back last migration...');

      const result = await stateManager.rollback(migrationId);

      wsManager.output('Rollback complete. Click Analyze to refresh.');
      stateManager.setReport(null as any);

      wsManager.broadcast({ type: 'timeline-updated', data: {
        migrations: stateManager.getActiveMigrations(),
        redoStack: stateManager.getRedoStack(),
        currentCommit: stateManager.getState().currentCommit
      }});
      wsManager.broadcast({ type: 'report-updated', data: null });
      res.json({ success: true, ...result });
    } catch (e: any) {
      wsManager.output(`Rollback error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Redo
  router.post('/api/redo', async (req: Request, res: Response) => {
    try {
      const { migrationId } = req.body || {};
      wsManager.output(migrationId ? `Redoing to ${migrationId}...` : 'Redoing last migration...');

      const result = await stateManager.fastForward(migrationId);

      wsManager.output('Redo complete. Click Analyze to refresh.');
      stateManager.setReport(null as any);

      wsManager.broadcast({ type: 'timeline-updated', data: {
        migrations: stateManager.getActiveMigrations(),
        redoStack: stateManager.getRedoStack(),
        currentCommit: stateManager.getState().currentCommit
      }});
      wsManager.broadcast({ type: 'report-updated', data: null });
      res.json({ success: true, ...result });
    } catch (e: any) {
      wsManager.output(`Redo error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get migration timeline
  router.get('/api/migrations', (req: Request, res: Response) => {
    res.json({
      all: stateManager.getState().migrations,
      active: stateManager.getActiveMigrations(),
      redoStack: stateManager.getRedoStack(),
      currentCommit: stateManager.getState().currentCommit
    });
  });

  // API: Get errors formatted for clipboard
  router.get('/api/errors', (req: Request, res: Response) => {
    res.json({ errors: stateManager.getErrorsForClaude() });
  });

  // API: Discovery - find all file types
  router.post('/api/discover/filetypes', (req: Request, res: Response) => {
    try {
      const config = stateManager.getConfig();
      if (!config) {
        return res.status(400).json({ error: 'No config set. Configure project path first.' });
      }

      const { subPath } = req.body;
      const basePath = subPath
        ? path.join(config.projectPath, subPath)
        : config.projectPath;

      if (!fs.existsSync(basePath)) {
        return res.status(400).json({ error: `Path does not exist: ${basePath}` });
      }

      const { totalFiles, extensions } = discoverFileTypes(basePath);

      res.json({
        scannedPath: basePath,
        totalFiles,
        extensions,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Open files in VS Code
  router.post('/api/open-vscode', (req: Request, res: Response) => {
    try {
      const config = stateManager.getConfig();
      if (!config) {
        return res.status(400).json({ error: 'No config set' });
      }

      const { files, mode } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files specified' });
      }

      // Resolve files to absolute paths (they come as relative paths like src/app/foo.ts)
      const projectPath = path.resolve(config.projectPath);
      const absolutePaths = files.map((f: string) => {
        // Files are relative to the restaurant branch
        return path.join(projectPath, 'apps', 'restaurant', f);
      });

      // Open in VS Code with -n flag for new window
      const args = ['-n', ...absolutePaths];
      const child = spawn('code', args, {
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      child.unref();

      res.json({ success: true, opened: absolutePaths.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ Clustering Routes ============

  // API: Run clustering
  router.post('/api/cluster', async (req: Request, res: Response) => {
    try {
      const { resolution, topologicalWeight } = req.body || {};

      wsManager.output('Starting clustering...');

      const clusters = await runClusteringWithProgress(
        stateManager,
        wsManager,
        { resolution, topologicalWeight }
      );

      res.json(clusters);
    } catch (e: any) {
      wsManager.output(`Clustering error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  // API: Get current cluster state
  router.get('/api/clusters', (req: Request, res: Response) => {
    res.json(stateManager.getClusters());
  });

  // API: Rename a cluster
  router.patch('/api/cluster/:id/name', (req: Request, res: Response) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const clusterId = parseInt(idParam, 10);
      const { name } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Name is required' });
      }

      const success = stateManager.renameCluster(clusterId, name);
      if (!success) {
        return res.status(404).json({ error: 'Cluster not found' });
      }

      wsManager.broadcast({
        type: 'cluster-renamed',
        data: { id: clusterId, name },
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API: Move file between clusters
  router.post('/api/cluster/move', (req: Request, res: Response) => {
    try {
      const { file, fromClusterId, toClusterId } = req.body;

      if (!file || typeof file !== 'string') {
        return res.status(400).json({ error: 'File path is required' });
      }

      // null means unassigned
      const from = fromClusterId === 'unassigned' ? null : parseInt(fromClusterId, 10);
      const to = toClusterId === 'unassigned' ? null : parseInt(toClusterId, 10);

      const success = stateManager.moveFile(file, from, to);
      if (!success) {
        return res.status(400).json({ error: 'Failed to move file' });
      }

      wsManager.broadcast({
        type: 'cluster-file-moved',
        data: { file, from: fromClusterId, to: toClusterId },
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Serve the interactive HTML report
  router.get('/', (req: Request, res: Response) => {
    const report = stateManager.getReport();
    const config = stateManager.getConfig();
    const clusters = stateManager.getClusters();
    const html = generateInteractiveHtml(report, config, clusters);
    res.type('html').send(html);
  });

  // API: Analyze git history for commit-based clustering
  router.post('/api/git-analyze', (req: Request, res: Response) => {
    try {
      const config = stateManager.getConfig();
      if (!config) {
        return res.status(400).json({ error: 'No config set' });
      }

      const {
        branchA = 'origin/master',
        branchB = 'origin/retail-master',
        filterPath = 'apps/app/src',
        commitLimit = 500,
      } = req.body;

      wsManager.output(`Analyzing git history: ${branchA} vs ${branchB}...`);
      wsManager.output(`Filter path: ${filterPath}, Limit: ${commitLimit} commits`);

      const result = analyzeGitHistory(
        config.projectPath,
        branchA,
        branchB,
        filterPath,
        commitLimit
      );

      wsManager.output(`Found ${result.branchA.totalCommits} commits on ${branchA}`);
      wsManager.output(`Found ${result.branchB.totalCommits} commits on ${branchB}`);
      wsManager.output(`${result.conflicts.length} files touched by both branches`);
      wsManager.output(`${result.branchA.clusters.length} clusters on ${branchA}`);
      wsManager.output(`${result.branchB.clusters.length} clusters on ${branchB}`);

      res.json(result);
    } catch (e: any) {
      wsManager.output(`Git analysis failed: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
