/**
 * Migration CLI - Migrate clean subtrees (multiple files together)
 *
 * Usage:
 *   npx ts-node src/v2/migrate-cli.ts --files <path1> <path2> ... [--dry-run]
 *
 * Example:
 *   npx ts-node src/v2/migrate-cli.ts --files app/migration-test/chain/base.ts app/migration-test/chain/consumer.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';
import { execSync } from 'child_process';

interface MigrateOptions {
  projectPath: string;
  sourceApp: 'restaurant' | 'retail';
  targetApp: 'merged';
  tsconfigPath: string;
  files: string[]; // Relative paths from apps/{sourceApp}/src/
  dryRun: boolean;
  verbose: boolean;
}

interface MigrationResult {
  success: boolean;
  movedFiles: string[];
  updatedImports: { file: string; from: string; to: string }[];
  errors: string[];
}

/**
 * Migrate a subtree (multiple files) from restaurant/retail to merged
 */
async function migrateSubtree(options: MigrateOptions): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    movedFiles: [],
    updatedImports: [],
    errors: [],
  };

  const {
    projectPath,
    sourceApp,
    targetApp,
    tsconfigPath,
    files,
    dryRun,
    verbose,
  } = options;

  const log = verbose ? console.log : () => {};

  try {
    const srcDir = path.join(projectPath, 'apps', sourceApp, 'src');
    const destDir = path.join(projectPath, 'apps', targetApp, 'src');

    log(`\nMigrating subtree: ${files.length} files`);
    files.forEach(f => log(`  - ${f}`));

    // Validate all files exist
    for (const file of files) {
      const srcFile = path.join(srcDir, file);
      if (!fs.existsSync(srcFile)) {
        result.errors.push(`Source file not found: ${srcFile}`);
        return result;
      }
    }

    // Load ts-morph project
    log(`\nLoading TypeScript project from: ${tsconfigPath}`);
    const project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
    });
    project.addSourceFilesAtPaths(path.join(projectPath, 'apps', '**', 'src', '**', '*.ts'));
    log(`  Loaded ${project.getSourceFiles().length} source files`);

    // Build set of files being migrated (absolute paths)
    const migratingFiles = new Set<string>();
    const srcToDestMap = new Map<string, string>();

    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);
      migratingFiles.add(srcPath);
      srcToDestMap.set(srcPath, destPath);
    }

    // Find external files that import from our subtree
    const externalDependents: Map<SourceFile, Set<string>> = new Map();

    for (const sf of project.getSourceFiles()) {
      const sfPath = sf.getFilePath();
      if (migratingFiles.has(sfPath)) continue; // Skip files in subtree

      for (const imp of sf.getImportDeclarations()) {
        const resolved = imp.getModuleSpecifierSourceFile();
        if (resolved && migratingFiles.has(resolved.getFilePath())) {
          if (!externalDependents.has(sf)) {
            externalDependents.set(sf, new Set());
          }
          externalDependents.get(sf)!.add(resolved.getFilePath());
        }
      }
    }

    log(`\nFound ${externalDependents.size} external files that import from this subtree`);

    if (dryRun) {
      log(`\n[DRY RUN] Would move ${files.length} files`);
      log(`[DRY RUN] Would update imports in ${externalDependents.size} external files:`);
      externalDependents.forEach((_, sf) => log(`  - ${sf.getFilePath()}`));
      result.success = true;
      result.movedFiles = files;
      return result;
    }

    // Create destination directories
    for (const file of files) {
      const destPath = path.join(destDir, file);
      const destDirPath = path.dirname(destPath);
      if (!fs.existsSync(destDirPath)) {
        fs.mkdirSync(destDirPath, { recursive: true });
        log(`  Created directory: ${destDirPath}`);
      }
    }

    // Move all files in the subtree
    // Since they move together, relative imports between them stay unchanged
    log(`\nMoving files...`);
    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);

      const sourceFile = project.getSourceFile(srcPath);
      if (sourceFile) {
        sourceFile.move(destPath);
        result.movedFiles.push(file);
        log(`  Moved: ${file}`);
      }
    }

    // Update imports in external files to point to merged
    log(`\nUpdating imports in external files...`);
    for (const [extFile, importedPaths] of externalDependents) {
      for (const imp of extFile.getImportDeclarations()) {
        const resolved = imp.getModuleSpecifierSourceFile();
        if (!resolved) continue;

        const resolvedPath = resolved.getFilePath();
        const destPath = srcToDestMap.get(resolvedPath.replace(destDir, srcDir)) ||
                         srcToDestMap.get(resolvedPath);

        if (destPath && resolved.getFilePath() === destPath) {
          const oldSpecifier = imp.getModuleSpecifierValue();

          // Calculate new relative path from external file to merged location
          const extFileDir = path.dirname(extFile.getFilePath());
          let newPath = path.relative(extFileDir, destPath);
          newPath = newPath.replace(/\.ts$/, '');
          if (!newPath.startsWith('.')) {
            newPath = './' + newPath;
          }

          result.updatedImports.push({
            file: extFile.getFilePath(),
            from: oldSpecifier,
            to: newPath,
          });

          log(`  ${extFile.getBaseName()}: "${oldSpecifier}" → "${newPath}"`);
          imp.setModuleSpecifier(newPath);
        }
      }
    }

    // Save all changes
    log(`\nSaving changes...`);
    await project.save();

    // Delete original files
    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      if (fs.existsSync(srcPath)) {
        fs.unlinkSync(srcPath);
      }
    }

    // Clean up empty directories
    for (const file of files) {
      const srcPath = path.join(srcDir, file);
      let dir = path.dirname(srcPath);
      while (dir !== srcDir) {
        try {
          const contents = fs.readdirSync(dir);
          if (contents.length === 0) {
            fs.rmdirSync(dir);
            log(`  Removed empty directory: ${dir}`);
          } else {
            break;
          }
          dir = path.dirname(dir);
        } catch {
          break;
        }
      }
    }

    result.success = true;
    log(`\nMigration complete!`);

  } catch (error: any) {
    result.errors.push(error.message);
    console.error(`Migration error: ${error.message}`);
    if (error.stack) console.error(error.stack);
  }

  return result;
}

/**
 * Verify builds pass after migration
 */
function verifyBuilds(projectPath: string): { restaurant: boolean; retail: boolean } {
  const results = { restaurant: false, retail: false };

  console.log('\nVerifying builds...');

  try {
    console.log('  Building restaurant...');
    execSync('npx nx build restaurant', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120000,
    });
    results.restaurant = true;
    console.log('  ✅ restaurant builds');
  } catch (e: any) {
    console.log('  ❌ restaurant FAILED');
    console.log(e.stdout?.toString().slice(-1000) || e.message);
  }

  try {
    console.log('  Building retail...');
    execSync('npx nx build retail', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120000,
    });
    results.retail = true;
    console.log('  ✅ retail builds');
  } catch (e: any) {
    console.log('  ❌ retail FAILED');
    console.log(e.stdout?.toString().slice(-1000) || e.message);
  }

  return results;
}

/**
 * Rollback using git
 */
function rollback(projectPath: string): void {
  console.log('\nRolling back changes...');
  try {
    execSync('git checkout HEAD -- .', { cwd: projectPath, stdio: 'pipe' });
    execSync('git clean -fd', { cwd: projectPath, stdio: 'pipe' });
    console.log('  Rollback complete');
  } catch (e: any) {
    console.error('  Rollback failed:', e.message);
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  // Parse args
  const filesIndex = args.indexOf('--files');
  let files: string[] = [];
  if (filesIndex >= 0) {
    // Collect all args after --files until we hit another flag or end
    for (let i = filesIndex + 1; i < args.length; i++) {
      if (args[i].startsWith('-')) break;  // Stop at any flag
      files.push(args[i]);
    }
  }

  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const noVerify = args.includes('--no-verify');
  const autoRollback = args.includes('--auto-rollback');

  if (files.length === 0) {
    console.log(`
Migration CLI - Migrate clean subtrees (multiple files together)

Usage:
  npx ts-node src/v2/migrate-cli.ts --files <path1> <path2> ... [options]

Options:
  --files <paths>   Relative paths from apps/restaurant/src/ (required)
  --dry-run         Show what would happen without making changes
  --verbose, -v     Show detailed output
  --no-verify       Skip build verification
  --auto-rollback   Automatically rollback if builds fail

Examples:
  # Migrate a single leaf file
  npx ts-node src/v2/migrate-cli.ts --files app/migration-test/leaf-only.ts -v

  # Migrate a subtree (files that depend on each other)
  npx ts-node src/v2/migrate-cli.ts --files app/migration-test/chain/base.ts app/migration-test/chain/consumer.ts -v
`);
    process.exit(1);
  }

  // Config
  // Resolve test-fixture relative to project root
  const projectPath = path.resolve(process.cwd(), 'test-fixture');
  const tsconfigPath = path.join(projectPath, 'apps/restaurant/tsconfig.app.json');

  console.log('='.repeat(60));
  console.log('Migration CLI - Subtree Migration');
  console.log('='.repeat(60));
  console.log(`Project: ${projectPath}`);
  console.log(`Files: ${files.length}`);
  files.forEach(f => console.log(`  - ${f}`));
  console.log(`Dry run: ${dryRun}`);

  // Run migration
  const result = await migrateSubtree({
    projectPath,
    sourceApp: 'restaurant',
    targetApp: 'merged',
    tsconfigPath,
    files,
    dryRun,
    verbose,
  });

  console.log('\n' + '='.repeat(60));
  console.log('Migration Result');
  console.log('='.repeat(60));
  console.log(`Success: ${result.success}`);
  console.log(`Moved files: ${result.movedFiles.length}`);
  console.log(`Updated external imports: ${result.updatedImports.length}`);

  if (result.updatedImports.length > 0) {
    console.log('\nExternal import updates:');
    result.updatedImports.forEach(u => {
      console.log(`  ${path.basename(u.file)}: "${u.from}" → "${u.to}"`);
    });
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  // Verify builds
  if (!dryRun && !noVerify && result.success) {
    const builds = verifyBuilds(projectPath);

    if (!builds.restaurant || !builds.retail) {
      console.log('\n⚠️  BUILD FAILED');

      if (autoRollback) {
        rollback(projectPath);
      } else {
        console.log('Run with --auto-rollback to automatically revert, or manually:');
        console.log(`  cd ${projectPath} && git checkout HEAD -- . && git clean -fd`);
      }

      process.exit(1);
    }

    console.log('\n✅ All builds pass!');
  }
}

main().catch(console.error);
