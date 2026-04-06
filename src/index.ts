#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { Config, FileMappingConfig } from './config';
import { AngularParser } from './parser';
import { FileMatcher } from './matcher';
import { GitDiffer, ThreeWayDiffResult } from './diff';
import { GraphBuilder, GraphAnalyzer } from './graph';
import { ReportGenerator } from './report';

const program = new Command();

program
  .name('consolidate')
  .description('Analyze Angular codebase for consolidation opportunities')
  .version('1.0.0');

program
  .command('analyze')
  .description('Run full analysis and generate report')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .requiredOption('-b, --base-commit <hash>', 'Git commit hash of the common ancestor (before split)')
  .option('-s, --shared <path>', 'Path to shared directory', './shared')
  .option('-o, --output <path>', 'Output path for HTML report', './consolidation-report.html')
  .option('-m, --mapping <path>', 'Path to mapping file (will create if not exists)', './consolidation-mapping.json')
  .option('--repo-root <path>', 'Git repository root (default: auto-detect)')
  .action(async (options) => {
    try {
      await runAnalysis(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program
  .command('match')
  .description('Generate file mapping without full analysis')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .option('-o, --output <path>', 'Output path for mapping file', './consolidation-mapping.json')
  .action(async (options) => {
    try {
      await runMatching(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show quick statistics without full report')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .requiredOption('-b, --base-commit <hash>', 'Git commit hash of the common ancestor')
  .option('--repo-root <path>', 'Git repository root')
  .action(async (options) => {
    try {
      await runStats(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

async function runAnalysis(options: {
  retail: string;
  restaurant: string;
  baseCommit: string;
  shared: string;
  output: string;
  mapping: string;
  repoRoot?: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const sharedPath = path.resolve(options.shared);
  const outputPath = path.resolve(options.output);
  const mappingPath = path.resolve(options.mapping);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);

  console.log('WebPOS Consolidation Analyzer');
  console.log('=============================');
  console.log(`Retail:      ${retailPath}`);
  console.log(`Restaurant:  ${restaurantPath}`);
  console.log(`Shared:      ${sharedPath}`);
  console.log(`Base commit: ${options.baseCommit}`);
  console.log(`Repo root:   ${repoRoot}`);
  console.log('');

  // Step 1: Parse files
  console.log('Step 1/5: Parsing TypeScript/Angular files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts']);

  console.log(`  Found ${retailFiles.length} retail files`);
  console.log(`  Found ${restaurantFiles.length} restaurant files`);

  // Step 2: Match files
  console.log('Step 2/5: Matching files between branches...');
  const matcher = new FileMatcher(retailPath, restaurantPath);

  // Load existing mapping if available
  let manualOverrides: Record<string, string> | undefined;
  const existingMapping = matcher.loadMappingFile(mappingPath);
  if (existingMapping) {
    console.log(`  Loaded existing mapping from ${mappingPath}`);
    manualOverrides = existingMapping.manualOverrides;
  }

  const matchResult = matcher.match(retailFiles, restaurantFiles, manualOverrides);

  console.log(`  Matched: ${matchResult.matched.length} files`);
  console.log(`  Retail only: ${matchResult.retailOnly.length} files`);
  console.log(`  Restaurant only: ${matchResult.restaurantOnly.length} files`);

  // Save mapping
  matcher.saveMappingFile(matchResult, mappingPath);
  console.log(`  Saved mapping to ${mappingPath}`);

  // Step 3: Compute diffs
  console.log('Step 3/5: Computing three-way diffs...');
  const differ = new GitDiffer(repoRoot, options.baseCommit);
  const diffResults = new Map<string, ThreeWayDiffResult>();

  let processed = 0;
  const total = matchResult.matched.length + matchResult.retailOnly.length + matchResult.restaurantOnly.length;

  for (const match of matchResult.matched) {
    const result = differ.computeThreeWayDiff(match.retailFile, match.restaurantFile);
    diffResults.set(match.retailFile, result);
    processed++;
    if (processed % 50 === 0) {
      console.log(`  Processed ${processed}/${total} files...`);
    }
  }

  for (const filePath of matchResult.retailOnly) {
    const result = differ.computeThreeWayDiff(filePath, null);
    diffResults.set(filePath, result);
    processed++;
  }

  for (const filePath of matchResult.restaurantOnly) {
    const result = differ.computeThreeWayDiff(null, filePath);
    diffResults.set(filePath, result);
    processed++;
  }

  console.log(`  Computed diffs for ${diffResults.size} files`);

  // Step 4: Build dependency graph
  console.log('Step 4/5: Building dependency graph...');
  const config: Config = {
    repoRoot,
    retailPath,
    restaurantPath,
    sharedPath,
    baseCommit: options.baseCommit,
    outputPath,
    mappingFile: mappingPath,
    fileExtensions: ['.ts'],
  };

  const graphBuilder = new GraphBuilder(config);
  const { nodes, edges } = graphBuilder.build(
    retailFiles,
    restaurantFiles,
    matchResult.matched,
    matchResult.retailOnly,
    matchResult.restaurantOnly,
    diffResults
  );

  console.log(`  Built graph with ${nodes.size} nodes and ${edges.length} edges`);

  // Step 5: Analyze and generate report
  console.log('Step 5/5: Analyzing and generating report...');
  const analyzer = new GraphAnalyzer();
  const analysisResult = analyzer.analyze(nodes, edges);

  const reportGenerator = new ReportGenerator(differ);
  reportGenerator.generate(analysisResult, diffResults, outputPath);

  // Print summary
  console.log('');
  console.log('Analysis Complete');
  console.log('=================');
  console.log(`Total files:          ${analysisResult.stats.totalFiles}`);
  console.log(`Clean (identical):    ${analysisResult.stats.cleanFiles}`);
  console.log(`Same change:          ${analysisResult.stats.sameChangeFiles}`);
  console.log(`Retail only changed:  ${analysisResult.stats.retailOnlyFiles}`);
  console.log(`Restaurant only:      ${analysisResult.stats.restaurantOnlyFiles}`);
  console.log(`Conflicts:            ${analysisResult.stats.conflictFiles}`);
  console.log('');
  console.log(`Clean subtrees found: ${analysisResult.cleanSubtrees.length}`);
  console.log(`Trivial merges:       ${analysisResult.trivialMerges.length}`);
  console.log('');
  console.log(`Report saved to: ${outputPath}`);
  console.log('Open in a browser to explore the results.');
}

async function runMatching(options: {
  retail: string;
  restaurant: string;
  output: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const outputPath = path.resolve(options.output);

  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts']);

  console.log('Matching files...');
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  matcher.saveMappingFile(matchResult, outputPath);

  console.log(`Matched: ${matchResult.matched.length}`);
  console.log(`Retail only: ${matchResult.retailOnly.length}`);
  console.log(`Restaurant only: ${matchResult.restaurantOnly.length}`);
  console.log(`Saved to: ${outputPath}`);
}

async function runStats(options: {
  retail: string;
  restaurant: string;
  baseCommit: string;
  repoRoot?: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);

  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts']);

  console.log('Matching files...');
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  console.log('Computing diffs...');
  const differ = new GitDiffer(repoRoot, options.baseCommit);

  let clean = 0, sameChange = 0, retailOnly = 0, restaurantOnly = 0, conflict = 0;

  for (const match of matchResult.matched) {
    const result = differ.computeThreeWayDiff(match.retailFile, match.restaurantFile);
    switch (result.divergence.type) {
      case 'CLEAN': clean++; break;
      case 'SAME_CHANGE': sameChange++; break;
      case 'RETAIL_ONLY': retailOnly++; break;
      case 'RESTAURANT_ONLY': restaurantOnly++; break;
      case 'CONFLICT': conflict++; break;
    }
  }

  console.log('');
  console.log('Quick Stats');
  console.log('===========');
  console.log(`Matched files:        ${matchResult.matched.length}`);
  console.log(`  Clean:              ${clean}`);
  console.log(`  Same change:        ${sameChange}`);
  console.log(`  Retail only:        ${retailOnly}`);
  console.log(`  Restaurant only:    ${restaurantOnly}`);
  console.log(`  Conflicts:          ${conflict}`);
  console.log(`Retail only files:    ${matchResult.retailOnly.length}`);
  console.log(`Restaurant only:      ${matchResult.restaurantOnly.length}`);
}

function findGitRoot(startPath: string): string {
  let dir = startPath;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find git repository root');
}

program.parse();
