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
import express from 'express';
import { WebSocketServer } from 'ws';
import { stateManager } from './state';
import { WebSocketManager } from './server-websocket';
import { createRoutes } from './server-routes';

export { stateManager, StateManager, ServerConfig, MigrationRecord } from './state';

const app = express();
app.use(express.json());

const wsManager = new WebSocketManager();

// Mount routes
app.use(createRoutes(stateManager, wsManager));

// Subscribe state manager to broadcast output
stateManager.onBuildOutput((line) => {
  wsManager.output(line);
});

export function startServer(port: number = 3000): void {
  const server = http.createServer(app);

  // WebSocket server for live updates
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    wsManager.addClient(ws, stateManager.getState());
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
