/**
 * Server State Management
 * Tracks migrations, build status, and enables rollback
 *
 * DUAL-BRANCH MIGRATION:
 * - Copies files from restaurant to merged (identical to retail for clean subtrees)
 * - Deletes from BOTH retail AND restaurant
 * - Updates BOTH tsconfigs with @appMerged/* aliases
 * - Rewrites imports in BOTH branches
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn, ChildProcess } from 'child_process';
import { Project } from 'ts-morph';
import { AnalysisReport, CleanSubtree } from '../report/types';

export interface MigrationRecord {
  id: string;
  timestamp: string;
  subtreeRoot: string;
  files: string[];
  fromBranch: string;
  toBranch: string;
  status: 'pending' | 'migrated' | 'built' | 'rolled-back';
  commitHash?: string;        // Git commit hash for this migration
  parentCommitHash?: string;  // Commit hash before this migration (for rollback)
}

export interface ServerConfig {
  projectPath: string;       // Path to project
  retailBranch: string;      // e.g., 'retail'
  restaurantBranch: string;  // e.g., 'restaurant'
  sharedPath: string;        // e.g., 'libs/shared'
  tsconfigPath: string;      // Path to tsconfig
  buildCommand: string;      // e.g., 'nx build restaurant'
}

export interface ServerState {
  config: ServerConfig | null;
  report: AnalysisReport | null;
  migrations: MigrationRecord[];
  redoStack: MigrationRecord[];  // Migrations that were undone (can redo)
  currentCommit: string | null;   // Current HEAD commit hash
  currentBuild: {
    running: boolean;
    output: string[];
    exitCode: number | null;
  };
  lastError: string | null;
}

export class StateManager {
  private state: ServerState = {
    config: null,
    report: null,
    migrations: [],
    redoStack: [],
    currentCommit: null,
    currentBuild: {
      running: false,
      output: [],
      exitCode: null,
    },
    lastError: null,
  };

  private buildProcess: ChildProcess | null = null;
  private outputListeners: ((line: string) => void)[] = [];
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), '.consolidator-config.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        this.state.config = JSON.parse(data);
        console.log('Loaded config from', this.configPath);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }

  saveConfig(config: ServerConfig): void {
    this.state.config = config;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    console.log('Saved config to', this.configPath);
  }

  getState(): ServerState {
    return this.state;
  }

  getConfig(): ServerConfig | null {
    return this.state.config;
  }

  setReport(report: AnalysisReport): void {
    this.state.report = report;
  }

  getReport(): AnalysisReport | null {
    return this.state.report;
  }

  // Subscribe to build output
  onBuildOutput(listener: (line: string) => void): () => void {
    this.outputListeners.push(listener);
    return () => {
      this.outputListeners = this.outputListeners.filter(l => l !== listener);
    };
  }

  private emitOutput(line: string): void {
    this.state.currentBuild.output.push(line);
    // Keep last 500 lines
    if (this.state.currentBuild.output.length > 500) {
      this.state.currentBuild.output.shift();
    }
    this.outputListeners.forEach(l => l(line));
  }

  /**
   * Parse a tsconfig file (handles JSON5 - comments, trailing commas)
   */
  private parseTsconfig(tsconfigPath: string): any {
    const content = fs.readFileSync(tsconfigPath, 'utf-8');
    const strings: string[] = [];
    let cleaned = content.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
      const idx = strings.length;
      strings.push(match);
      return `__STRING_${idx}__`;
    });
    cleaned = cleaned.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    cleaned = cleaned.replace(/__STRING_(\d+)__/g, (_, idx) => strings[parseInt(idx)]);
    cleaned = cleaned.replace(/,(\s*[\}\]])/g, '$1');
    return JSON.parse(cleaned);
  }

  /**
   * Ensure merged aliases exist in a single tsconfig
   */
  private ensureMergedAliasesForTsconfig(tsconfigPath: string, branchName: string): Record<string, string> {
    this.emitOutput(`  Checking ${branchName} tsconfig: ${path.basename(tsconfigPath)}`);

    const tsconfig = this.parseTsconfig(tsconfigPath);
    const paths = tsconfig.compilerOptions?.paths || {};

    // Build map of original -> merged aliases
    const aliasMap: Record<string, string> = {};
    const newPaths: Record<string, string[]> = { ...paths };
    let modified = false;

    for (const [alias, targets] of Object.entries(paths)) {
      // Skip if already a merged alias or external
      if (alias.includes('Merged') || alias === 'shared/*') continue;

      // Create merged version: @app/* -> @appMerged/*
      const baseName = alias.replace('@', '').replace('/*', '');
      const mergedAlias = `@${baseName}Merged/*`;

      aliasMap[alias] = mergedAlias;

      // Add merged alias if not already present
      if (!paths[mergedAlias]) {
        // Calculate path to merged: ../../merged/src/app/* for @app/*
        const originalTarget = (targets as string[])[0];
        const mergedTarget = `../../merged/src/${originalTarget}`;

        newPaths[mergedAlias] = [mergedTarget];
        modified = true;
        this.emitOutput(`    Adding alias: ${mergedAlias} -> ${mergedTarget}`);
      }
    }

    // Write updated tsconfig if modified
    if (modified) {
      tsconfig.compilerOptions = tsconfig.compilerOptions || {};
      tsconfig.compilerOptions.paths = newPaths;
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
      this.emitOutput(`    Updated ${branchName} tsconfig`);
    } else {
      this.emitOutput(`    ${branchName} tsconfig already has merged aliases`);
    }

    return aliasMap;
  }

  /**
   * Ensure merged aliases exist in BOTH retail and restaurant tsconfigs
   */
  private ensureMergedAliases(config: ServerConfig): Record<string, string> {
    this.emitOutput('Adding @appMerged/* aliases to both tsconfigs...');

    // Find both tsconfig files
    const restaurantTsconfig = path.join(config.projectPath, 'apps/restaurant/tsconfig.app.json');
    const retailTsconfig = path.join(config.projectPath, 'apps/retail/tsconfig.app.json');

    // Update restaurant tsconfig
    const aliasMap = this.ensureMergedAliasesForTsconfig(
      fs.existsSync(restaurantTsconfig) ? restaurantTsconfig : config.tsconfigPath,
      'restaurant'
    );

    // Update retail tsconfig if it exists
    if (fs.existsSync(retailTsconfig)) {
      this.ensureMergedAliasesForTsconfig(retailTsconfig, 'retail');
    } else {
      this.emitOutput(`  Retail tsconfig not found at ${retailTsconfig}, skipping`);
    }

    return aliasMap;
  }

  /**
   * Migrate a clean subtree to merged
   *
   * DUAL-BRANCH HANDLING:
   * - Copy files from restaurant to merged (restaurant and retail are identical for clean subtrees)
   * - Delete from BOTH retail AND restaurant
   * - Update imports in BOTH branches that point to migrated files
   * - Add @appMerged/* aliases to BOTH tsconfigs
   */
  async migrate(subtree: CleanSubtree): Promise<MigrationRecord> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    const id = `migration-${Date.now()}`;
    const record: MigrationRecord = {
      id,
      timestamp: new Date().toISOString(),
      subtreeRoot: subtree.rootPath,
      files: subtree.files,
      fromBranch: 'retail+restaurant',  // Both branches!
      toBranch: 'merged',
      status: 'pending',
    };

    try {
      // Paths for all three locations
      const restaurantDir = path.join(config.projectPath, 'apps/restaurant');
      const retailDir = path.join(config.projectPath, 'apps/retail');
      const destDir = path.join(config.projectPath, 'apps/merged');

      this.emitOutput(`Migrating clean subtree: ${subtree.files.length} files`);
      this.emitOutput(`  From: retail + restaurant → merged`);

      // Load ts-morph project with ALL apps
      this.emitOutput('Loading TypeScript project...');
      const project = new Project({
        tsConfigFilePath: config.tsconfigPath,
        skipAddingFilesFromTsConfig: false,
      });
      project.addSourceFilesAtPaths(path.join(config.projectPath, 'apps', '**', 'src', '**', '*.ts'));
      this.emitOutput(`Loaded ${project.getSourceFiles().length} source files`);

      // Build set of files being migrated - track BOTH branches
      const migratingFiles = new Set<string>();
      const srcToDestMap = new Map<string, string>();

      for (const file of subtree.files) {
        const restaurantPath = path.join(restaurantDir, file);
        const retailPath = path.join(retailDir, file);
        const destPath = path.join(destDir, file);

        // Track restaurant files
        migratingFiles.add(restaurantPath);
        srcToDestMap.set(restaurantPath, destPath);

        // Track retail files (same relative path)
        if (fs.existsSync(retailPath)) {
          migratingFiles.add(retailPath);
          srcToDestMap.set(retailPath, destPath);
        }
      }

      // Find external files that import from our subtree - check BOTH branches
      const externalDependents: Map<any, Set<string>> = new Map();
      let restaurantDependentCount = 0;
      let retailDependentCount = 0;

      for (const sf of project.getSourceFiles()) {
        const sfPath = sf.getFilePath();
        if (migratingFiles.has(sfPath)) continue;

        for (const imp of sf.getImportDeclarations()) {
          const resolved = imp.getModuleSpecifierSourceFile();
          if (resolved && migratingFiles.has(resolved.getFilePath())) {
            if (!externalDependents.has(sf)) {
              externalDependents.set(sf, new Set());
              if (sfPath.includes('/apps/restaurant/')) restaurantDependentCount++;
              if (sfPath.includes('/apps/retail/')) retailDependentCount++;
            }
            externalDependents.get(sf)!.add(resolved.getFilePath());
          }
        }
      }

      this.emitOutput(`Found ${externalDependents.size} external files that import from this subtree`);
      this.emitOutput(`  Restaurant: ${restaurantDependentCount}, Retail: ${retailDependentCount}`);

      // SAFETY CHECK: Verify no file in subtree imports from restaurant/retail (outside subtree)
      this.emitOutput('Validating subtree has no external dependencies...');
      const validationErrors: string[] = [];

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
            validationErrors.push(`restaurant/${path.basename(file)}: imports "${specifier}" -> ${path.basename(resolvedPath)} (NOT in migration set)`);
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
            validationErrors.push(`retail/${path.basename(file)}: imports "${specifier}" -> ${path.basename(resolvedPath)} (NOT in migration set)`);
          }
        }
      }

      if (validationErrors.length > 0) {
        this.emitOutput('');
        this.emitOutput('ERROR: Cannot migrate - subtree has dependencies outside the migration set:');
        validationErrors.forEach(err => this.emitOutput(`  ${err}`));
        this.emitOutput('');
        this.emitOutput('This means dependency detection failed. These files should not be in a clean subtree.');
        throw new Error(`Migration blocked: ${validationErrors.length} invalid dependencies found`);
      }

      this.emitOutput('Validation passed - all imports are within subtree or merged');

      // Create destination directories
      for (const file of subtree.files) {
        const destPath = path.join(destDir, file);
        const destDirPath = path.dirname(destPath);
        if (!fs.existsSync(destDirPath)) {
          fs.mkdirSync(destDirPath, { recursive: true });
        }
      }

      // Move files from restaurant to merged
      this.emitOutput('Moving files from restaurant to merged...');
      for (const file of subtree.files) {
        const restaurantPath = path.join(restaurantDir, file);
        const destPath = path.join(destDir, file);

        const sourceFile = project.getSourceFile(restaurantPath);
        if (sourceFile) {
          sourceFile.move(destPath);
          this.emitOutput(`  Moved: ${file}`);
        }
      }

      // Add merged aliases to BOTH tsconfigs
      const mergedAliases = this.ensureMergedAliases(config);
      this.emitOutput(`Merged aliases available: ${Object.keys(mergedAliases).join(', ')}`);

      // Convert path aliases in moved files: @app/ -> @appMerged/
      this.emitOutput('Converting path aliases to merged aliases in moved files...');
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
                    this.emitOutput(`  ${path.basename(file)}: "${specifier}" → "${newSpecifier}"`);
                    imp.setModuleSpecifier(newSpecifier);
                  }
                  break;
                }
              }
            }
          }
        }
      }

      // Update imports in external files (BOTH branches) to use merged aliases
      this.emitOutput('Updating imports in external files (both branches) to use merged aliases...');
      for (const [extFile, _] of externalDependents) {
        for (const imp of extFile.getImportDeclarations()) {
          const specifier = imp.getModuleSpecifierValue();
          const resolved = imp.getModuleSpecifierSourceFile();
          if (!resolved) continue;

          const resolvedPath = resolved.getFilePath() as string;

          // Check if this import points to a migrated file (check all source paths)
          if (srcToDestMap.has(resolvedPath) ||
              srcToDestMap.has(resolvedPath.replace(destDir, restaurantDir)) ||
              srcToDestMap.has(resolvedPath.replace(destDir, retailDir))) {

            // Check if it's a path alias
            for (const [alias, mergedAlias] of Object.entries(mergedAliases)) {
              const aliasPrefix = alias.replace('/*', '/');
              const mergedPrefix = mergedAlias.replace('/*', '/');

              if (specifier.startsWith(aliasPrefix) || specifier === alias.replace('/*', '')) {
                const newSpecifier = specifier.replace(aliasPrefix, mergedPrefix);
                if (specifier !== newSpecifier) {
                  this.emitOutput(`  ${extFile.getBaseName()}: "${specifier}" → "${newSpecifier}"`);
                  imp.setModuleSpecifier(newSpecifier);
                }
                break;
              }
            }

            // If it's a relative import, convert to merged alias
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
                    this.emitOutput(`  ${extFile.getBaseName()}: "${specifier}" → "${newSpecifier}"`);
                    imp.setModuleSpecifier(newSpecifier);
                    break;
                  }
                }
              }
            }
          }
        }
      }

      // Save all changes
      this.emitOutput('Saving changes...');
      await project.save();

      // Delete original files from BOTH branches
      this.emitOutput('Deleting original files from both branches...');

      // Delete from restaurant
      for (const file of subtree.files) {
        const restaurantPath = path.join(restaurantDir, file);
        if (fs.existsSync(restaurantPath)) {
          fs.unlinkSync(restaurantPath);
        }
      }
      this.emitOutput(`  Deleted ${subtree.files.length} files from restaurant`);

      // Delete from retail
      let retailDeleteCount = 0;
      for (const file of subtree.files) {
        const retailPath = path.join(retailDir, file);
        if (fs.existsSync(retailPath)) {
          fs.unlinkSync(retailPath);
          retailDeleteCount++;
        }
      }
      this.emitOutput(`  Deleted ${retailDeleteCount} files from retail`);

      // Clean up empty directories in BOTH branches
      const cleanEmptyDirs = (baseDir: string, branchName: string) => {
        for (const file of subtree.files) {
          const filePath = path.join(baseDir, file);
          let dir = path.dirname(filePath);
          while (dir !== baseDir && dir.startsWith(baseDir)) {
            try {
              const contents = fs.readdirSync(dir);
              if (contents.length === 0) {
                fs.rmdirSync(dir);
                this.emitOutput(`  Removed empty directory: ${branchName}/${path.relative(baseDir, dir)}`);
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

      // Get current commit hash (before migration)
      const parentHash = execSync('git rev-parse HEAD', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      }).trim();
      record.parentCommitHash = parentHash;

      // Stage all changes in git
      this.emitOutput('Staging changes in git...');
      execSync('git add -A', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Create commit for this migration
      const commitMsg = `[consolidator] Migrate ${subtree.rootPath} (${subtree.files.length} files from retail+restaurant)`;
      execSync(`git commit -m "${commitMsg}"`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Get the new commit hash
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      }).trim();
      record.commitHash = commitHash;

      record.status = 'migrated';
      this.state.migrations.push(record);
      this.state.currentCommit = commitHash;

      // Clear redo stack - new migration invalidates any "future" that was undone
      if (this.state.redoStack.length > 0) {
        this.emitOutput(`Clearing ${this.state.redoStack.length} redo entries (new timeline branch)`);
        this.state.redoStack = [];
      }

      this.emitOutput(`Migration complete: ${subtree.files.length} files moved to merged`);
      this.emitOutput(`  Deleted from: retail + restaurant`);
      this.emitOutput(`  Both tsconfigs updated with @appMerged/* aliases`);
      this.emitOutput(`Commit: ${commitHash.substring(0, 8)}`);

      return record;
    } catch (e: any) {
      record.status = 'rolled-back';
      this.state.lastError = e.message;
      this.emitOutput(`Migration error: ${e.message}`);
      if (e.stack) {
        this.emitOutput(e.stack);
      }
      throw e;
    }
  }

  /**
   * Run build command
   */
  async build(): Promise<{ success: boolean; output: string[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    if (this.state.currentBuild.running) {
      throw new Error('Build already running');
    }

    this.state.currentBuild = {
      running: true,
      output: [],
      exitCode: null,
    };

    this.emitOutput(`$ ${config.buildCommand}`);

    return new Promise((resolve) => {
      const [cmd, ...args] = config.buildCommand.split(' ');

      this.buildProcess = spawn(cmd, args, {
        cwd: config.projectPath,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      this.buildProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) this.emitOutput(line);
        });
      });

      this.buildProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) this.emitOutput(line);
        });
      });

      this.buildProcess.on('close', (code) => {
        this.state.currentBuild.running = false;
        this.state.currentBuild.exitCode = code;
        this.buildProcess = null;

        if (code === 0) {
          this.emitOutput('Build succeeded!');
          const lastMigration = this.state.migrations[this.state.migrations.length - 1];
          if (lastMigration && lastMigration.status === 'migrated') {
            lastMigration.status = 'built';
          }
        } else {
          this.emitOutput(`Build failed with exit code ${code}`);
          this.state.lastError = this.state.currentBuild.output.join('\n');
        }

        resolve({
          success: code === 0,
          output: this.state.currentBuild.output,
        });
      });
    });
  }

  /**
   * Rollback (undo) to a specific migration point
   * Rolled-back migrations go to the redo stack
   */
  async rollback(migrationId?: string): Promise<{ rolledBack: MigrationRecord[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    const activeMigrations = this.state.migrations.filter(m => m.status !== 'rolled-back');
    if (activeMigrations.length === 0) {
      throw new Error('No migrations to rollback');
    }

    let targetIndex: number;
    if (migrationId) {
      targetIndex = activeMigrations.findIndex(m => m.id === migrationId);
      if (targetIndex === -1) {
        throw new Error(`Migration ${migrationId} not found`);
      }
    } else {
      targetIndex = activeMigrations.length - 1;
    }

    const targetMigration = activeMigrations[targetIndex];
    const migrationsToRollback = activeMigrations.slice(targetIndex);

    this.emitOutput(`Rolling back ${migrationsToRollback.length} migration(s) to before: ${targetMigration.subtreeRoot}`);

    try {
      const targetCommit = targetMigration.parentCommitHash;
      if (!targetCommit) {
        throw new Error('Migration has no parent commit hash - cannot rollback');
      }

      this.emitOutput(`Resetting to commit: ${targetCommit.substring(0, 8)}`);

      execSync(`git reset --hard ${targetCommit}`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      for (const m of migrationsToRollback) {
        m.status = 'rolled-back';
      }

      this.state.redoStack = [...migrationsToRollback.slice().reverse(), ...this.state.redoStack];
      this.state.currentCommit = targetCommit;

      this.emitOutput(`Rollback complete - ${migrationsToRollback.length} migration(s) undone`);
      this.emitOutput(`Redo stack now has ${this.state.redoStack.length} migration(s)`);
      return { rolledBack: migrationsToRollback };
    } catch (e: any) {
      this.state.lastError = e.message;
      this.emitOutput(`Rollback error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Fast-forward (redo) to a specific migration
   */
  async fastForward(migrationId?: string): Promise<{ redone: MigrationRecord[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    if (this.state.redoStack.length === 0) {
      throw new Error('Nothing to redo');
    }

    let targetIndex: number;
    if (migrationId) {
      targetIndex = this.state.redoStack.findIndex(m => m.id === migrationId);
      if (targetIndex === -1) {
        throw new Error(`Migration ${migrationId} not found in redo stack`);
      }
    } else {
      targetIndex = this.state.redoStack.length - 1;
    }

    const migrationsToRedo = this.state.redoStack.slice(targetIndex);

    this.emitOutput(`Redoing ${migrationsToRedo.length} migration(s)`);

    try {
      const targetMigration = migrationsToRedo[0];
      const targetCommit = targetMigration.commitHash;

      if (!targetCommit) {
        throw new Error('Migration has no commit hash - cannot redo');
      }

      this.emitOutput(`Fast-forwarding to commit: ${targetCommit.substring(0, 8)}`);

      execSync(`git reset --hard ${targetCommit}`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      for (const m of migrationsToRedo) {
        m.status = 'migrated';
      }

      this.state.redoStack = this.state.redoStack.slice(0, targetIndex);
      this.state.currentCommit = targetCommit;

      this.emitOutput(`Redo complete - ${migrationsToRedo.length} migration(s) restored`);
      return { redone: migrationsToRedo };
    } catch (e: any) {
      this.state.lastError = e.message;
      this.emitOutput(`Redo error: ${e.message}`);
      throw e;
    }
  }

  getActiveMigrations(): MigrationRecord[] {
    return this.state.migrations.filter(m => m.status !== 'rolled-back');
  }

  getRedoStack(): MigrationRecord[] {
    return this.state.redoStack;
  }

  stopBuild(): void {
    if (this.buildProcess) {
      this.buildProcess.kill('SIGTERM');
      this.emitOutput('Build cancelled');
    }
  }

  getErrorsForClaude(): string {
    const output = this.state.currentBuild.output;

    const errorLines = output.filter(line =>
      line.includes('error') ||
      line.includes('Error') ||
      line.includes('ERROR') ||
      line.includes('fatal') ||
      line.includes('Fatal') ||
      line.includes('Cannot find') ||
      line.includes('not found') ||
      line.includes('failed') ||
      line.includes('Failed') ||
      line.includes('TS') ||
      line.includes('✖') ||
      line.includes('ENOENT') ||
      line.includes('Module build failed')
    );

    const recentOutput = output.slice(-30);
    const lastMigration = this.state.migrations[this.state.migrations.length - 1];

    return `Build/Migration errors from Branch consolidation:

**Error lines:**
\`\`\`
${errorLines.length > 0 ? errorLines.slice(-30).join('\n') : '(no specific error lines detected)'}
\`\`\`

**Recent output:**
\`\`\`
${recentOutput.join('\n')}
\`\`\`

**Context:**
- Last migrated subtree: ${lastMigration?.subtreeRoot || 'none'}
- Files moved: ${lastMigration?.files.length || 0}
- Migration status: ${lastMigration?.status || 'none'}
- Last error: ${this.state.lastError || 'none'}
`;
  }
}

export const stateManager = new StateManager();
