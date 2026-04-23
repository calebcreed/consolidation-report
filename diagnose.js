#!/usr/bin/env node
/**
 * Diagnostic script to debug path resolution issues
 * Run from your project directory: node diagnose.js
 */

const path = require('path');
const fs = require('fs');
const { GraphBuilder } = require('./dist/deps');

// Load config
const configPath = path.join(process.cwd(), '.consolidator-config.json');
if (!fs.existsSync(configPath)) {
  console.error('No .consolidator-config.json found in current directory');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

console.log('=== PATH DIAGNOSTIC ===\n');
console.log('Current working directory:', process.cwd());
console.log('');
console.log('Config values:');
console.log('  projectPath:', config.projectPath);
console.log('  tsconfigPath:', config.tsconfigPath);
console.log('');
console.log('Resolved paths:');
console.log('  projectPath:', path.resolve(config.projectPath));
console.log('  tsconfigPath:', path.resolve(config.tsconfigPath));
console.log('');

// Check tsconfig exists
const resolvedTsconfig = path.resolve(config.tsconfigPath);
if (!fs.existsSync(resolvedTsconfig)) {
  console.error('ERROR: tsconfig not found at:', resolvedTsconfig);
  process.exit(1);
}
console.log('tsconfig exists: YES');

// Build graph
const srcDir = path.join(path.resolve(config.projectPath), 'apps/restaurant/src');
console.log('Source directory:', srcDir);
console.log('');

const builder = GraphBuilder.fromTsconfig(config.tsconfigPath);

console.log('Resolver config:');
console.log('  rootDir:', builder.resolver?.getRootDir?.() || 'N/A');
console.log('  baseUrl:', builder.resolver?.getBaseUrl?.() || 'N/A');
console.log('');

builder.build(srcDir, {
  include: ['**/*.ts'],
  exclude: ['**/*.spec.ts', '**/node_modules/**']
}).then(graph => {
  const stats = graph.getStats();
  const files = graph.getFiles();

  console.log('=== GRAPH STATS ===\n');
  console.log('Total files:', stats.totalFiles);
  console.log('Total edges:', stats.totalEdges);
  console.log('Internal deps:', stats.internalDeps);
  console.log('External deps:', stats.externalDeps);
  console.log('Unresolved:', stats.unresolvedDeps);
  console.log('');

  console.log('=== PATH FORMAT CHECK ===\n');

  // Sample node keys
  console.log('Sample node keys (first 3):');
  files.slice(0, 3).forEach(f => console.log(' ', f));
  console.log('');

  // Find a file with internal dependencies
  let foundExample = false;
  for (const file of files) {
    const deps = graph.getDependencies(file);
    const internalDeps = deps.filter(d =>
      !d.target.startsWith('external:') &&
      !d.target.startsWith('unresolved:') &&
      !d.target.startsWith('symbol:') &&
      !d.target.startsWith('ngrx-')
    );

    if (internalDeps.length > 0) {
      console.log('Example file with dependencies:');
      console.log('  Source (node key):', file);
      console.log('  Dependencies:');
      internalDeps.slice(0, 3).forEach(d => {
        const targetExists = files.includes(d.target);
        console.log('    Target:', d.target);
        console.log('    Exists in nodes:', targetExists);
        if (!targetExists) {
          console.log('    *** MISMATCH - this causes 0 edges! ***');
        }
      });
      foundExample = true;
      break;
    }
  }

  if (!foundExample) {
    console.log('No files with internal dependencies found!');
  }

  console.log('');
  console.log('=== DIAGNOSIS ===\n');

  if (stats.internalDeps === 0 && stats.totalFiles > 0) {
    console.log('PROBLEM: Files found but no internal dependencies.');
    console.log('Likely cause: Path alias resolution failing.');
    console.log('Check that tsconfig paths are being read correctly.');
  } else if (stats.totalEdges > 0 && stats.internalDeps === 0) {
    console.log('PROBLEM: Edges exist but all are external/symbolic.');
    console.log('Internal imports are not resolving to file paths.');
  } else if (stats.internalDeps > 0) {
    // Check if edges actually connect nodes
    let mismatchCount = 0;
    for (const file of files.slice(0, 50)) {
      const deps = graph.getDependencies(file);
      for (const d of deps) {
        if (!d.target.startsWith('external:') &&
            !d.target.startsWith('unresolved:') &&
            !files.includes(d.target)) {
          mismatchCount++;
        }
      }
    }
    if (mismatchCount > 0) {
      console.log('PROBLEM: Dependency targets don\'t match node keys!');
      console.log('Mismatches found:', mismatchCount, '(in first 50 files)');
      console.log('This is a path normalization bug.');
    } else {
      console.log('OK: Paths appear to be consistent.');
    }
  }

}).catch(e => {
  console.error('Error building graph:', e);
});
