#!/usr/bin/env node
/**
 * CLI entry point for the consolidation server
 *
 * Usage:
 *   consolidate serve [options]
 *
 * Options:
 *   --port, -p       Port to run server on (default: 3000)
 *   --project        Path to WebPOS project
 *   --build-command  Build command (default: "nx build restaurant")
 *   --open           Open browser automatically
 */

import * as path from 'path';
import { execSync } from 'child_process';
import { startServer } from './index';
import { stateManager } from './state';

const args = process.argv.slice(2);

// Parse arguments
let port = 3000;
let projectPath: string | undefined;
let buildCommand = 'nx build restaurant';
let openBrowser = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--port' || arg === '-p') {
    port = parseInt(args[++i], 10);
  } else if (arg === '--project') {
    projectPath = args[++i];
  } else if (arg === '--build-command') {
    buildCommand = args[++i];
  } else if (arg === '--open' || arg === '-o') {
    openBrowser = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
WebPOS Consolidator - Interactive Server

Usage:
  node dist/v2/server/cli.js [options]
  consolidate serve [options]

Options:
  --port, -p <port>       Port to run server on (default: 3000)
  --project <path>        Path to WebPOS project
  --build-command <cmd>   Build command (default: "nx build restaurant")
  --open, -o              Open browser automatically
  --help, -h              Show this help message

Examples:
  # Start with default settings
  node dist/v2/server/cli.js

  # Specify project path
  node dist/v2/server/cli.js --project /home/user/webpos --port 8080 --open

  # Use custom build command
  node dist/v2/server/cli.js --build-command "ng build --configuration=production"
`);
    process.exit(0);
  }
}

// Save config if project path provided
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

// Start server
startServer(port);

// Open browser if requested
if (openBrowser) {
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    try {
      // Try different commands based on platform
      const platform = process.platform;
      if (platform === 'darwin') {
        execSync(`open "${url}"`);
      } else if (platform === 'win32') {
        execSync(`start "${url}"`);
      } else {
        execSync(`xdg-open "${url}"`);
      }
    } catch (e) {
      console.log(`Open ${url} in your browser`);
    }
  }, 500);
}
