/**
 * Test Leafward Clustering Algorithm
 *
 * Run with: npx ts-node scripts/test-leafward-clustering.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildLeafwardClusters, DepFile } from '../src/clustering/leafward-clustering';

const BASE = path.join(__dirname, '../test-cluster-data/src/app');

// Parse imports from TypeScript content
function parseImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }
  return imports;
}

// Resolve import path relative to file
function resolveImport(fromFile: string, importPath: string): string {
  const fromDir = path.dirname(fromFile);
  let resolved = path.join(fromDir, importPath);
  if (!resolved.endsWith('.ts')) {
    resolved += '.ts';
  }
  return resolved.replace(/\\/g, '/');
}

// Build file data from test directory
function buildTestData(): { files: Map<string, DepFile>; conflictPaths: string[]; contents: Map<string, string> } {
  const files = new Map<string, DepFile>();
  const contents = new Map<string, string>();
  const deps = new Map<string, string[]>();

  const dirs = ['auth', 'user', 'product', 'cart', 'order', 'ui', 'utils', 'isolated'];

  // First pass: read all files and parse dependencies
  for (const dir of dirs) {
    const dirPath = path.join(BASE, dir);
    if (!fs.existsSync(dirPath)) continue;

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.ts')) continue;

      const relPath = `${dir}/${file}`;
      const fullPath = path.join(BASE, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      contents.set(relPath, content);

      // Parse and resolve dependencies
      const imports = parseImports(content);
      const resolvedDeps = imports
        .map(imp => resolveImport(relPath, imp))
        .filter(dep => fs.existsSync(path.join(BASE, dep)));

      deps.set(relPath, resolvedDeps);
    }
  }

  // Build reverse dependency map
  const reverseDeps = new Map<string, string[]>();
  for (const [file, fileDeps] of deps) {
    for (const dep of fileDeps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, []);
      }
      reverseDeps.get(dep)!.push(file);
    }
  }

  // Build DepFile entries
  for (const [relPath, fileDeps] of deps) {
    files.set(relPath, {
      relativePath: relPath,
      absolutePath: path.join(BASE, relPath),
      dependencies: fileDeps,
      dependents: reverseDeps.get(relPath) || [],
      status: 'conflict',
      linesChanged: 50,
    });
  }

  return {
    files,
    conflictPaths: Array.from(deps.keys()),
    contents,
  };
}

// Main
function main() {
  console.log('Building test data...');
  const { files, conflictPaths, contents } = buildTestData();
  console.log(`Found ${conflictPaths.length} files\n`);

  // Count files by dependency characteristics
  let leaves = 0;
  let roots = 0;
  let middle = 0;

  for (const [_, file] of files) {
    const hasDeps = file.dependencies.length > 0;
    const hasDependents = file.dependents.length > 0;

    if (!hasDeps && !hasDependents) {
      // Truly isolated
    } else if (!hasDeps) {
      leaves++;
    } else if (!hasDependents) {
      roots++;
    } else {
      middle++;
    }
  }

  console.log(`Leaves (no deps, has dependents): ${leaves}`);
  console.log(`Roots (has deps, no dependents): ${roots}`);
  console.log(`Middle (has both): ${middle}`);
  console.log(`Isolated (neither): ${conflictPaths.length - leaves - roots - middle}\n`);

  // Run leafward clustering
  console.log('Running leafward clustering...\n');
  const result = buildLeafwardClusters(files, conflictPaths, contents);

  console.log(`Created ${result.packages.length} work packages\n`);

  // Show packages in order
  console.log('='.repeat(70));
  console.log('WORK PACKAGES (ordered by impact)');
  console.log('='.repeat(70) + '\n');

  for (const pkg of result.packages) {
    const depthLabel = pkg.depth === 0 ? 'LEAF' : `Layer ${pkg.depth}`;
    console.log(`#${pkg.id + 1} ${pkg.name}`);
    console.log(`   [${depthLabel}] Impact: ${pkg.impactScore.toFixed(3)} | Files: ${pkg.files.length} | Unlocks: ${pkg.unlockCount}`);
    console.log(`   Files: ${pkg.files.slice(0, 5).map(f => path.basename(f)).join(', ')}${pkg.files.length > 5 ? '...' : ''}`);
    if (pkg.unlockFiles.length > 0) {
      console.log(`   Unlocks: ${pkg.unlockFiles.map(f => path.basename(f)).join(', ')}`);
    }
    console.log();
  }

  // Summary by depth
  console.log('='.repeat(70));
  console.log('SUMMARY BY DEPTH');
  console.log('='.repeat(70) + '\n');

  const byDepth = new Map<number, typeof result.packages>();
  for (const pkg of result.packages) {
    if (!byDepth.has(pkg.depth)) {
      byDepth.set(pkg.depth, []);
    }
    byDepth.get(pkg.depth)!.push(pkg);
  }

  for (const [depth, pkgs] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
    const totalFiles = pkgs.reduce((sum, p) => sum + p.files.length, 0);
    const avgImpact = pkgs.reduce((sum, p) => sum + p.impactScore, 0) / pkgs.length;
    console.log(`Depth ${depth}: ${pkgs.length} packages, ${totalFiles} files, avg impact ${avgImpact.toFixed(3)}`);
  }
}

main();
