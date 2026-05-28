#!/usr/bin/env ts-node
/**
 * Export clusters to Jira JSON
 *
 * Usage:
 *   npx ts-node src/jira/export-to-jira.ts --project PNC --output ./jira-cards
 *
 * Or after build:
 *   node dist/jira/export-to-jira.js --project PNC --output ./jira-cards
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ClusterData,
  generateBulkImport,
  generateIssueFiles,
  generateSummaryReport,
  estimateStoryPoints
} from './generate-cards';

// Parse command line args
const args = process.argv.slice(2);
const projectKey = getArg(args, '--project') || 'PNC';
const outputDir = getArg(args, '--output') || './jira-export';
const issueType = getArg(args, '--type') || 'Task';
const inputFile = getArg(args, '--input') || './clusters.json';

function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

async function main() {
  console.log('=== Jira Card Export ===\n');
  console.log(`Project: ${projectKey}`);
  console.log(`Issue Type: ${issueType}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  // Load clusters - try multiple sources
  let clusters: ClusterData[] = [];

  // Try loading from input file
  if (fs.existsSync(inputFile)) {
    console.log(`Loading clusters from ${inputFile}...`);
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    clusters = data.clusters || data;
  } else {
    // Generate sample data for testing
    console.log('No clusters.json found. Generating sample data...');
    clusters = generateSampleClusters();
  }

  console.log(`Found ${clusters.length} clusters\n`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate bulk import JSON
  const bulkImport = generateBulkImport(clusters, projectKey, issueType);
  const bulkPath = path.join(outputDir, 'jira-bulk-import.json');
  fs.writeFileSync(bulkPath, JSON.stringify(bulkImport, null, 2));
  console.log(`Created: ${bulkPath}`);

  // Generate individual issue files
  const issueFiles = generateIssueFiles(clusters, projectKey, issueType);
  for (const { filename, content } of issueFiles) {
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  }
  console.log(`Created: ${issueFiles.length} individual issue files`);

  // Generate summary report
  const summary = generateSummaryReport(clusters);
  const summaryPath = path.join(outputDir, 'summary.md');
  fs.writeFileSync(summaryPath, summary);
  console.log(`Created: ${summaryPath}`);

  // Generate CSV for easy viewing
  const csv = generateCSV(clusters);
  const csvPath = path.join(outputDir, 'clusters.csv');
  fs.writeFileSync(csvPath, csv);
  console.log(`Created: ${csvPath}`);

  console.log('\n=== Done ===');
  console.log(`\nTo import to Jira:`);
  console.log(`1. Use jira-bulk-import.json with Jira REST API POST /rest/api/2/issue/bulk`);
  console.log(`2. Or import individual JSON files manually`);
  console.log(`3. Or use the CSV with Jira's CSV importer`);
}

function generateCSV(clusters: ClusterData[]): string {
  let csv = 'Summary,Description,Issue Type,Labels,Story Points,File Count\n';

  for (const cluster of clusters) {
    const summary = `[WebPOS Consolidation] ${cluster.name}`.replace(/"/g, '""');
    const description = `Resolve conflicts in ${cluster.files.length} files: ${cluster.files.slice(0, 3).join(', ')}${cluster.files.length > 3 ? '...' : ''}`.replace(/"/g, '""');
    const points = estimateStoryPoints(cluster);

    csv += `"${summary}","${description}","Task","webpos-consolidation",${points},${cluster.files.length}\n`;
  }

  return csv;
}

function generateSampleClusters(): ClusterData[] {
  // This would normally come from your clustering algorithm
  return [
    {
      id: 'auth-cluster',
      name: 'Authentication & Login',
      files: [
        'src/app/auth/login.component.ts',
        'src/app/auth/auth.service.ts',
        'src/app/auth/auth.guard.ts',
        'src/app/auth/session.service.ts'
      ]
    },
    {
      id: 'cart-cluster',
      name: 'Shopping Cart',
      files: [
        'src/app/cart/cart.component.ts',
        'src/app/cart/cart.service.ts',
        'src/app/cart/cart-item.component.ts'
      ]
    },
    {
      id: 'checkout-cluster',
      name: 'Checkout Flow',
      files: [
        'src/app/checkout/checkout.component.ts',
        'src/app/checkout/payment.component.ts',
        'src/app/checkout/checkout.service.ts',
        'src/app/checkout/receipt.component.ts',
        'src/app/checkout/tip.component.ts'
      ]
    }
  ];
}

main().catch(console.error);
