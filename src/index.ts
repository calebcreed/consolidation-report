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
import { Validator } from './validator';

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
  .option('-b, --base-commit <hash>', 'Git commit hash of the common ancestor (optional, enables three-way diff)')
  .option('-s, --shared <path>', 'Path to shared directory', './shared')
  .option('-o, --output <path>', 'Output path for HTML report (default: auto-increment report1.html, report2.html, etc.)')
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
  .option('-b, --base-commit <hash>', 'Git commit hash of the common ancestor (optional)')
  .option('--repo-root <path>', 'Git repository root')
  .action(async (options) => {
    try {
      await runStats(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate parser results against shell find command')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .option('-e, --extensions <exts>', 'Comma-separated file extensions', '.ts,.tsx,.scss,.html')
  .action(async (options) => {
    try {
      await runValidation(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

async function runValidation(options: {
  retail: string;
  restaurant: string;
  extensions: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const extensions = options.extensions.split(',').map(e => e.trim());

  console.log('Validation: Parser vs Shell Find');
  console.log('=================================');
  console.log(`Extensions: ${extensions.join(', ')}`);
  console.log('');

  // Parse files using the Angular parser
  console.log('Running Angular parser on retail...');
  const retailParser = new AngularParser(retailPath);
  const retailFiles = retailParser.parseDirectory(retailPath, extensions, true);

  console.log('Running Angular parser on restaurant...');
  const restaurantParser = new AngularParser(restaurantPath);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, extensions, true);

  const retailParsedPaths = retailFiles.map(f => f.filePath);
  const restaurantParsedPaths = restaurantFiles.map(f => f.filePath);

  // Run validation
  const validator = new Validator();

  console.log('Running shell find...');
  const retailResult = validator.validate(retailPath, retailParsedPaths, extensions);
  const restaurantResult = validator.validate(restaurantPath, restaurantParsedPaths, extensions);

  // Print reports
  validator.printReport('Retail Validation', retailResult);
  validator.printReport('Restaurant Validation', restaurantResult);

  // Analyze patterns in missing files
  if (retailResult.missingFiles.length > 0) {
    console.log('\nRetail Missing File Patterns:');
    const patterns = validator.analyzeMissingPatterns(retailResult.missingFiles, retailPath);
    for (const [pattern, count] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pattern}: ${count}`);
    }
  }

  if (restaurantResult.missingFiles.length > 0) {
    console.log('\nRestaurant Missing File Patterns:');
    const patterns = validator.analyzeMissingPatterns(restaurantResult.missingFiles, restaurantPath);
    for (const [pattern, count] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pattern}: ${count}`);
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  const totalShell = retailResult.findCount + restaurantResult.findCount;
  const totalParsed = retailResult.parserCount + restaurantResult.parserCount;
  const totalMissing = retailResult.missingFiles.length + restaurantResult.missingFiles.length;

  console.log(`Total files (shell):   ${totalShell}`);
  console.log(`Total files (parser):  ${totalParsed}`);
  console.log(`Total missing:         ${totalMissing}`);
  console.log(`Coverage:              ${((totalParsed / totalShell) * 100).toFixed(1)}%`);
}

function getNextReportPath(): string {
  // Default to /reports directory relative to this script's location
  const reportsDir = path.join(__dirname, '..', 'reports');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const files = fs.readdirSync(reportsDir);
  const reportPattern = /^report(\d+)\.html$/;
  let maxNum = 0;

  for (const file of files) {
    const match = file.match(reportPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return path.join(reportsDir, `report${maxNum + 1}.html`);
}

async function runAnalysis(options: {
  retail: string;
  restaurant: string;
  baseCommit: string;
  shared: string;
  output?: string;
  mapping: string;
  repoRoot?: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const sharedPath = path.resolve(options.shared);
  const outputPath = options.output ? path.resolve(options.output) : getNextReportPath();
  const mappingPath = path.resolve(options.mapping);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);

  console.log('WebPOS Consolidation Analyzer');
  console.log('=============================');
  console.log(`Retail:      ${retailPath}`);
  console.log(`Restaurant:  ${restaurantPath}`);
  console.log(`Shared:      ${sharedPath}`);
  console.log(`Base commit: ${options.baseCommit || '(none - two-way diff mode)'}`);
  console.log(`Repo root:   ${repoRoot}`);
  console.log(`Output:      ${outputPath}`);
  console.log('');

  // Step 1: Parse files
  console.log('Step 1/5: Parsing TypeScript/Angular files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

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

  // Diagnostic check - verify matcher accounts for all parsed files
  const matcherRetailTotal = matchResult.matched.length + matchResult.retailOnly.length;
  const matcherRestaurantTotal = matchResult.matched.length + matchResult.restaurantOnly.length;
  if (matcherRetailTotal !== retailFiles.length) {
    console.warn(`  WARNING: Matcher accounts for ${matcherRetailTotal} retail files, but parser found ${retailFiles.length} (missing ${retailFiles.length - matcherRetailTotal})`);
  }
  if (matcherRestaurantTotal !== restaurantFiles.length) {
    console.warn(`  WARNING: Matcher accounts for ${matcherRestaurantTotal} restaurant files, but parser found ${restaurantFiles.length} (missing ${restaurantFiles.length - matcherRestaurantTotal})`);
  }

  // Save mapping
  matcher.saveMappingFile(matchResult, mappingPath);
  console.log(`  Saved mapping to ${mappingPath}`);

  // Step 3: Compute diffs
  console.log(`Step 3/5: Computing ${options.baseCommit ? 'three-way' : 'two-way'} diffs...`);
  const differ = new GitDiffer(repoRoot, options.baseCommit || null);
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
    baseCommit: options.baseCommit || null,
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

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

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
  baseCommit?: string;
  repoRoot?: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);

  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

  console.log('Matching files...');
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  console.log(`Computing ${options.baseCommit ? 'three-way' : 'two-way'} diffs...`);
  const differ = new GitDiffer(repoRoot, options.baseCommit || null);

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
