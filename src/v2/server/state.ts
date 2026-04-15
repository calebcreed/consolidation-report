/**
 * Server State Management
 * Tracks migrations, build status, and enables rollback
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
  projectPath: string;       // Path to webpos project
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
   * Migrate a clean subtree to merged
   *
   * Key insight: Files in a clean subtree move TOGETHER, so their relative
   * imports to each other stay unchanged. Only external files that import
   * FROM the subtree need their imports updated.
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
      fromBranch: config.restaurantBranch,
      toBranch: 'merged',
      status: 'pending',
    };

    try {
      // Note: subtree.files are like "src/app/foo.ts", so srcDir/destDir should NOT include /src
      const srcDir = path.join(config.projectPath, 'apps/restaurant');
      const destDir = path.join(config.projectPath, 'apps/merged');

      this.emitOutput(`Migrating clean subtree: ${subtree.files.length} files`);

      // Load ts-morph project
      this.emitOutput('Loading TypeScript project...');
      const project = new Project({
        tsConfigFilePath: config.tsconfigPath,
        skipAddingFilesFromTsConfig: false,
      });
      project.addSourceFilesAtPaths(path.join(config.projectPath, 'apps', '**', 'src', '**', '*.ts'));
      this.emitOutput(`Loaded ${project.getSourceFiles().length} source files`);

      // Build set of files being migrated
      const migratingFiles = new Set<string>();
      const srcToDestMap = new Map<string, string>();

      for (const file of subtree.files) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);
        migratingFiles.add(srcPath);
        srcToDestMap.set(srcPath, destPath);
      }

      // Find external files that import from our subtree
      const externalDependents: Map<any, Set<string>> = new Map();

      for (const sf of project.getSourceFiles()) {
        const sfPath = sf.getFilePath();
        if (migratingFiles.has(sfPath)) continue;

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

      this.emitOutput(`Found ${externalDependents.size} external files that import from this subtree`);

      // SAFETY CHECK: Verify no file in subtree imports from restaurant/retail (outside subtree)
      // This catches dependency detection failures before we corrupt the codebase
      this.emitOutput('Validating subtree has no external dependencies...');
      const validationErrors: string[] = [];

      for (const file of subtree.files) {
        const srcPath = path.join(srcDir, file);
        const sourceFile = project.getSourceFile(srcPath);
        if (!sourceFile) continue;

        for (const imp of sourceFile.getImportDeclarations()) {
          const specifier = imp.getModuleSpecifierValue();
          const resolved = imp.getModuleSpecifierSourceFile();

          if (!resolved) continue;

          const resolvedPath = resolved.getFilePath();

          // Skip if target is in the migration set
          if (migratingFiles.has(resolvedPath)) continue;

          // Skip if target is already in merged
          if (resolvedPath.startsWith(destDir)) continue;

          // Skip external packages
          if (resolvedPath.includes('node_modules')) continue;

          // This import points to restaurant/retail but target is NOT migrating - BAD!
          if (resolvedPath.includes('/apps/restaurant/') || resolvedPath.includes('/apps/retail/')) {
            validationErrors.push(`${path.basename(file)}: imports "${specifier}" -> ${path.basename(resolvedPath)} (NOT in migration set)`);
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

      // Move all files in the subtree together
      this.emitOutput('Moving files...');
      for (const file of subtree.files) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, file);

        const sourceFile = project.getSourceFile(srcPath);
        if (sourceFile) {
          sourceFile.move(destPath);
          this.emitOutput(`  Moved: ${file}`);
        }
      }

      // Fix imports in moved files:
      // ALL path aliases must become relative paths because:
      // - Restaurant build uses restaurant's tsconfig
      // - @app/* resolves to restaurant/src/app/* even for files in merged
      // - So @app/utils/foo in merged would wrongly point to restaurant!
      this.emitOutput('Converting path aliases to relative paths in moved files...');
      for (const file of subtree.files) {
        const destPath = path.join(destDir, file);
        const movedFile = project.getSourceFile(destPath);
        if (!movedFile) continue;

        const movedFileDir = path.dirname(destPath);

        for (const imp of movedFile.getImportDeclarations()) {
          const specifier = imp.getModuleSpecifierValue();

          // Skip npm packages
          if (specifier.startsWith('@angular/') ||
              specifier.startsWith('@ngrx/') ||
              specifier.startsWith('@ionic/') ||
              specifier.startsWith('@capacitor/') ||
              specifier.startsWith('rxjs') ||
              (!specifier.startsWith('.') && !specifier.startsWith('@'))) {
            continue;
          }

          const resolved = imp.getModuleSpecifierSourceFile();
          if (!resolved) continue;

          const resolvedPath = resolved.getFilePath() as string;

          // Calculate correct relative path
          // The resolved path might point to restaurant (ts-morph resolved via old tsconfig)
          // but the file is now in merged, so we need to point to merged version
          let targetPath: string = resolvedPath;

          // If resolved to restaurant, check if that file was also migrated
          if (resolvedPath.includes('/apps/restaurant/')) {
            const originalSrcPath = resolvedPath;
            if (srcToDestMap.has(originalSrcPath)) {
              targetPath = srcToDestMap.get(originalSrcPath)!;
            }
          }

          // If target is in merged, create relative path within merged
          if (targetPath.startsWith(destDir) || srcToDestMap.has(resolvedPath)) {
            const actualTarget = srcToDestMap.get(resolvedPath) || targetPath;
            let newSpecifier = path.relative(movedFileDir, actualTarget);
            newSpecifier = newSpecifier.replace(/\.ts$/, '');
            if (!newSpecifier.startsWith('.')) {
              newSpecifier = './' + newSpecifier;
            }

            if (specifier !== newSpecifier) {
              this.emitOutput(`  ${path.basename(file)}: "${specifier}" → "${newSpecifier}"`);
              imp.setModuleSpecifier(newSpecifier);
            }
          }
        }
      }

      // Update imports in external files to point to merged
      this.emitOutput('Updating imports in external files...');
      for (const [extFile, _] of externalDependents) {
        for (const imp of extFile.getImportDeclarations()) {
          const resolved = imp.getModuleSpecifierSourceFile();
          if (!resolved) continue;

          const resolvedPath = resolved.getFilePath();
          const originalSrcPath = resolvedPath.replace(destDir, srcDir);
          const destPath = srcToDestMap.get(originalSrcPath) || srcToDestMap.get(resolvedPath);

          if (destPath && resolved.getFilePath() === destPath) {
            const oldSpecifier = imp.getModuleSpecifierValue();

            // Calculate new relative path from external file to merged location
            const extFileDir = path.dirname(extFile.getFilePath());
            let newPath = path.relative(extFileDir, destPath);
            newPath = newPath.replace(/\.ts$/, '');
            if (!newPath.startsWith('.')) {
              newPath = './' + newPath;
            }

            this.emitOutput(`  ${extFile.getBaseName()}: "${oldSpecifier}" → "${newPath}"`);
            imp.setModuleSpecifier(newPath);
          }
        }
      }

      // Save all changes
      this.emitOutput('Saving changes...');
      await project.save();

      // Delete original files
      for (const file of subtree.files) {
        const srcPath = path.join(srcDir, file);
        if (fs.existsSync(srcPath)) {
          fs.unlinkSync(srcPath);
        }
      }

      // Clean up empty directories
      for (const file of subtree.files) {
        const srcPath = path.join(srcDir, file);
        let dir = path.dirname(srcPath);
        while (dir !== srcDir && dir.startsWith(srcDir)) {
          try {
            const contents = fs.readdirSync(dir);
            if (contents.length === 0) {
              fs.rmdirSync(dir);
              this.emitOutput(`  Removed empty directory: ${path.relative(srcDir, dir)}`);
            } else {
              break;
            }
            dir = path.dirname(dir);
          } catch {
            break;
          }
        }
      }

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
      const commitMsg = `[consolidator] Migrate ${subtree.rootPath} (${subtree.files.length} files)`;
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

      this.emitOutput(`Migration complete: ${subtree.files.length} files moved`);
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
          // Mark last migration as built
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
   * Rollback to a specific migration (or before it)
   * @param migrationId - The migration ID to rollback to (rolls back this and all after)
   *                      If not provided, rolls back just the last migration
   */
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

    // Find the migration to rollback to
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
      // Get the parent commit hash (state before the target migration)
      const targetCommit = targetMigration.parentCommitHash;
      if (!targetCommit) {
        throw new Error('Migration has no parent commit hash - cannot rollback');
      }

      this.emitOutput(`Resetting to commit: ${targetCommit.substring(0, 8)}`);

      // Hard reset to the parent commit
      execSync(`git reset --hard ${targetCommit}`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Mark migrations as rolled-back and add to redo stack (in reverse order for correct redo)
      for (const m of migrationsToRollback) {
        m.status = 'rolled-back';
      }

      // Add to redo stack in reverse order (so first to redo is at the end)
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
   * Re-applies migrations from the redo stack
   */
  async fastForward(migrationId?: string): Promise<{ redone: MigrationRecord[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    if (this.state.redoStack.length === 0) {
      throw new Error('Nothing to redo');
    }

    // Find how many migrations to redo
    let targetIndex: number;
    if (migrationId) {
      targetIndex = this.state.redoStack.findIndex(m => m.id === migrationId);
      if (targetIndex === -1) {
        throw new Error(`Migration ${migrationId} not found in redo stack`);
      }
    } else {
      // Just redo the most recent one (last in stack = first undone)
      targetIndex = this.state.redoStack.length - 1;
    }

    // Get migrations to redo (from end of stack up to and including target)
    const migrationsToRedo = this.state.redoStack.slice(targetIndex);

    this.emitOutput(`Redoing ${migrationsToRedo.length} migration(s)`);

    try {
      // The target commit is the commitHash of the last migration to redo
      const targetMigration = migrationsToRedo[0]; // First in slice = furthest forward
      const targetCommit = targetMigration.commitHash;

      if (!targetCommit) {
        throw new Error('Migration has no commit hash - cannot redo');
      }

      this.emitOutput(`Fast-forwarding to commit: ${targetCommit.substring(0, 8)}`);

      // Hard reset to the target commit
      execSync(`git reset --hard ${targetCommit}`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Mark migrations as active again and remove from redo stack
      for (const m of migrationsToRedo) {
        m.status = 'migrated';
      }

      // Remove redone migrations from redo stack
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

  /**
   * Get active (non-rolled-back) migrations
   */
  getActiveMigrations(): MigrationRecord[] {
    return this.state.migrations.filter(m => m.status !== 'rolled-back');
  }

  /**
   * Get redo stack
   */
  getRedoStack(): MigrationRecord[] {
    return this.state.redoStack;
  }

  /**
   * Stop current build
   */
  stopBuild(): void {
    if (this.buildProcess) {
      this.buildProcess.kill('SIGTERM');
      this.emitOutput('Build cancelled');
    }
  }

  /**
   * Get errors formatted for copying to Claude
   */
  getErrorsForClaude(): string {
    const output = this.state.currentBuild.output;

    // Get error lines (broader matching)
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

    // Also include last 30 lines of output for context
    const recentOutput = output.slice(-30);

    const lastMigration = this.state.migrations[this.state.migrations.length - 1];

    return `Build/Migration errors from WebPOS consolidation:

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
