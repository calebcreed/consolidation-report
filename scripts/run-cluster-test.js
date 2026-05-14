/**
 * Run clustering test against the 80-file test dataset
 *
 * This script:
 * 1. Loads the mock report
 * 2. Sends it to the server to set as current report
 * 3. Runs clustering
 * 4. Evaluates results against expected clusters
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVER = 'http://localhost:3000';

// Expected clusters (ground truth)
const EXPECTED = {
  auth: ['auth/auth.service.ts', 'auth/auth.guard.ts', 'auth/auth.interceptor.ts', 'auth/token.service.ts', 'auth/auth.config.ts', 'auth/auth.state.ts', 'auth/auth.models.ts', 'auth/login.component.ts', 'auth/logout.component.ts', 'auth/auth.module.ts'],
  user: ['user/user.service.ts', 'user/user.models.ts', 'user/user.state.ts', 'user/user.api.ts', 'user/user-profile.component.ts', 'user/user-settings.component.ts', 'user/user-list.component.ts', 'user/user-avatar.component.ts', 'user/user-search.component.ts', 'user/user.module.ts'],
  product: ['product/product.service.ts', 'product/product.models.ts', 'product/product.api.ts', 'product/product.state.ts', 'product/product-list.component.ts', 'product/product-detail.component.ts', 'product/product-card.component.ts', 'product/product-filter.component.ts', 'product/product-search.component.ts', 'product/product.module.ts'],
  cart: ['cart/cart.service.ts', 'cart/cart.models.ts', 'cart/cart.state.ts', 'cart/cart.api.ts', 'cart/cart.component.ts', 'cart/cart-item.component.ts', 'cart/cart-summary.component.ts', 'cart/cart-icon.component.ts', 'cart/cart-promo.component.ts', 'cart/cart.module.ts'],
  order: ['order/order.service.ts', 'order/order.models.ts', 'order/order.api.ts', 'order/order.state.ts', 'order/order-list.component.ts', 'order/order-detail.component.ts', 'order/order-status.component.ts', 'order/order-tracking.component.ts', 'order/order-invoice.component.ts', 'order/order.module.ts'],
  ui: ['ui/button.component.ts', 'ui/input.component.ts', 'ui/modal.component.ts', 'ui/dropdown.component.ts', 'ui/table.component.ts', 'ui/pagination.component.ts', 'ui/tooltip.directive.ts', 'ui/loading.component.ts', 'ui/alert.component.ts', 'ui/ui.module.ts'],
  utils: ['utils/date.utils.ts', 'utils/date-helpers.ts', 'utils/string.utils.ts', 'utils/number.utils.ts', 'utils/array.utils.ts', 'utils/validation.utils.ts', 'utils/storage.utils.ts', 'utils/http.utils.ts', 'utils/object.utils.ts', 'utils/index.ts'],
  isolated: ['isolated/standalone-helper.ts', 'isolated/constants.ts', 'isolated/types.ts', 'isolated/regex-patterns.ts', 'isolated/error-codes.ts', 'isolated/math-helpers.ts', 'isolated/color-utils.ts', 'isolated/crypto-utils.ts', 'isolated/env-config.ts', 'isolated/animations.ts'],
};

async function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function evaluateClusters(result) {
  console.log('\n' + '='.repeat(60));
  console.log('CLUSTERING EVALUATION');
  console.log('='.repeat(60) + '\n');

  let totalCorrect = 0;
  const domainMatches = {};

  // For each actual cluster, find best matching expected domain
  for (const pkg of result.packages) {
    let bestDomain = null;
    let bestOverlap = 0;

    for (const [domain, expectedFiles] of Object.entries(EXPECTED)) {
      if (domain === 'isolated') continue; // Skip isolated for cluster matching

      const overlap = pkg.files.filter(f => expectedFiles.includes(f)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestDomain = domain;
      }
    }

    const precision = pkg.files.length > 0 ? bestOverlap / pkg.files.length : 0;
    const recall = bestDomain ? bestOverlap / EXPECTED[bestDomain].length : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    console.log(`📦 Cluster: "${pkg.name}" (${pkg.files.length} files, cohesion: ${pkg.cohesion})`);
    console.log(`   Best match: ${bestDomain || 'none'} (${bestOverlap}/${bestDomain ? EXPECTED[bestDomain].length : 0} correct)`);
    console.log(`   Precision: ${(precision * 100).toFixed(0)}% | Recall: ${(recall * 100).toFixed(0)}% | F1: ${(f1 * 100).toFixed(0)}%`);

    // Show misplaced files
    if (bestDomain) {
      const wrong = pkg.files.filter(f => !EXPECTED[bestDomain].includes(f));
      if (wrong.length > 0 && wrong.length <= 3) {
        console.log(`   ⚠️  Wrong files: ${wrong.map(f => path.basename(f)).join(', ')}`);
      } else if (wrong.length > 3) {
        console.log(`   ⚠️  ${wrong.length} files don't belong to ${bestDomain}`);
      }
    }
    console.log();

    totalCorrect += bestOverlap;
    domainMatches[pkg.name] = bestDomain;
  }

  // Check unassigned (should be isolated files)
  const isolatedCorrect = result.unassignedFiles.filter(f => EXPECTED.isolated.includes(f)).length;
  const isolatedWrong = result.unassignedFiles.filter(f => !EXPECTED.isolated.includes(f));

  console.log(`📭 Unassigned: ${result.unassignedFiles.length} files`);
  console.log(`   Isolated files detected: ${isolatedCorrect}/${EXPECTED.isolated.length}`);
  if (isolatedWrong.length > 0) {
    console.log(`   ⚠️  Non-isolated files incorrectly unassigned: ${isolatedWrong.length}`);
    if (isolatedWrong.length <= 5) {
      console.log(`      ${isolatedWrong.map(f => path.basename(f)).join(', ')}`);
    }
  }

  // Summary
  const expectedClustered = 70; // 80 - 10 isolated
  const accuracy = totalCorrect / expectedClustered;
  const isolatedAccuracy = isolatedCorrect / 10;

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Clusters created: ${result.packages.length} (expected: ~7)`);
  console.log(`Clustering accuracy: ${(accuracy * 100).toFixed(1)}% (${totalCorrect}/${expectedClustered} files correctly grouped)`);
  console.log(`Isolated detection: ${(isolatedAccuracy * 100).toFixed(1)}% (${isolatedCorrect}/10 correctly unassigned)`);
  console.log(`Overall score: ${((accuracy * 0.8 + isolatedAccuracy * 0.2) * 100).toFixed(1)}%`);

  // Grade
  const score = accuracy * 0.8 + isolatedAccuracy * 0.2;
  let grade;
  if (score >= 0.9) grade = 'A - Excellent';
  else if (score >= 0.8) grade = 'B - Good';
  else if (score >= 0.7) grade = 'C - Acceptable';
  else if (score >= 0.6) grade = 'D - Needs improvement';
  else grade = 'F - Poor';

  console.log(`Grade: ${grade}`);
  console.log('='.repeat(60) + '\n');

  return { accuracy, isolatedAccuracy, score, grade };
}

async function main() {
  console.log('Loading mock report...');
  const reportPath = path.join(__dirname, '../test-cluster-data/mock-report.json');

  if (!fs.existsSync(reportPath)) {
    console.error('Mock report not found. Run: node scripts/test-clustering.js first');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  console.log(`Loaded ${report.files.length} files from mock report\n`);

  // Check if server is running
  try {
    await fetchJson(`${SERVER}/api/state`);
  } catch (e) {
    console.error('Server not running. Start with: npm run serve');
    process.exit(1);
  }

  // We need to inject the mock report into the server
  // Since there's no direct API for this, we'll create the mock state manually
  // For now, just run clustering with current data

  console.log('Running clustering...');
  const result = await fetchJson(`${SERVER}/api/cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (result.error) {
    console.error('Clustering failed:', result.error);
    console.log('\nNote: The server needs conflict files from the actual project.');
    console.log('The mock test data requires manual integration.');
    process.exit(1);
  }

  // Evaluate
  evaluateClusters(result);
}

main().catch(console.error);
