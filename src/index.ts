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
import { Migrator } from './migrator';

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

program
  .command('debug-match')
  .description('Debug file matching - show detailed breakdown')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .action(async (options) => {
    try {
      await runDebugMatch(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program
  .command('migrate-list')
  .description('List subtrees that can be migrated to shared')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .option('-s, --shared <path>', 'Path to shared directory', './shared')
  .option('--repo-root <path>', 'Git repository root (default: auto-detect)')
  .action(async (options) => {
    try {
      await runMigrateList(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Migrate files/subtrees to shared folder')
  .requiredOption('-r, --retail <path>', 'Path to retail app directory')
  .requiredOption('-t, --restaurant <path>', 'Path to restaurant app directory')
  .requiredOption('-s, --shared <path>', 'Path to shared directory')
  .requiredOption('-f, --files <ids>', 'Comma-separated node IDs to migrate (or "all-clean" for all clean subtrees)')
  .option('--repo-root <path>', 'Git repository root (default: auto-detect)')
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('--no-delete', 'Do not delete original files after migration')
  .action(async (options) => {
    try {
      await runMigrate(options);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  });

async function runMigrateList(options: {
  retail: string;
  restaurant: string;
  shared: string;
  repoRoot?: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const sharedPath = path.resolve(options.shared);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);

  console.log('Analyzing codebase for movable subtrees...');
  console.log(`Repo root: ${repoRoot}\n`);

  // Step 1: Parse files
  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

  console.log(`  Retail: ${retailFiles.length} files`);
  console.log(`  Restaurant: ${restaurantFiles.length} files`);

  // Step 2: Match files
  console.log('Matching files...');
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  console.log(`  Matched: ${matchResult.matched.length}`);
  console.log(`  Retail only: ${matchResult.retailOnly.length}`);
  console.log(`  Restaurant only: ${matchResult.restaurantOnly.length}`);

  // Step 3: Compute diffs (required to determine CLEAN vs CONFLICT)
  console.log('Computing diffs...');
  const differ = new GitDiffer(repoRoot, null);
  const diffResults = new Map<string, ThreeWayDiffResult>();

  let processed = 0;
  const total = matchResult.matched.length + matchResult.retailOnly.length + matchResult.restaurantOnly.length;

  for (const match of matchResult.matched) {
    const result = differ.computeThreeWayDiff(match.retailFile, match.restaurantFile);
    diffResults.set(match.retailFile, result);
    processed++;
    if (processed % 100 === 0) {
      process.stdout.write(`\r  Processed ${processed}/${total}...`);
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
  console.log(`\r  Computed ${diffResults.size} diffs`);

  // Step 4: Build graph with diff results
  console.log('Building dependency graph...');
  const config: Config = {
    repoRoot,
    retailPath,
    restaurantPath,
    sharedPath,
    baseCommit: null,
    outputPath: '',
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

  // Step 5: Analyze
  const analyzer = new GraphAnalyzer();
  const result = analyzer.analyze(nodes, edges);

  console.log(`\nDivergence summary:`);
  console.log(`  Clean:           ${result.stats.cleanFiles}`);
  console.log(`  Same change:     ${result.stats.sameChangeFiles}`);
  console.log(`  Retail only:     ${result.stats.retailOnlyFiles}`);
  console.log(`  Restaurant only: ${result.stats.restaurantOnlyFiles}`);
  console.log(`  Conflicts:       ${result.stats.conflictFiles}`);

  // Get movable subtrees
  const migrator = new Migrator(retailPath, restaurantPath, sharedPath, nodes, edges);
  const movable = migrator.getMovableSubtrees();

  console.log('\nMovable Subtrees (Clean):');
  console.log('=========================\n');

  if (movable.length === 0) {
    console.log('No clean subtrees found that can be moved to shared.');
    console.log('You may need to resolve some conflicts first.');
    return;
  }

  // Calculate totals across ALL subtrees
  let totalFiles = 0;
  let singleFileSubtrees = 0;
  let multiFileSubtrees = 0;
  for (const tree of movable) {
    totalFiles += tree.totalFiles;
    if (tree.totalFiles === 1) {
      singleFileSubtrees++;
    } else {
      multiFileSubtrees++;
    }
  }

  // Show summary first
  console.log('---');
  console.log(`Total movable subtrees: ${movable.length}`);
  console.log(`  Single-file subtrees: ${singleFileSubtrees}`);
  console.log(`  Multi-file subtrees:  ${multiFileSubtrees}`);
  console.log(`Total unique files:     ${totalFiles}`);
  console.log('');

  // Show largest subtrees (multi-file ones are most interesting)
  const multiFile = movable.filter(t => t.totalFiles > 1);
  if (multiFile.length > 0) {
    console.log(`Largest multi-file subtrees (top ${Math.min(20, multiFile.length)}):`);
    console.log('');
    for (const tree of multiFile.slice(0, 20)) {
      console.log(`${tree.rootId}`);
      console.log(`  Files: ${tree.totalFiles}`);
      if (tree.nodeIds.length <= 5) {
        for (const id of tree.nodeIds) {
          console.log(`    - ${id}`);
        }
      } else {
        for (const id of tree.nodeIds.slice(0, 3)) {
          console.log(`    - ${id}`);
        }
        console.log(`    ... and ${tree.nodeIds.length - 3} more`);
      }
      console.log('');
    }
  }
  console.log('\nTo migrate, run:');
  console.log(`  node dist/index.js migrate -r ${options.retail} -t ${options.restaurant} -s ${options.shared} -f <node-id> --dry-run`);
  console.log('\nOr migrate all clean subtrees:');
  console.log(`  node dist/index.js migrate -r ${options.retail} -t ${options.restaurant} -s ${options.shared} -f all-clean --dry-run`);
}

async function runMigrate(options: {
  retail: string;
  restaurant: string;
  shared: string;
  files: string;
  repoRoot?: string;
  dryRun: boolean;
  delete: boolean;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);
  const sharedPath = path.resolve(options.shared);
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : findGitRoot(retailPath);
  const deleteOriginals = options.delete !== false; // --no-delete sets delete to false

  console.log('Migration Tool');
  console.log('==============');
  console.log(`Retail:           ${retailPath}`);
  console.log(`Restaurant:       ${restaurantPath}`);
  console.log(`Shared:           ${sharedPath}`);
  console.log(`Repo root:        ${repoRoot}`);
  console.log(`Dry run:          ${options.dryRun}`);
  console.log(`Delete originals: ${deleteOriginals}`);
  console.log('');

  // Step 1: Parse files
  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

  // Step 2: Match files
  console.log('Matching files...');
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  // Step 3: Compute diffs
  console.log('Computing diffs...');
  const differ = new GitDiffer(repoRoot, null);
  const diffResults = new Map<string, ThreeWayDiffResult>();

  for (const match of matchResult.matched) {
    const result = differ.computeThreeWayDiff(match.retailFile, match.restaurantFile);
    diffResults.set(match.retailFile, result);
  }
  for (const filePath of matchResult.retailOnly) {
    const result = differ.computeThreeWayDiff(filePath, null);
    diffResults.set(filePath, result);
  }
  for (const filePath of matchResult.restaurantOnly) {
    const result = differ.computeThreeWayDiff(null, filePath);
    diffResults.set(filePath, result);
  }

  // Step 4: Build graph
  console.log('Building dependency graph...');
  const config: Config = {
    repoRoot,
    retailPath,
    restaurantPath,
    sharedPath,
    baseCommit: null,
    outputPath: '',
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

  // Step 5: Analyze
  const analyzer = new GraphAnalyzer();
  analyzer.analyze(nodes, edges);

  const migrator = new Migrator(retailPath, restaurantPath, sharedPath, nodes, edges);

  // Determine which files to migrate
  let nodeIds: string[];

  if (options.files === 'all-clean') {
    // Get all clean subtrees
    const movable = migrator.getMovableSubtrees();
    nodeIds = [];
    for (const tree of movable) {
      nodeIds.push(...tree.nodeIds);
    }
    // Deduplicate
    nodeIds = [...new Set(nodeIds)];
    console.log(`Selected all clean subtrees: ${nodeIds.length} files`);
  } else {
    // Parse comma-separated node IDs
    nodeIds = options.files.split(',').map(s => s.trim());
    console.log(`Selected ${nodeIds.length} nodes`);
  }

  if (nodeIds.length === 0) {
    console.log('No files selected for migration.');
    return;
  }

  // Plan migration
  console.log('\nPlanning migration...');
  const plan = migrator.planMigration(nodeIds);

  console.log(`\nMigration Plan:`);
  console.log(`  Files to move:      ${plan.stats.filesToMove}`);
  console.log(`  Files to update:    ${plan.stats.filesToUpdate}`);
  console.log(`  Imports to fix:     ${plan.stats.importsToRewrite}`);
  console.log(`  Barrel updates:     ${plan.stats.barrelUpdates}`);
  console.log(`  Files to delete:    ${plan.stats.filesToDelete}`);

  if (plan.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const warn of plan.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
  }

  // Execute
  console.log('');
  const result = migrator.executeMigration(plan, options.dryRun, deleteOriginals);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors) {
      console.log(`  ✗ ${err}`);
    }
  }

  if (options.dryRun) {
    console.log('\n=== DRY RUN COMPLETE ===');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`Moved ${plan.stats.filesToMove} files to ${sharedPath}`);
  }
}

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

  // Diagnostic: verify counts add up
  const expectedRetail = matchResult.matched.length + matchResult.retailOnly.length;
  const expectedRestaurant = matchResult.matched.length + matchResult.restaurantOnly.length;
  if (expectedRetail !== retailFiles.length) {
    console.warn(`  WARNING: Matcher missing ${retailFiles.length - expectedRetail} retail files`);
  }
  if (expectedRestaurant !== restaurantFiles.length) {
    console.warn(`  WARNING: Matcher missing ${restaurantFiles.length - expectedRestaurant} restaurant files`);
  }

  // Show sample of restaurant-only files for verification
  if (matchResult.restaurantOnly.length > 0 && matchResult.restaurantOnly.length <= 20) {
    console.log(`  Restaurant-only files:`);
    for (const f of matchResult.restaurantOnly) {
      console.log(`    - ${path.relative(restaurantPath, f)}`);
    }
  }

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

async function runDebugMatch(options: {
  retail: string;
  restaurant: string;
}) {
  const retailPath = path.resolve(options.retail);
  const restaurantPath = path.resolve(options.restaurant);

  console.log('Debug: File Matching Analysis');
  console.log('=============================\n');

  // Parse files
  console.log('Parsing files...');
  const retailParser = new AngularParser(retailPath);
  const restaurantParser = new AngularParser(restaurantPath);

  const retailFiles = retailParser.parseDirectory(retailPath, ['.ts', '.tsx', '.scss', '.html']);
  const restaurantFiles = restaurantParser.parseDirectory(restaurantPath, ['.ts', '.tsx', '.scss', '.html']);

  console.log(`Retail files:     ${retailFiles.length}`);
  console.log(`Restaurant files: ${restaurantFiles.length}\n`);

  // Match files
  const matcher = new FileMatcher(retailPath, restaurantPath);
  const matchResult = matcher.match(retailFiles, restaurantFiles);

  // Breakdown by match method
  const byMethod: Record<string, number> = {};
  for (const m of matchResult.matched) {
    byMethod[m.matchMethod] = (byMethod[m.matchMethod] || 0) + 1;
  }

  console.log('Match Methods:');
  for (const [method, count] of Object.entries(byMethod)) {
    console.log(`  ${method}: ${count}`);
  }
  console.log('');

  // Verify counts
  const accountedRetail = matchResult.matched.length + matchResult.retailOnly.length;
  const accountedRestaurant = matchResult.matched.length + matchResult.restaurantOnly.length;

  console.log('Verification:');
  console.log(`  Matched pairs:        ${matchResult.matched.length}`);
  console.log(`  Retail only:          ${matchResult.retailOnly.length}`);
  console.log(`  Restaurant only:      ${matchResult.restaurantOnly.length}`);
  console.log(`  Accounted retail:     ${accountedRetail} / ${retailFiles.length} ${accountedRetail === retailFiles.length ? '✓' : '✗ MISMATCH'}`);
  console.log(`  Accounted restaurant: ${accountedRestaurant} / ${restaurantFiles.length} ${accountedRestaurant === restaurantFiles.length ? '✓' : '✗ MISMATCH'}`);
  console.log('');

  // Show restaurant-only files
  console.log(`Restaurant-only files (${matchResult.restaurantOnly.length}):`);
  for (const f of matchResult.restaurantOnly.slice(0, 30)) {
    console.log(`  - ${path.relative(restaurantPath, f)}`);
  }
  if (matchResult.restaurantOnly.length > 30) {
    console.log(`  ... and ${matchResult.restaurantOnly.length - 30} more`);
  }
  console.log('');

  // Check for suspicious matches - restaurant files matched to very different retail paths
  console.log('Checking for potentially incorrect matches...');
  let suspicious = 0;
  for (const m of matchResult.matched) {
    const retailRel = path.relative(retailPath, m.retailFile);
    const restRel = path.relative(restaurantPath, m.restaurantFile!);

    // If matched by classname/selector but paths are very different
    if (m.matchMethod !== 'path') {
      const retailParts = retailRel.split(path.sep);
      const restParts = restRel.split(path.sep);

      // Check if they're in completely different directories
      if (retailParts[0] !== restParts[0] && retailParts.length > 2) {
        if (suspicious < 20) {
          console.log(`  ${m.matchMethod}: ${retailRel} <-> ${restRel}`);
        }
        suspicious++;
      }
    }
  }
  if (suspicious === 0) {
    console.log('  None found');
  } else if (suspicious > 20) {
    console.log(`  ... and ${suspicious - 20} more potentially suspicious matches`);
  }
  console.log('');

  // Show files by extension breakdown
  const retailByExt: Record<string, number> = {};
  const restByExt: Record<string, number> = {};

  for (const f of retailFiles) {
    const ext = path.extname(f.filePath);
    retailByExt[ext] = (retailByExt[ext] || 0) + 1;
  }
  for (const f of restaurantFiles) {
    const ext = path.extname(f.filePath);
    restByExt[ext] = (restByExt[ext] || 0) + 1;
  }

  console.log('Files by extension:');
  console.log('  Extension    Retail    Restaurant');
  const allExts = new Set([...Object.keys(retailByExt), ...Object.keys(restByExt)]);
  for (const ext of [...allExts].sort()) {
    console.log(`  ${ext.padEnd(12)} ${String(retailByExt[ext] || 0).padStart(6)}    ${String(restByExt[ext] || 0).padStart(6)}`);
  }
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
