#!/usr/bin/env node
/**
 * Interactive Consolidation Server
 *
 * Serves the HTML report with live migration/build/rollback controls
 *
 * Usage: consolidate serve --port 3000 --project /path/to/webpos
 */

import * as http from 'http';
import * as path from 'path';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { stateManager, ServerConfig } from './state';
import { GraphBuilder } from '../deps';
import { ReportAnalyzer } from '../report';
import { generateInteractiveHtml } from './html';

const app = express();
app.use(express.json());

// Store WebSocket clients
const wsClients = new Set<WebSocket>();

// API: Get current state
app.get('/api/state', (req: Request, res: Response) => {
  res.json(stateManager.getState());
});

// API: Get/Set config
app.get('/api/config', (req: Request, res: Response) => {
  res.json(stateManager.getConfig());
});

app.post('/api/config', (req: Request, res: Response) => {
  try {
    const config: ServerConfig = req.body;
    stateManager.saveConfig(config);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// API: Run analysis
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const config = stateManager.getConfig();
    if (!config) {
      return res.status(400).json({ error: 'No config set. Configure project path first.' });
    }

    broadcast({ type: 'output', data: 'Starting analysis...' });

    // Build dependency graph
    const builder = GraphBuilder.fromTsconfig(config.tsconfigPath);
    const srcPath = path.join(config.projectPath, 'apps/restaurant/src');

    broadcast({ type: 'output', data: `Scanning ${srcPath}...` });

    const graph = await builder.build(srcPath, {
      include: ['**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
    });

    const stats = graph.getStats();
    broadcast({ type: 'output', data: `Found ${stats.totalFiles} files, ${stats.totalEdges} dependencies` });

    // Create file matches (for now, treat all as clean - real comparison would diff branches)
    const files = graph.getFiles();
    const fileMatches = files.map(filePath => {
      const analysis = graph.getAnalysis(filePath);
      const relativePath = analysis?.relativePath || filePath;

      const dependencies = (analysis?.dependencies || [])
        .filter(d => !d.target.startsWith('external:') && !d.target.startsWith('unresolved:'))
        .map(d => graph.getAnalysis(d.target)?.relativePath || d.target)
        .filter((p, i, arr) => arr.indexOf(p) === i);

      const dependents = graph.getDependents(filePath)
        .map(d => graph.getAnalysis(d.source)?.relativePath || d.source)
        .filter((p, i, arr) => arr.indexOf(p) === i);

      return {
        relativePath,
        retailPath: filePath,
        restaurantPath: filePath,
        status: 'clean' as const,
        diff: { status: 'identical' as const },
        isCleanSubtree: false,
        dependencies,
        dependents,
      };
    });

    // Analyze
    const analyzer = new ReportAnalyzer();
    const report = analyzer.analyze(fileMatches);

    stateManager.setReport(report);

    broadcast({ type: 'output', data: `Analysis complete: ${report.cleanSubtrees.length} clean subtrees found` });
    broadcast({ type: 'report', data: report });

    res.json(report);
  } catch (e: any) {
    broadcast({ type: 'output', data: `Error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Get report
app.get('/api/report', (req: Request, res: Response) => {
  const report = stateManager.getReport();
  if (!report) {
    return res.status(404).json({ error: 'No report available. Run analysis first.' });
  }
  res.json(report);
});

// API: Migrate a subtree
app.post('/api/migrate', async (req: Request, res: Response) => {
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

    broadcast({ type: 'output', data: `Migrating subtree: ${subtree.rootPath}` });
    broadcast({ type: 'output', data: `Files to move: ${subtree.files.length}` });

    const record = await stateManager.migrate(subtree);

    broadcast({ type: 'migration', data: record });
    res.json(record);
  } catch (e: any) {
    broadcast({ type: 'output', data: `Migration error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Run build
app.post('/api/build', async (req: Request, res: Response) => {
  try {
    broadcast({ type: 'output', data: 'Starting build...' });
    broadcast({ type: 'build-start', data: null });

    const result = await stateManager.build();

    broadcast({ type: 'build-complete', data: result });
    res.json(result);
  } catch (e: any) {
    broadcast({ type: 'output', data: `Build error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Stop build
app.post('/api/build/stop', (req: Request, res: Response) => {
  stateManager.stopBuild();
  res.json({ success: true });
});

// API: Rollback
app.post('/api/rollback', async (req: Request, res: Response) => {
  try {
    broadcast({ type: 'output', data: 'Rolling back...' });

    await stateManager.rollback();

    broadcast({ type: 'rollback', data: null });
    res.json({ success: true });
  } catch (e: any) {
    broadcast({ type: 'output', data: `Rollback error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Get errors formatted for Claude
app.get('/api/errors', (req: Request, res: Response) => {
  res.json({ errors: stateManager.getErrorsForClaude() });
});

// Serve the interactive HTML report
app.get('/', (req: Request, res: Response) => {
  const report = stateManager.getReport();
  const config = stateManager.getConfig();
  const html = generateInteractiveHtml(report, config);
  res.type('html').send(html);
});

// Broadcast to all WebSocket clients
function broadcast(message: { type: string; data: any }): void {
  const json = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

// Subscribe state manager to broadcast output
stateManager.onBuildOutput((line) => {
  broadcast({ type: 'output', data: line });
});

export function startServer(port: number = 3000): void {
  const server = http.createServer(app);

  // WebSocket server for live updates
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    wsClients.add(ws);

    // Send current state
    ws.send(JSON.stringify({
      type: 'init',
      data: stateManager.getState(),
    }));

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('Client disconnected');
    });
  });

  server.listen(port, () => {
    console.log(`
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   WebPOS Consolidator Server                                   │
│                                                                │
│   Running at: http://localhost:${port}                          │
│                                                                │
│   Open this URL in your browser to access the interactive      │
│   consolidation dashboard.                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
`);
  });
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  let port = 3000;
  let projectPath: string | undefined;
  let buildCommand = 'nx build restaurant';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[++i], 10);
    } else if (args[i] === '--project') {
      projectPath = args[++i];
    } else if (args[i] === '--build-command') {
      buildCommand = args[++i];
    }
  }

  // If project path provided, save config
  if (projectPath) {
    stateManager.saveConfig({
      projectPath,
      retailBranch: 'retail',
      restaurantBranch: 'restaurant',
      sharedPath: 'libs/shared',
      tsconfigPath: path.join(projectPath, 'apps/restaurant/tsconfig.app.json'),
      buildCommand,
    });
  }

  startServer(port);
}
