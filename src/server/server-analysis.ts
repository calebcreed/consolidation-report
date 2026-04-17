/**
 * Analysis Logic - builds dependency graph and compares files
 */

import * as path from 'path';
import { GraphBuilder } from '../deps';
import { ReportAnalyzer, FileMatch } from '../report';
import { AnalysisReport } from '../report/types';
import { ServerConfig } from './state-types';
import { compareFiles, scanDirectory } from './server-utils';

export interface AnalysisProgress {
  (message: string): void;
}

/**
 * Run full analysis on retail vs restaurant branches
 */
export async function runAnalysis(
  config: ServerConfig,
  progress: AnalysisProgress
): Promise<AnalysisReport> {
  // Resolve project path to absolute (critical for graph lookups)
  const projectPath = path.resolve(config.projectPath);

  // Scan both retail and restaurant directories
  const retailAppDir = path.join(projectPath, 'apps/retail');
  const restaurantAppDir = path.join(projectPath, 'apps/restaurant');
  const retailSrcDir = path.join(retailAppDir, 'src');
  const restaurantSrcDir = path.join(restaurantAppDir, 'src');

  progress(`Scanning retail: ${retailSrcDir}`);
  const retailFiles = scanDirectory(retailSrcDir, retailAppDir);
  progress(`  Found ${retailFiles.size} files in retail`);

  progress(`Scanning restaurant: ${restaurantSrcDir}`);
  const restaurantFiles = scanDirectory(restaurantSrcDir, restaurantAppDir);
  progress(`  Found ${restaurantFiles.size} files in restaurant`);

  // Build dependency graph from restaurant (primary branch)
  progress('Building dependency graph (this may take a few minutes on large projects)...');
  const graphStartTime = Date.now();
  const builder = GraphBuilder.fromTsconfig(config.tsconfigPath);
  const graph = await builder.build(restaurantSrcDir, {
    include: ['**/*.ts'],
    exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
  });

  const graphTime = ((Date.now() - graphStartTime) / 1000).toFixed(1);
  const graphStats = graph.getStats();
  progress(`Built dependency graph in ${graphTime}s: ${graphStats.totalFiles} files, ${graphStats.totalEdges} dependencies`);

  // Collect all unique relative paths from both branches
  const allPaths = new Set<string>();
  for (const rp of retailFiles.keys()) allPaths.add(rp);
  for (const rp of restaurantFiles.keys()) allPaths.add(rp);

  const totalFiles = allPaths.size;
  progress(`Comparing ${totalFiles} unique files...`);

  // Create file matches with real comparison
  const fileMatches: FileMatch[] = [];
  let cleanCount = 0, conflictCount = 0, retailOnlyCount = 0, restaurantOnlyCount = 0;
  let processed = 0;
  const progressInterval = Math.max(1, Math.floor(totalFiles / 20));

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
      progress(`Comparing files: ${processed}/${totalFiles} (${pct}%) - ${cleanCount} clean, ${conflictCount} conflicts`);
    }

    // Get dependencies from graph
    const graphPath = restaurantPath || retailPath;
    const analysis = graphPath ? graph.getAnalysis(graphPath) : null;

    // Map dependency targets to relative paths
    // If a dependency can't be found in the graph, try to compute its relative path
    // Filter out symbolic/non-file dependencies
    const dependencies = (analysis?.dependencies || [])
      .filter(d =>
        !d.target.startsWith('external:') &&
        !d.target.startsWith('unresolved:') &&
        !d.target.startsWith('symbol:') &&
        !d.target.startsWith('ngrx-') &&
        // Angular template symbolic dependencies
        !d.target.startsWith('selector:') &&
        !d.target.startsWith('pipe:') &&
        !d.target.startsWith('directive:') &&
        !d.target.startsWith('component:')
      )
      .map(d => {
        // Try to get from graph first
        const targetAnalysis = graph.getAnalysis(d.target);
        if (targetAnalysis) {
          return targetAnalysis.relativePath;
        }
        // If not in graph, compute relative path from the target
        // Target is absolute, we need to make it relative to appDir
        if (d.target.includes('/apps/restaurant/')) {
          return d.target.split('/apps/restaurant/')[1];
        }
        if (d.target.includes('/apps/retail/')) {
          return d.target.split('/apps/retail/')[1];
        }
        // Keep absolute path as fallback - analyzer will handle it
        return d.target;
      })
      .filter((p): p is string => p !== undefined && p !== '')
      .filter((p, i, arr) => arr.indexOf(p) === i);

    const dependents = graphPath
      ? graph.getDependents(graphPath)
          .filter(d =>
            !d.source.startsWith('external:') &&
            !d.source.startsWith('unresolved:') &&
            !d.source.startsWith('symbol:') &&
            !d.source.startsWith('ngrx-') &&
            // Angular template symbolic dependencies
            !d.source.startsWith('selector:') &&
            !d.source.startsWith('pipe:') &&
            !d.source.startsWith('directive:') &&
            !d.source.startsWith('component:')
          )
          .map(d => {
            const sourceAnalysis = graph.getAnalysis(d.source);
            if (sourceAnalysis) {
              return sourceAnalysis.relativePath;
            }
            if (d.source.includes('/apps/restaurant/')) {
              return d.source.split('/apps/restaurant/')[1];
            }
            if (d.source.includes('/apps/retail/')) {
              return d.source.split('/apps/retail/')[1];
            }
            return d.source;
          })
          .filter((p): p is string => p !== undefined && p !== '')
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

  progress(`Comparison: ${cleanCount} clean, ${conflictCount} conflicts, ${retailOnlyCount} retail-only, ${restaurantOnlyCount} restaurant-only`);

  // Analyze
  const analyzer = new ReportAnalyzer();
  const report = analyzer.analyze(fileMatches);

  progress(`Analysis complete: ${report.cleanSubtrees.length} clean subtrees found`);

  return report;
}
