/**
 * Migration Logic - handles moving files between branches
 *
 * DUAL-BRANCH MIGRATION:
 * - Copies files from restaurant to merged (identical to retail for clean subtrees)
 * - Deletes from BOTH retail AND restaurant
 * - Updates BOTH tsconfigs with @appMerged/* aliases
 * - Rewrites imports in BOTH branches
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Project } from 'ts-morph';
import { CleanSubtree } from '../report/types';
import { MigrationRecord, ServerConfig } from './state-types';
import { ensureMergedAliases } from './state-config';

export interface MigrationResult {
  record: MigrationRecord;
  commitHash: string;
}

/**
 * Migrate a clean subtree to merged
 */
export async function migrateSubtree(
  subtree: CleanSubtree,
  config: ServerConfig,
  emit: (line: string) => void
): Promise<MigrationResult> {
  const id = `migration-${Date.now()}`;
  const record: MigrationRecord = {
    id,
    timestamp: new Date().toISOString(),
    subtreeRoot: subtree.rootPath,
    files: subtree.files,
    fromBranch: 'retail+restaurant',
    toBranch: 'merged',
    status: 'pending',
  };

  // Paths for all three locations (absolute for ts-morph compatibility)
  const projectPath = path.resolve(config.projectPath);
  const restaurantDir = path.join(projectPath, 'apps/restaurant');
  const retailDir = path.join(projectPath, 'apps/retail');
  const destDir = path.join(projectPath, 'apps/merged');

  emit(`Migrating clean subtree: ${subtree.files.length} files`);
  emit(`  From: retail + restaurant → merged`);

  // Load ts-morph project
  emit('Loading TypeScript project...');
  const project = new Project({
    tsConfigFilePath: config.tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });
  project.addSourceFilesAtPaths(path.join(config.projectPath, 'apps', '**', 'src', '**', '*.ts'));
  emit(`Loaded ${project.getSourceFiles().length} source files`);

  // Build set of files being migrated
  // Use absolute paths since ts-morph returns absolute paths
  const migratingFiles = new Set<string>();
  const srcToDestMap = new Map<string, string>();

  for (const file of subtree.files) {
    const restaurantPath = path.resolve(restaurantDir, file);
    const retailPath = path.resolve(retailDir, file);
    const destPath = path.resolve(destDir, file);

    migratingFiles.add(restaurantPath);
    srcToDestMap.set(restaurantPath, destPath);

    if (fs.existsSync(retailPath)) {
      migratingFiles.add(retailPath);
      srcToDestMap.set(retailPath, destPath);
    }
  }

  // Find external files that import from our subtree
  const externalDependents = findExternalDependents(project, migratingFiles, emit);

  // Validate subtree has no external dependencies
  validateSubtree(project, subtree, migratingFiles, restaurantDir, retailDir, destDir, emit);

  // Create destination directories
  for (const file of subtree.files) {
    const destPath = path.join(destDir, file);
    const destDirPath = path.dirname(destPath);
    if (!fs.existsSync(destDirPath)) {
      fs.mkdirSync(destDirPath, { recursive: true });
    }
  }

  // Move files from restaurant to merged
  emit('Moving files from restaurant to merged...');
  for (const file of subtree.files) {
    const restaurantPath = path.join(restaurantDir, file);
    const destPath = path.join(destDir, file);

    const sourceFile = project.getSourceFile(restaurantPath);
    if (sourceFile) {
      sourceFile.move(destPath);
      emit(`  Moved: ${file}`);
    }
  }

  // Add merged aliases to BOTH tsconfigs
  const mergedAliases = ensureMergedAliases(config, emit);
  emit(`Merged aliases available: ${Object.keys(mergedAliases).join(', ')}`);

  // Convert path aliases in moved files
  convertAliasesInMovedFiles(project, subtree, destDir, srcToDestMap, mergedAliases, emit);

  // Update imports in external files
  updateExternalImports(externalDependents, srcToDestMap, destDir, restaurantDir, retailDir, mergedAliases, emit);

  // Save all changes
  emit('Saving changes...');
  await project.save();

  // Delete original files from BOTH branches
  deleteOriginalFiles(subtree, restaurantDir, retailDir, emit);

  // Git operations
  const parentHash = execSync('git rev-parse HEAD', {
    cwd: config.projectPath,
    encoding: 'utf-8',
  }).trim();
  record.parentCommitHash = parentHash;

  emit('Staging changes in git...');
  execSync('git add -A', { cwd: config.projectPath, encoding: 'utf-8' });

  const commitMsg = `[consolidator] Migrate ${subtree.rootPath} (${subtree.files.length} files from retail+restaurant)`;
  execSync(`git commit -m "${commitMsg}"`, { cwd: config.projectPath, encoding: 'utf-8' });

  const commitHash = execSync('git rev-parse HEAD', {
    cwd: config.projectPath,
    encoding: 'utf-8',
  }).trim();
  record.commitHash = commitHash;
  record.status = 'migrated';

  emit(`Migration complete: ${subtree.files.length} files moved to merged`);
  emit(`  Deleted from: retail + restaurant`);
  emit(`  Both tsconfigs updated with @appMerged/* aliases`);
  emit(`Commit: ${commitHash.substring(0, 8)}`);

  return { record, commitHash };
}

function findExternalDependents(
  project: Project,
  migratingFiles: Set<string>,
  emit: (line: string) => void
): Map<any, Set<string>> {
  const externalDependents: Map<any, Set<string>> = new Map();
  let restaurantCount = 0;
  let retailCount = 0;

  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    if (migratingFiles.has(sfPath)) continue;

    for (const imp of sf.getImportDeclarations()) {
      const resolved = imp.getModuleSpecifierSourceFile();
      if (resolved && migratingFiles.has(resolved.getFilePath())) {
        if (!externalDependents.has(sf)) {
          externalDependents.set(sf, new Set());
          if (sfPath.includes('/apps/restaurant/')) restaurantCount++;
          if (sfPath.includes('/apps/retail/')) retailCount++;
        }
        externalDependents.get(sf)!.add(resolved.getFilePath());
      }
    }
  }

  emit(`Found ${externalDependents.size} external files that import from this subtree`);
  emit(`  Restaurant: ${restaurantCount}, Retail: ${retailCount}`);

  return externalDependents;
}

function validateSubtree(
  project: Project,
  subtree: CleanSubtree,
  migratingFiles: Set<string>,
  restaurantDir: string,
  retailDir: string,
  destDir: string,
  emit: (line: string) => void
): void {
  emit('Validating subtree has no external dependencies...');
  const errors: string[] = [];

  // Check restaurant files
  for (const file of subtree.files) {
    const restaurantPath = path.join(restaurantDir, file);
    const sourceFile = project.getSourceFile(restaurantPath);
    if (!sourceFile) continue;

    for (const imp of sourceFile.getImportDeclarations()) {
      const specifier = imp.getModuleSpecifierValue();
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;

      const resolvedPath = resolved.getFilePath();
      if (migratingFiles.has(resolvedPath)) continue;
      if (resolvedPath.startsWith(destDir)) continue;
      if (resolvedPath.includes('node_modules')) continue;

      if (resolvedPath.includes('/apps/restaurant/') || resolvedPath.includes('/apps/retail/')) {
        errors.push(`restaurant/${path.basename(file)}: imports "${specifier}" -> ${path.basename(resolvedPath)} (NOT in migration set)`);
      }
    }
  }

  // Check retail files
  for (const file of subtree.files) {
    const retailPath = path.join(retailDir, file);
    const sourceFile = project.getSourceFile(retailPath);
    if (!sourceFile) continue;

    for (const imp of sourceFile.getImportDeclarations()) {
      const specifier = imp.getModuleSpecifierValue();
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;

      const resolvedPath = resolved.getFilePath();
      if (migratingFiles.has(resolvedPath)) continue;
      if (resolvedPath.startsWith(destDir)) continue;
      if (resolvedPath.includes('node_modules')) continue;

      if (resolvedPath.includes('/apps/restaurant/') || resolvedPath.includes('/apps/retail/')) {
        errors.push(`retail/${path.basename(file)}: imports "${specifier}" -> ${path.basename(resolvedPath)} (NOT in migration set)`);
      }
    }
  }

  if (errors.length > 0) {
    emit('');
    emit('ERROR: Cannot migrate - subtree has dependencies outside the migration set:');
    errors.forEach(err => emit(`  ${err}`));
    emit('');
    emit('This means dependency detection failed. These files should not be in a clean subtree.');
    throw new Error(`Migration blocked: ${errors.length} invalid dependencies found`);
  }

  emit('Validation passed - all imports are within subtree or merged');
}

function convertAliasesInMovedFiles(
  project: Project,
  subtree: CleanSubtree,
  destDir: string,
  srcToDestMap: Map<string, string>,
  mergedAliases: Record<string, string>,
  emit: (line: string) => void
): void {
  emit('Converting path aliases to merged aliases in moved files...');

  for (const file of subtree.files) {
    const destPath = path.join(destDir, file);
    const movedFile = project.getSourceFile(destPath);
    if (!movedFile) continue;

    for (const imp of movedFile.getImportDeclarations()) {
      const specifier = imp.getModuleSpecifierValue();

      for (const [alias, mergedAlias] of Object.entries(mergedAliases)) {
        const aliasPrefix = alias.replace('/*', '/');
        const mergedPrefix = mergedAlias.replace('/*', '/');

        if (specifier.startsWith(aliasPrefix) || specifier === alias.replace('/*', '')) {
          const resolved = imp.getModuleSpecifierSourceFile();
          if (resolved) {
            const resolvedPath = resolved.getFilePath() as string;
            if (srcToDestMap.has(resolvedPath)) {
              const newSpecifier = specifier.replace(aliasPrefix, mergedPrefix);
              if (specifier !== newSpecifier) {
                emit(`  ${path.basename(file)}: "${specifier}" → "${newSpecifier}"`);
                imp.setModuleSpecifier(newSpecifier);
              }
              break;
            }
          }
        }
      }
    }
  }
}

function updateExternalImports(
  externalDependents: Map<any, Set<string>>,
  srcToDestMap: Map<string, string>,
  destDir: string,
  restaurantDir: string,
  retailDir: string,
  mergedAliases: Record<string, string>,
  emit: (line: string) => void
): void {
  emit('Updating imports in external files (both branches) to use merged aliases...');

  for (const [extFile, _] of externalDependents) {
    for (const imp of extFile.getImportDeclarations()) {
      const specifier = imp.getModuleSpecifierValue();
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;

      const resolvedPath = resolved.getFilePath() as string;

      if (srcToDestMap.has(resolvedPath) ||
          srcToDestMap.has(resolvedPath.replace(destDir, restaurantDir)) ||
          srcToDestMap.has(resolvedPath.replace(destDir, retailDir))) {

        // Path alias imports
        for (const [alias, mergedAlias] of Object.entries(mergedAliases)) {
          const aliasPrefix = alias.replace('/*', '/');
          const mergedPrefix = mergedAlias.replace('/*', '/');

          if (specifier.startsWith(aliasPrefix) || specifier === alias.replace('/*', '')) {
            const newSpecifier = specifier.replace(aliasPrefix, mergedPrefix);
            if (specifier !== newSpecifier) {
              emit(`  ${extFile.getBaseName()}: "${specifier}" → "${newSpecifier}"`);
              imp.setModuleSpecifier(newSpecifier);
            }
            break;
          }
        }

        // Relative imports
        if (specifier.startsWith('.')) {
          const targetInMerged = srcToDestMap.get(resolvedPath) ||
                                 srcToDestMap.get(resolvedPath.replace(destDir, restaurantDir)) ||
                                 srcToDestMap.get(resolvedPath.replace(destDir, retailDir));
          if (targetInMerged) {
            const mergedRelative = targetInMerged.replace(destDir + '/src/', '');

            for (const [alias, mergedAlias] of Object.entries(mergedAliases)) {
              const aliasBase = alias.replace('/*', '').replace('@', '');
              const pathBase = aliasBase === 'app' ? 'app/' :
                               aliasBase === 'env' ? 'environments/' :
                               aliasBase + '/';

              if (mergedRelative.startsWith(pathBase) || mergedRelative.startsWith('app/') && aliasBase === 'app') {
                const suffix = mergedRelative.replace(/^app\//, '').replace(/^environments\//, '').replace(/\.ts$/, '');
                const mergedPrefix = mergedAlias.replace('/*', '/');
                const newSpecifier = mergedPrefix + suffix;
                emit(`  ${extFile.getBaseName()}: "${specifier}" → "${newSpecifier}"`);
                imp.setModuleSpecifier(newSpecifier);
                break;
              }
            }
          }
        }
      }
    }
  }
}

function deleteOriginalFiles(
  subtree: CleanSubtree,
  restaurantDir: string,
  retailDir: string,
  emit: (line: string) => void
): void {
  emit('Deleting original files from both branches...');

  // Delete from restaurant
  for (const file of subtree.files) {
    const restaurantPath = path.join(restaurantDir, file);
    if (fs.existsSync(restaurantPath)) {
      fs.unlinkSync(restaurantPath);
    }
  }
  emit(`  Deleted ${subtree.files.length} files from restaurant`);

  // Delete from retail
  let retailDeleteCount = 0;
  for (const file of subtree.files) {
    const retailPath = path.join(retailDir, file);
    if (fs.existsSync(retailPath)) {
      fs.unlinkSync(retailPath);
      retailDeleteCount++;
    }
  }
  emit(`  Deleted ${retailDeleteCount} files from retail`);

  // Clean empty directories
  const cleanEmptyDirs = (baseDir: string, branchName: string) => {
    for (const file of subtree.files) {
      const filePath = path.join(baseDir, file);
      let dir = path.dirname(filePath);
      while (dir !== baseDir && dir.startsWith(baseDir)) {
        try {
          const contents = fs.readdirSync(dir);
          if (contents.length === 0) {
            fs.rmdirSync(dir);
            emit(`  Removed empty directory: ${branchName}/${path.relative(baseDir, dir)}`);
          } else {
            break;
          }
          dir = path.dirname(dir);
        } catch {
          break;
        }
      }
    }
  };

  cleanEmptyDirs(restaurantDir, 'restaurant');
  cleanEmptyDirs(retailDir, 'retail');
}
