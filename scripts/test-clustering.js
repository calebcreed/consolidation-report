/**
 * Test clustering against the 100-file test dataset
 *
 * Runs the clustering algorithm and compares results to expected clusters.
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '../test-cluster-data/src/app');

// Expected clusters (ground truth)
const EXPECTED = {
  auth: ['auth.service.ts', 'auth.guard.ts', 'auth.interceptor.ts', 'token.service.ts', 'auth.config.ts', 'auth.state.ts', 'auth.models.ts', 'login.component.ts', 'logout.component.ts', 'auth.module.ts'],
  user: ['user.service.ts', 'user.models.ts', 'user.state.ts', 'user.api.ts', 'user-profile.component.ts', 'user-settings.component.ts', 'user-list.component.ts', 'user-avatar.component.ts', 'user-search.component.ts', 'user.module.ts'],
  product: ['product.service.ts', 'product.models.ts', 'product.api.ts', 'product.state.ts', 'product-list.component.ts', 'product-detail.component.ts', 'product-card.component.ts', 'product-filter.component.ts', 'product-search.component.ts', 'product.module.ts'],
  cart: ['cart.service.ts', 'cart.models.ts', 'cart.state.ts', 'cart.api.ts', 'cart.component.ts', 'cart-item.component.ts', 'cart-summary.component.ts', 'cart-icon.component.ts', 'cart-promo.component.ts', 'cart.module.ts'],
  order: ['order.service.ts', 'order.models.ts', 'order.api.ts', 'order.state.ts', 'order-list.component.ts', 'order-detail.component.ts', 'order-status.component.ts', 'order-tracking.component.ts', 'order-invoice.component.ts', 'order.module.ts'],
  ui: ['button.component.ts', 'input.component.ts', 'modal.component.ts', 'dropdown.component.ts', 'table.component.ts', 'pagination.component.ts', 'tooltip.directive.ts', 'loading.component.ts', 'alert.component.ts', 'ui.module.ts'],
  utils: ['date.utils.ts', 'date-helpers.ts', 'string.utils.ts', 'number.utils.ts', 'array.utils.ts', 'validation.utils.ts', 'storage.utils.ts', 'http.utils.ts', 'object.utils.ts', 'index.ts'],
  isolated: ['standalone-helper.ts', 'constants.ts', 'types.ts', 'regex-patterns.ts', 'error-codes.ts', 'math-helpers.ts', 'color-utils.ts', 'crypto-utils.ts', 'env-config.ts', 'animations.ts'],
};

// Parse imports from a TypeScript file
function parseImports(content) {
  const imports = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Only count local imports (starting with ./)
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath);
    }
  }
  return imports;
}

// Resolve import path to actual file
function resolveImport(fromFile, importPath) {
  const fromDir = path.dirname(fromFile);
  let resolved = path.join(fromDir, importPath);

  // Add .ts extension if missing
  if (!resolved.endsWith('.ts')) {
    resolved += '.ts';
  }

  return resolved;
}

// Read all files and build dependency graph
function buildFileGraph() {
  const files = [];
  const dirs = ['auth', 'user', 'product', 'cart', 'order', 'ui', 'utils', 'isolated'];

  for (const dir of dirs) {
    const dirPath = path.join(BASE, dir);
    if (!fs.existsSync(dirPath)) continue;

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.ts')) continue;

      const filePath = path.join(dir, file);
      const fullPath = path.join(BASE, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const imports = parseImports(content);

      // Resolve imports to relative paths
      const dependencies = imports.map(imp => {
        const resolved = resolveImport(filePath, imp);
        return resolved;
      }).filter(dep => {
        // Check if the dependency file exists
        const fullDep = path.join(BASE, dep);
        return fs.existsSync(fullDep);
      });

      files.push({
        relativePath: filePath,
        content,
        dependencies,
        status: 'conflict', // Mark all as conflict for clustering
      });
    }
  }

  return files;
}

// Create mock report for the clustering API
function createMockReport(files) {
  return {
    files,
    stats: {
      totalFiles: files.length,
    },
    cleanSubtrees: [],
    bottlenecks: [],
  };
}

// Evaluate clustering results
function evaluateClusters(result, expected) {
  const scores = {};
  let totalCorrect = 0;
  let totalFiles = 0;

  console.log('\n=== CLUSTERING EVALUATION ===\n');

  // For each actual cluster, find the best matching expected cluster
  for (const pkg of result.packages) {
    const clusterFiles = pkg.files.map(f => path.basename(f));
    let bestMatch = null;
    let bestScore = 0;

    for (const [domain, expectedFiles] of Object.entries(expected)) {
      const overlap = clusterFiles.filter(f => expectedFiles.includes(f)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestMatch = domain;
      }
    }

    const precision = bestScore / clusterFiles.length;
    const recall = bestScore / (expected[bestMatch]?.length || 1);
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;

    console.log(`Cluster "${pkg.name}" (${pkg.files.length} files):`);
    console.log(`  Best match: ${bestMatch} (${bestScore}/${expected[bestMatch]?.length || 0} files)`);
    console.log(`  Precision: ${(precision * 100).toFixed(1)}%, Recall: ${(recall * 100).toFixed(1)}%, F1: ${(f1 * 100).toFixed(1)}%`);
    console.log(`  Files: ${clusterFiles.slice(0, 5).join(', ')}${clusterFiles.length > 5 ? '...' : ''}`);
    console.log();

    totalCorrect += bestScore;
    totalFiles += clusterFiles.length;
    scores[pkg.name] = { match: bestMatch, precision, recall, f1 };
  }

  // Check unassigned (should be isolated files)
  const unassignedFiles = result.unassignedFiles.map(f => path.basename(f));
  const isolatedCorrect = unassignedFiles.filter(f => expected.isolated.includes(f)).length;

  console.log(`Unassigned (${result.unassignedFiles.length} files):`);
  console.log(`  Expected isolated: ${isolatedCorrect}/${expected.isolated.length}`);
  console.log(`  Files: ${unassignedFiles.slice(0, 5).join(', ')}${unassignedFiles.length > 5 ? '...' : ''}`);

  // Overall score
  const overallAccuracy = totalCorrect / 90; // 90 = 100 - 10 isolated
  console.log('\n=== OVERALL SCORE ===');
  console.log(`Clusters: ${result.packages.length} (expected: 7)`);
  console.log(`Accuracy: ${(overallAccuracy * 100).toFixed(1)}%`);
  console.log(`Isolated detection: ${(isolatedCorrect / 10 * 100).toFixed(1)}%`);

  return { overallAccuracy, isolatedCorrect, scores };
}

// Main
async function main() {
  console.log('Building file graph from test data...');
  const files = buildFileGraph();
  console.log(`Found ${files.length} files\n`);

  // Show dependency stats
  const withDeps = files.filter(f => f.dependencies.length > 0);
  const withoutDeps = files.filter(f => f.dependencies.length === 0);
  console.log(`Files with dependencies: ${withDeps.length}`);
  console.log(`Files without dependencies (should be unassigned): ${withoutDeps.length}`);

  // Create mock report and save for API testing
  const report = createMockReport(files);
  const reportPath = path.join(__dirname, '../test-cluster-data/mock-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nSaved mock report to: ${reportPath}`);

  console.log('\nTo test clustering:');
  console.log('1. Start the server pointing to test-cluster-data');
  console.log('2. Or run: curl -X POST http://localhost:3000/api/cluster');
  console.log('3. Compare results to EXPECTED_CLUSTERS.md');
}

main().catch(console.error);
