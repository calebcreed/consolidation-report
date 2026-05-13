/**
 * Analysis Logic - builds dependency graph and compares files
 */

import * as path from 'path';
import { GraphBuilder } from '../deps';
import { ReportAnalyzer, FileMatch } from '../report';
import { AnalysisReport } from '../report/types';
import { ServerConfig } from './state-types';
import { compareFiles, scanDirectory } from './server-utils';
import { normalizePath, isBarrelFile } from '../utils/paths';

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

  // Build dependency graph from BOTH branches
  // This ensures retail-only files have their dependencies tracked
  progress('Building dependency graph from both branches...');
  const graphStartTime = Date.now();
  const builder = GraphBuilder.fromTsconfig(config.tsconfigPath);

  // Combine file lists from both branches (use absolute paths)
  const allAbsolutePaths = new Set<string>();
  for (const absPath of retailFiles.values()) {
    if (absPath.endsWith('.ts') && !absPath.includes('.spec.') && !absPath.includes('.test.')) {
      allAbsolutePaths.add(absPath);
    }
  }
  for (const absPath of restaurantFiles.values()) {
    if (absPath.endsWith('.ts') && !absPath.includes('.spec.') && !absPath.includes('.test.')) {
      allAbsolutePaths.add(absPath);
    }
  }

  progress(`  Building graph from ${allAbsolutePaths.size} files (both branches combined)`);
  const graph = builder.buildFromFiles(Array.from(allAbsolutePaths));

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
    const rawDeps = analysis?.dependencies || [];

    // Extract unresolved imports BEFORE filtering (Fix 1.2)
    const unresolvedImports = rawDeps
      .filter(d => d.target.startsWith('unresolved:'))
      .map(d => d.specifier);
    const hasUnresolvedImports = unresolvedImports.length > 0;

    // Log warning for files with unresolved imports
    if (hasUnresolvedImports) {
      progress(`  WARNING: ${relativePath} has ${unresolvedImports.length} unresolved import(s): ${unresolvedImports.slice(0, 3).join(', ')}${unresolvedImports.length > 3 ? '...' : ''}`);
    }

    // Extract symbolic dependencies BEFORE filtering (Fix 1.3)
    const symbolicPrefixes = ['symbol:', 'selector:', 'pipe:', 'directive:', 'component:', 'ngrx-'];
    const symbolicDeps = rawDeps.filter(d =>
      symbolicPrefixes.some(prefix => d.target.startsWith(prefix))
    );
    const hasSymbolicDependencies = symbolicDeps.length > 0;
    const symbolicDependencyCount = symbolicDeps.length;
    const symbolicDependencies = symbolicDeps.map(d => d.target);

    // Extract dynamic imports for visibility (Fix 3.1)
    const dynamicDeps = rawDeps.filter(d => d.type === 'import-dynamic');
    const hasDynamicImports = dynamicDeps.length > 0;
    const dynamicImports = dynamicDeps.map(d => d.specifier);

    // Log warning for files with dynamic imports
    if (hasDynamicImports) {
      progress(`  INFO: ${relativePath} has ${dynamicImports.length} dynamic import(s) - review for lazy-loaded conflicts`);
    }

    // Map dependency targets to relative paths
    // If a dependency can't be found in the graph, try to compute its relative path
    // Filter out symbolic/non-file dependencies
    const dependencies = rawDeps
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
        // If not in graph, normalize the path (Fix 2.1)
        return normalizePath(d.target, projectPath);
      })
      .filter((p): p is string => p !== undefined && p !== '')
      .filter((p, i, arr) => arr.indexOf(p) === i);

    // Expand barrel dependencies (Fix 2.2)
    // If a dependency is a barrel file (index.ts), also add its re-exported files
    const expandedDependencies = new Set<string>(dependencies);
    for (const depRelPath of dependencies) {
      // Find the absolute path for this dependency
      const depAbsPath = retailFiles.get(depRelPath) || restaurantFiles.get(depRelPath);
      if (depAbsPath && isBarrelFile(depAbsPath)) {
        // Get the barrel's dependencies (the files it re-exports)
        const barrelAnalysis = graph.getAnalysis(depAbsPath);
        if (barrelAnalysis) {
          for (const barrelDep of barrelAnalysis.dependencies) {
            // Only include export-from dependencies (re-exports)
            if (barrelDep.type === 'export-from' &&
                !barrelDep.target.startsWith('external:') &&
                !barrelDep.target.startsWith('unresolved:')) {
              const barrelDepAnalysis = graph.getAnalysis(barrelDep.target);
              if (barrelDepAnalysis) {
                expandedDependencies.add(barrelDepAnalysis.relativePath);
              } else {
                expandedDependencies.add(normalizePath(barrelDep.target, projectPath));
              }
            }
          }
        }
      }
    }
    const finalDependencies = Array.from(expandedDependencies);

    // Log warning for files with ONLY symbolic deps (Fix 1.3)
    // These files appear to have zero tracked dependencies but actually depend on symbols
    if (hasSymbolicDependencies && finalDependencies.length === 0) {
      progress(`  WARNING: ${relativePath} has ${symbolicDependencyCount} symbolic dep(s) but 0 file deps - may have hidden dependencies`);
    }

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
            // Normalize path (Fix 2.1)
            return normalizePath(d.source, projectPath);
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
      dependencies: finalDependencies,
      dependents,
      // Unresolved imports tracking (Fix 1.2)
      hasUnresolvedImports,
      unresolvedImports,
      // Symbolic dependencies tracking (Fix 1.3)
      hasSymbolicDependencies,
      symbolicDependencyCount,
      symbolicDependencies,
      // Dynamic imports tracking (Fix 3.1)
      hasDynamicImports,
      dynamicImports,
    });
  }

  progress(`Comparison: ${cleanCount} clean, ${conflictCount} conflicts, ${retailOnlyCount} retail-only, ${restaurantOnlyCount} restaurant-only`);

  // Analyze
  const analyzer = new ReportAnalyzer();
  const report = analyzer.analyze(fileMatches);

  progress(`Analysis complete: ${report.cleanSubtrees.length} clean subtrees found`);

  return report;
}
