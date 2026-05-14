/**
 * Standalone Clustering Test
 *
 * Directly tests the clustering algorithm against the 80-file test dataset.
 * Run with: npx ts-node scripts/standalone-cluster-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { clusterWithCombinedSimilarity } from '../src/clustering/combined-clustering';
import { DependencyGraph } from '../src/deps/graph';

const BASE = path.join(__dirname, '../test-cluster-data/src/app');

// Expected clusters (ground truth)
const EXPECTED: Record<string, string[]> = {
  auth: ['auth/auth.service.ts', 'auth/auth.guard.ts', 'auth/auth.interceptor.ts', 'auth/token.service.ts', 'auth/auth.config.ts', 'auth/auth.state.ts', 'auth/auth.models.ts', 'auth/login.component.ts', 'auth/logout.component.ts', 'auth/auth.module.ts'],
  user: ['user/user.service.ts', 'user/user.models.ts', 'user/user.state.ts', 'user/user.api.ts', 'user/user-profile.component.ts', 'user/user-settings.component.ts', 'user/user-list.component.ts', 'user/user-avatar.component.ts', 'user/user-search.component.ts', 'user/user.module.ts'],
  product: ['product/product.service.ts', 'product/product.models.ts', 'product/product.api.ts', 'product/product.state.ts', 'product/product-list.component.ts', 'product/product-detail.component.ts', 'product/product-card.component.ts', 'product/product-filter.component.ts', 'product/product-search.component.ts', 'product/product.module.ts'],
  cart: ['cart/cart.service.ts', 'cart/cart.models.ts', 'cart/cart.state.ts', 'cart/cart.api.ts', 'cart/cart.component.ts', 'cart/cart-item.component.ts', 'cart/cart-summary.component.ts', 'cart/cart-icon.component.ts', 'cart/cart-promo.component.ts', 'cart/cart.module.ts'],
  order: ['order/order.service.ts', 'order/order.models.ts', 'order/order.api.ts', 'order/order.state.ts', 'order/order-list.component.ts', 'order/order-detail.component.ts', 'order/order-status.component.ts', 'order/order-tracking.component.ts', 'order/order-invoice.component.ts', 'order/order.module.ts'],
  ui: ['ui/button.component.ts', 'ui/input.component.ts', 'ui/modal.component.ts', 'ui/dropdown.component.ts', 'ui/table.component.ts', 'ui/pagination.component.ts', 'ui/tooltip.directive.ts', 'ui/loading.component.ts', 'ui/alert.component.ts', 'ui/ui.module.ts'],
  utils: ['utils/date.utils.ts', 'utils/date-helpers.ts', 'utils/string.utils.ts', 'utils/number.utils.ts', 'utils/array.utils.ts', 'utils/validation.utils.ts', 'utils/storage.utils.ts', 'utils/http.utils.ts', 'utils/object.utils.ts', 'utils/index.ts'],
  isolated: ['isolated/standalone-helper.ts', 'isolated/constants.ts', 'isolated/types.ts', 'isolated/regex-patterns.ts', 'isolated/error-codes.ts', 'isolated/math-helpers.ts', 'isolated/color-utils.ts', 'isolated/crypto-utils.ts', 'isolated/env-config.ts', 'isolated/animations.ts'],
};

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
function buildFileData(): { files: string[], contents: Map<string, string>, deps: Map<string, string[]> } {
  const files: string[] = [];
  const contents = new Map<string, string>();
  const deps = new Map<string, string[]>();

  const dirs = ['auth', 'user', 'product', 'cart', 'order', 'ui', 'utils', 'isolated'];

  for (const dir of dirs) {
    const dirPath = path.join(BASE, dir);
    if (!fs.existsSync(dirPath)) continue;

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.ts')) continue;

      const relPath = `${dir}/${file}`;
      const fullPath = path.join(BASE, relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      files.push(relPath);
      contents.set(relPath, content);

      // Parse and resolve dependencies
      const imports = parseImports(content);
      const resolvedDeps = imports
        .map(imp => resolveImport(relPath, imp))
        .filter(dep => fs.existsSync(path.join(BASE, dep)));

      deps.set(relPath, resolvedDeps);
    }
  }

  return { files, contents, deps };
}

// Create mock DependencyGraph
function createMockDepGraph(deps: Map<string, string[]>): DependencyGraph {
  const reverseDeps = new Map<string, string[]>();

  // Build reverse dependency map
  for (const [file, fileDeps] of deps) {
    for (const dep of fileDeps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, []);
      }
      reverseDeps.get(dep)!.push(file);
    }
  }

  return {
    getFiles: () => Array.from(deps.keys()),
    getAnalysis: (absPath: string) => {
      const relPath = absPath.replace(BASE + '/', '');
      if (!deps.has(relPath)) return null;
      return {
        relativePath: relPath,
        absolutePath: absPath,
        dependencies: (deps.get(relPath) || []).map(d => ({
          target: BASE + '/' + d,
          source: absPath,
        })),
      };
    },
    getDependents: (absPath: string) => {
      const relPath = absPath.replace(BASE + '/', '');
      const sources = reverseDeps.get(relPath) || [];
      return sources.map(s => ({
        source: BASE + '/' + s,
        target: absPath,
      }));
    },
  } as unknown as DependencyGraph;
}

// Evaluate clustering results
function evaluate(packages: { files: string[] }[], isolatedFiles: string[]) {
  console.log('\n' + '='.repeat(60));
  console.log('CLUSTERING EVALUATION');
  console.log('='.repeat(60) + '\n');

  let totalCorrect = 0;

  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i];
    let bestDomain: string | null = null;
    let bestOverlap = 0;

    for (const [domain, expectedFiles] of Object.entries(EXPECTED)) {
      if (domain === 'isolated') continue;
      const overlap = pkg.files.filter(f => expectedFiles.includes(f)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestDomain = domain;
      }
    }

    const precision = pkg.files.length > 0 ? bestOverlap / pkg.files.length : 0;
    const recall = bestDomain ? bestOverlap / EXPECTED[bestDomain].length : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    console.log(`📦 Cluster ${i + 1} (${pkg.files.length} files):`);
    console.log(`   Best match: ${bestDomain || 'none'} (${bestOverlap}/${bestDomain ? EXPECTED[bestDomain].length : 0})`);
    console.log(`   P: ${(precision * 100).toFixed(0)}% | R: ${(recall * 100).toFixed(0)}% | F1: ${(f1 * 100).toFixed(0)}%`);

    if (bestDomain) {
      const wrong = pkg.files.filter(f => !EXPECTED[bestDomain!].includes(f));
      if (wrong.length > 0 && wrong.length <= 3) {
        console.log(`   ⚠️  Wrong: ${wrong.map(f => path.basename(f)).join(', ')}`);
      }
    }
    console.log();

    totalCorrect += bestOverlap;
  }

  // Check isolated
  const isolatedCorrect = isolatedFiles.filter(f => EXPECTED.isolated.includes(f)).length;
  console.log(`📭 Unassigned: ${isolatedFiles.length} files`);
  console.log(`   Isolated correct: ${isolatedCorrect}/10`);

  // Summary
  const accuracy = totalCorrect / 70;
  const isolatedAccuracy = isolatedCorrect / 10;
  const score = accuracy * 0.8 + isolatedAccuracy * 0.2;

  console.log('\n' + '='.repeat(60));
  console.log(`Clusters: ${packages.length} | Accuracy: ${(accuracy * 100).toFixed(1)}% | Isolated: ${(isolatedAccuracy * 100).toFixed(1)}%`);
  console.log(`Overall Score: ${(score * 100).toFixed(1)}%`);
  console.log('='.repeat(60) + '\n');

  return score;
}

// Main
async function main() {
  console.log('Building test data...');
  const { files, contents, deps } = buildFileData();
  console.log(`Found ${files.length} files\n`);

  // Count files with/without deps
  const withDeps = files.filter(f => (deps.get(f)?.length || 0) > 0).length;
  console.log(`Files with dependencies: ${withDeps}`);
  console.log(`Files without dependencies: ${files.length - withDeps}\n`);

  // Create mock graph
  const depGraph = createMockDepGraph(deps);

  // Test different parameter combinations
  // Format: { resolution, topo, content, path, directDep }
  const tests = [
    // Original approach (no path)
    { resolution: 0.8, topo: 0.7, content: 0.3, path: 0.0, directDep: 0.0, name: 'Original (topo+content)' },
    // Path-enhanced
    { resolution: 0.8, topo: 0.5, content: 0.2, path: 0.3, directDep: 0.2, name: 'Balanced with path' },
    { resolution: 1.0, topo: 0.4, content: 0.2, path: 0.4, directDep: 0.2, name: 'Path emphasis' },
    { resolution: 0.8, topo: 0.3, content: 0.1, path: 0.6, directDep: 0.2, name: 'Path-heavy' },
    { resolution: 1.0, topo: 0.6, content: 0.1, path: 0.3, directDep: 0.3, name: 'Topo + direct boost' },
    // Extreme path
    { resolution: 0.6, topo: 0.2, content: 0.0, path: 0.8, directDep: 0.3, name: 'Path dominant' },
    { resolution: 1.0, topo: 0.5, content: 0.0, path: 0.5, directDep: 0.3, name: 'Topo+Path no content' },
  ];

  let bestScore = 0;
  let bestConfig = '';

  for (const params of tests) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`Testing: ${params.name}`);
    console.log(`  resolution=${params.resolution}, topo=${params.topo}, content=${params.content}, path=${params.path}, directDep=${params.directDep}`);
    console.log(`${'#'.repeat(60)}`);

    const result = clusterWithCombinedSimilarity(
      depGraph,
      files,
      contents,
      {
        resolution: params.resolution,
        topologicalWeight: params.topo,
        contentWeight: params.content,
        pathWeight: params.path,
        directDepBoost: params.directDep,
        autoTune: false,
      }
    );

    console.log(`Created ${result.packages.length} clusters, ${result.isolatedFiles.length} isolated`);
    console.log(`Modularity: ${result.modularity}`);

    // Filter to multi-file packages
    const realPackages = result.packages.filter(p => p.files.length > 1);
    const singletons = result.packages.filter(p => p.files.length === 1).flatMap(p => p.files);
    const unassigned = [...new Set([...result.isolatedFiles, ...singletons])];

    const score = evaluate(realPackages, unassigned);

    if (score > bestScore) {
      bestScore = score;
      bestConfig = params.name;
    }
  }

  console.log('\n' + '🏆'.repeat(30));
  console.log(`BEST CONFIG: ${bestConfig} with score ${(bestScore * 100).toFixed(1)}%`);
  console.log('🏆'.repeat(30) + '\n');
}

main().catch(console.error);
