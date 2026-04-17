#!/usr/bin/env node
/**
 * Demo Report Generator
 *
 * Generates a sample report from test-fixture to demonstrate the v2 report module.
 * This creates mock retail/restaurant comparison data since we only have one branch.
 *
 * Run: npx ts-node src/v2/demo-report.ts
 * Or after build: node dist/v2/demo-report.js
 */

import * as path from 'path';
import * as fs from 'fs';
import { GraphBuilder } from './deps/graph';
import { SemanticComparator } from './diff/comparator';
import { ReportAnalyzer, TerminalReporter, HtmlReporter, FileMatch, FileStatus } from './report';

// Resolve test-fixture relative to project root
const MODEL_PATH = path.resolve(process.cwd(), 'test-fixture');
const RESTAURANT_APP = path.join(MODEL_PATH, 'apps/restaurant');
const TSCONFIG_PATH = path.join(RESTAURANT_APP, 'tsconfig.app.json');

async function main() {
  console.log('Branch v2 Report Demo');
  console.log('='.repeat(50));
  console.log(`Model path: ${MODEL_PATH}`);
  console.log('');

  // Build dependency graph
  console.log('Building dependency graph...');
  const builder = GraphBuilder.fromTsconfig(TSCONFIG_PATH);
  const graph = await builder.build(path.join(RESTAURANT_APP, 'src'), {
    include: ['**/*.ts'],
    exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
  });

  const stats = graph.getStats();
  console.log(`  Found ${stats.totalFiles} files, ${stats.totalEdges} dependencies`);

  // Create mock file matches
  // In a real scenario, we'd compare retail vs restaurant
  // For demo, we simulate various statuses
  console.log('Creating mock file comparison data...');
  const fileMatches = createMockFileMatches(graph);
  console.log(`  Created ${fileMatches.length} file matches`);

  // Analyze
  console.log('Analyzing clean subtrees and bottlenecks...');
  const analyzer = new ReportAnalyzer();
  const report = analyzer.analyze(fileMatches);

  // Terminal report
  console.log('');
  const terminalReporter = new TerminalReporter();
  console.log(terminalReporter.generate(report));

  // HTML report
  const outputPath = path.join(MODEL_PATH, 'consolidation-report.html');
  console.log(`\nGenerating HTML report: ${outputPath}`);
  const htmlReporter = new HtmlReporter();
  htmlReporter.generate(report, outputPath);

  console.log('\nDone! Open the HTML report in a browser to view.');
}

/**
 * Create mock file matches from the graph
 * This simulates what a real retail/restaurant comparison would produce
 */
function createMockFileMatches(graph: import('./deps/graph').DependencyGraph): FileMatch[] {
  const files = graph.getFiles();
  const matches: FileMatch[] = [];

  // Use diff-examples directory for actual diff scenarios if it exists
  const diffExamplesPath = path.join(MODEL_PATH, 'apps/restaurant/src/app/diff-examples');
  const hasDiffExamples = fs.existsSync(diffExamplesPath);

  for (const filePath of files) {
    const analysis = graph.getAnalysis(filePath);
    if (!analysis) continue;

    const relativePath = analysis.relativePath;

    // Determine status based on path patterns (simulated)
    let status: FileStatus = 'clean';

    // Check if this is a diff example file
    if (hasDiffExamples && relativePath.includes('diff-examples')) {
      if (relativePath.includes('conflict')) {
        status = 'conflict';
      } else if (relativePath.includes('retail-only') || relativePath.includes('retail_only')) {
        status = 'retail-only';
      } else if (relativePath.includes('restaurant-only') || relativePath.includes('restaurant_only')) {
        status = 'restaurant-only';
      } else if (relativePath.includes('same-change') || relativePath.includes('same_change')) {
        status = 'same-change';
      } else if (relativePath.includes('clean') || relativePath.includes('identical')) {
        status = 'clean';
      }
    } else {
      // Simulate realistic distribution for other files
      const hash = simpleHash(relativePath);
      if (hash % 100 < 60) {
        status = 'clean';
      } else if (hash % 100 < 70) {
        status = 'same-change';
      } else if (hash % 100 < 80) {
        status = 'retail-only';
      } else if (hash % 100 < 90) {
        status = 'restaurant-only';
      } else {
        status = 'conflict';
      }
    }

    // Get dependencies (relative paths only, skip external)
    const dependencies = analysis.dependencies
      .filter(d => !d.target.startsWith('external:') &&
                   !d.target.startsWith('unresolved:') &&
                   !d.target.startsWith('symbol:'))
      .map(d => {
        const depAnalysis = graph.getAnalysis(d.target);
        return depAnalysis?.relativePath || d.target;
      })
      .filter((p, i, arr) => arr.indexOf(p) === i); // Unique

    // Get dependents
    const dependents = graph.getDependents(filePath)
      .map(d => {
        const depAnalysis = graph.getAnalysis(d.source);
        return depAnalysis?.relativePath || d.source;
      })
      .filter((p, i, arr) => arr.indexOf(p) === i);

    // Generate sample unified diff for conflicts
    let unifiedDiff: string | undefined;
    if (status === 'conflict') {
      const filename = relativePath.split('/').pop() || 'file.ts';
      unifiedDiff = generateSampleUnifiedDiff(relativePath);
    }

    // Generate mock lines changed for non-clean files
    let linesChanged: number | undefined;
    if (status !== 'clean') {
      // Simulate varying levels of effort based on status
      const baseLines = (simpleHash(relativePath + 'lines') % 50) + 5;
      if (status === 'conflict') {
        linesChanged = baseLines * 2; // Conflicts need more work
      } else if (status === 'same-change') {
        linesChanged = baseLines; // Same change - just review
      } else {
        linesChanged = baseLines; // One-sided changes
      }
    }

    matches.push({
      relativePath,
      retailPath: filePath,
      restaurantPath: filePath,
      status,
      diff: status === 'clean' ? { status: 'identical' } : { status: 'dirty', changes: [] },
      unifiedDiff,
      isCleanSubtree: false, // Will be computed by analyzer
      dependencies,
      dependents,
      linesChanged,
    });
  }

  return matches;
}

/**
 * Simple hash function for deterministic "random" values
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate sample unified diff for demo purposes (retail vs restaurant)
 */
function generateSampleUnifiedDiff(relativePath: string): string {
  const filename = relativePath.split('/').pop() || 'file.ts';
  return `--- retail/${relativePath}
+++ restaurant/${relativePath}
@@ -10,9 +10,11 @@ export class SomeService {
   constructor(private http: HttpClient) {}

   getData(): Observable<Data> {
-    // Retail implementation with caching
-    return this.http.get<Data>('/api/data').pipe(
-      shareReplay(1)
-    );
+    // Restaurant implementation with error handling
+    return this.http.get<Data>('/api/data').pipe(
+      retry(3),
+      catchError(this.handleError)
+    );
   }
 }`;
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
