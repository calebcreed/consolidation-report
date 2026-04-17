#!/usr/bin/env node
/**
 * Interactive Consolidation Server
 *
 * Serves the HTML report with live migration/build/rollback controls
 *
 * Usage: consolidate serve --port 3000 --project /path/to/branch
 */

import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createTwoFilesPatch } from 'diff';
import { stateManager, ServerConfig } from './state';
import { GraphBuilder } from '../deps';
import { ReportAnalyzer, FileMatch, FileStatus } from '../report';
import { SemanticComparator } from '../diff/comparator';
import { DiffResult } from '../diff/types';
import { generateInteractiveHtml } from './html';

// Singleton comparator instance
const semanticComparator = new SemanticComparator();

/**
 * Compare two files using AST-based semantic comparison
 *
 * Returns:
 * - identical: Exact same content
 * - clean: Only non-semantic differences (whitespace, comments, import order)
 * - conflict: Real semantic differences
 * - retail-only / restaurant-only: File exists in only one branch
 */
/**
 * Count changed lines in a unified diff (lines starting with + or -)
 */
function countChangedLines(unifiedDiff: string): number {
  let count = 0;
  const lines = unifiedDiff.split('\n');
  for (const line of lines) {
    // Skip headers (---, +++, @@)
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      continue;
    }
    // Count added and removed lines
    if (line.startsWith('+') || line.startsWith('-')) {
      count++;
    }
  }
  return count;
}

function compareFiles(
  retailPath: string | null,
  restaurantPath: string | null,
  relativePath: string
): { status: FileStatus; diff: DiffResult; unifiedDiff: string; linesChanged: number } {
  // One-sided cases
  if (!retailPath || !fs.existsSync(retailPath)) {
    const restaurantContent = fs.readFileSync(restaurantPath!, 'utf-8');
    const unifiedDiff = createTwoFilesPatch(
      `retail/${relativePath}`,
      `restaurant/${relativePath}`,
      '',
      restaurantContent,
      'does not exist',
      ''
    );
    return {
      status: 'restaurant-only',
      diff: { status: 'dirty', changes: [] },
      unifiedDiff,
      linesChanged: restaurantContent.split('\n').length
    };
  }
  if (!restaurantPath || !fs.existsSync(restaurantPath)) {
    const retailContent = fs.readFileSync(retailPath, 'utf-8');
    const unifiedDiff = createTwoFilesPatch(
      `retail/${relativePath}`,
      `restaurant/${relativePath}`,
      retailContent,
      '',
      '',
      'does not exist'
    );
    return {
      status: 'retail-only',
      diff: { status: 'dirty', changes: [] },
      unifiedDiff,
      linesChanged: retailContent.split('\n').length
    };
  }

  // Both exist - use semantic comparison
  const diffResult = semanticComparator.compare(retailPath, restaurantPath);

  // Generate unified diff
  const retailContent = fs.readFileSync(retailPath, 'utf-8');
  const restaurantContent = fs.readFileSync(restaurantPath, 'utf-8');
  const unifiedDiff = createTwoFilesPatch(
    `retail/${relativePath}`,
    `restaurant/${relativePath}`,
    retailContent,
    restaurantContent,
    '',
    ''
  );

  // Count actual changed lines
  const linesChanged = countChangedLines(unifiedDiff);

  // Map diff result to file status
  let status: FileStatus;
  switch (diffResult.status) {
    case 'identical':
    case 'clean':
      // Both identical and clean (whitespace/comments/import-order only) are treated as clean
      status = 'clean';
      break;
    case 'dirty':
      // Real semantic differences = conflict
      status = 'conflict';
      break;
    case 'structural':
      // Structural change (moved, renamed) - treat as conflict for now
      status = 'conflict';
      break;
    default:
      status = 'conflict';
  }

  return { status, diff: diffResult, unifiedDiff, linesChanged };
}

/**
 * Scan a directory recursively for TypeScript files
 * Returns paths relative to appDir (e.g., apps/restaurant/) so paths are like "src/app/foo.ts"
 */
function scanDirectory(srcDir: string, appDir: string): Map<string, string> {
  const files = new Map<string, string>();

  function scan(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        // Relative to appDir so we get "src/app/foo.ts" format
        const relativePath = path.relative(appDir, fullPath);
        files.set(relativePath, fullPath);
      }
    }
  }

  scan(srcDir);
  return files;
}

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

    // Resolve project path to absolute (critical for graph lookups)
    const projectPath = path.resolve(config.projectPath);

    // Scan both retail and restaurant directories
    const retailAppDir = path.join(projectPath, 'apps/retail');
    const restaurantAppDir = path.join(projectPath, 'apps/restaurant');
    const retailSrcDir = path.join(retailAppDir, 'src');
    const restaurantSrcDir = path.join(restaurantAppDir, 'src');

    broadcast({ type: 'output', data: `Scanning retail: ${retailSrcDir}` });
    const retailFiles = scanDirectory(retailSrcDir, retailAppDir);
    broadcast({ type: 'output', data: `  Found ${retailFiles.size} files in retail` });

    broadcast({ type: 'output', data: `Scanning restaurant: ${restaurantSrcDir}` });
    const restaurantFiles = scanDirectory(restaurantSrcDir, restaurantAppDir);
    broadcast({ type: 'output', data: `  Found ${restaurantFiles.size} files in restaurant` });

    // Build dependency graph from restaurant (primary branch)
    broadcast({ type: 'output', data: `Building dependency graph (this may take a few minutes on large projects)...` });
    const graphStartTime = Date.now();
    const builder = GraphBuilder.fromTsconfig(config.tsconfigPath);
    const graph = await builder.build(restaurantSrcDir, {
      include: ['**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
    });

    const graphTime = ((Date.now() - graphStartTime) / 1000).toFixed(1);
    const graphStats = graph.getStats();
    broadcast({ type: 'output', data: `Built dependency graph in ${graphTime}s: ${graphStats.totalFiles} files, ${graphStats.totalEdges} dependencies` });

    // Collect all unique relative paths from both branches
    const allPaths = new Set<string>();
    for (const rp of retailFiles.keys()) allPaths.add(rp);
    for (const rp of restaurantFiles.keys()) allPaths.add(rp);

    const totalFiles = allPaths.size;
    broadcast({ type: 'output', data: `Comparing ${totalFiles} unique files...` });

    // Create file matches with real comparison
    const fileMatches: FileMatch[] = [];
    let cleanCount = 0, conflictCount = 0, retailOnlyCount = 0, restaurantOnlyCount = 0;
    let processed = 0;
    const progressInterval = Math.max(1, Math.floor(totalFiles / 20)); // Update ~20 times

    for (const relativePath of allPaths) {
      const retailPath = retailFiles.get(relativePath) || null;
      const restaurantPath = restaurantFiles.get(relativePath) || null;

      // Compare files
      const { status, diff, unifiedDiff, linesChanged } = compareFiles(retailPath, restaurantPath, relativePath);

      // Track stats
      if (status === 'clean') cleanCount++;
      else if (status === 'conflict') conflictCount++;
      else if (status === 'retail-only') retailOnlyCount++;
      else if (status === 'restaurant-only') restaurantOnlyCount++;

      // Progress update
      processed++;
      if (processed % progressInterval === 0 || processed === totalFiles) {
        const pct = Math.round((processed / totalFiles) * 100);
        broadcast({ type: 'output', data: `Comparing files: ${processed}/${totalFiles} (${pct}%) - ${cleanCount} clean, ${conflictCount} conflicts` });
      }

      // Get dependencies from graph (if file exists in restaurant)
      const graphPath = restaurantPath || retailPath;
      const analysis = graphPath ? graph.getAnalysis(graphPath) : null;

      const dependencies = (analysis?.dependencies || [])
        .filter(d =>
          !d.target.startsWith('external:') &&
          !d.target.startsWith('unresolved:') &&
          !d.target.startsWith('symbol:') &&
          !d.target.startsWith('ngrx-')
        )
        .map(d => graph.getAnalysis(d.target)?.relativePath)
        .filter((p): p is string => p !== undefined)
        .filter((p, i, arr) => arr.indexOf(p) === i);

      const dependents = graphPath
        ? graph.getDependents(graphPath)
            .filter(d =>
              !d.source.startsWith('external:') &&
              !d.source.startsWith('unresolved:') &&
              !d.source.startsWith('symbol:') &&
              !d.source.startsWith('ngrx-')
            )
            .map(d => graph.getAnalysis(d.source)?.relativePath)
            .filter((p): p is string => p !== undefined)
            .filter((p, i, arr) => arr.indexOf(p) === i)
        : [];

      fileMatches.push({
        relativePath,
        retailPath,
        restaurantPath,
        status,
        diff,
        unifiedDiff,
        linesChanged,
        isCleanSubtree: false,
        dependencies,
        dependents,
      });
    }

    broadcast({ type: 'output', data: `Comparison: ${cleanCount} clean, ${conflictCount} conflicts, ${retailOnlyCount} retail-only, ${restaurantOnlyCount} restaurant-only` });

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

    // Remove migrated subtree from report
    report.cleanSubtrees.splice(subtreeIndex, 1);

    // Mark migrated files in the report
    const migratedSet = new Set(subtree.files);
    report.files = report.files.filter(f => !migratedSet.has(f.relativePath));
    report.stats.totalFiles = report.files.length;
    report.stats.immediatelyMovable = report.cleanSubtrees.reduce((sum, s) => sum + s.files.length, 0);

    broadcast({ type: 'migration', data: record });
    console.log('Broadcasting report-updated with', report.cleanSubtrees.length, 'subtrees remaining');
    broadcast({ type: 'report-updated', data: report });
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

// API: Rollback to a specific migration (or last one if no ID provided)
app.post('/api/rollback', async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.body || {};
    broadcast({ type: 'output', data: migrationId ? `Rolling back to before ${migrationId}...` : 'Rolling back last migration...' });

    const result = await stateManager.rollback(migrationId);

    // Clear the report - user should re-analyze
    broadcast({ type: 'output', data: 'Rollback complete. Click Analyze to refresh.' });
    stateManager.setReport(null as any);

    broadcast({ type: 'timeline-updated', data: {
      migrations: stateManager.getActiveMigrations(),
      redoStack: stateManager.getRedoStack(),
      currentCommit: stateManager.getState().currentCommit
    }});
    broadcast({ type: 'report-updated', data: null });
    res.json({ success: true, ...result });
  } catch (e: any) {
    broadcast({ type: 'output', data: `Rollback error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Redo (fast-forward) to a migration
app.post('/api/redo', async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.body || {};
    broadcast({ type: 'output', data: migrationId ? `Redoing to ${migrationId}...` : 'Redoing last migration...' });

    const result = await stateManager.fastForward(migrationId);

    broadcast({ type: 'output', data: 'Redo complete. Click Analyze to refresh.' });
    stateManager.setReport(null as any);

    broadcast({ type: 'timeline-updated', data: {
      migrations: stateManager.getActiveMigrations(),
      redoStack: stateManager.getRedoStack(),
      currentCommit: stateManager.getState().currentCommit
    }});
    broadcast({ type: 'report-updated', data: null });
    res.json({ success: true, ...result });
  } catch (e: any) {
    broadcast({ type: 'output', data: `Redo error: ${e.message}` });
    res.status(500).json({ error: e.message });
  }
});

// API: Get migration timeline
app.get('/api/migrations', (req: Request, res: Response) => {
  res.json({
    all: stateManager.getState().migrations,
    active: stateManager.getActiveMigrations(),
    redoStack: stateManager.getRedoStack(),
    currentCommit: stateManager.getState().currentCommit
  });
});

// API: Get errors formatted for clipboard
app.get('/api/errors', (req: Request, res: Response) => {
  res.json({ errors: stateManager.getErrorsForClaude() });
});

// API: Discovery - find all file types in a directory
app.post('/api/discover/filetypes', (req: Request, res: Response) => {
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

    // Scan recursively for all files
    const extensionMap = new Map<string, { count: number; samples: string[] }>();
    let totalFiles = 0;

    function scanDir(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip node_modules, .git, dist, etc.
            if (!['node_modules', '.git', 'dist', 'build', '.cache', '.nx'].includes(entry.name)) {
              scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            totalFiles++;
            const ext = path.extname(entry.name).toLowerCase() || '(no extension)';
            const relativePath = path.relative(basePath, fullPath);

            if (!extensionMap.has(ext)) {
              extensionMap.set(ext, { count: 0, samples: [] });
            }
            const data = extensionMap.get(ext)!;
            data.count++;
            if (data.samples.length < 5) {
              data.samples.push(relativePath);
            }
          }
        }
      } catch (e) {
        // Skip directories we can't read
      }
    }

    scanDir(basePath);

    const extensions = Array.from(extensionMap.entries()).map(([ext, data]) => ({
      extension: ext,
      count: data.count,
      samples: data.samples,
    }));

    res.json({
      scannedPath: basePath,
      totalFiles,
      extensions,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
│   Branch Consolidator Server                                   │
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
