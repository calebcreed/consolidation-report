/**
 * Server State Management
 * Tracks migrations, build status, and enables rollback
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn, ChildProcess } from 'child_process';
import { AnalysisReport, CleanSubtree } from '../report/types';

export interface MigrationRecord {
  id: string;
  timestamp: string;
  subtreeRoot: string;
  files: string[];
  fromBranch: string;
  toBranch: string;
  status: 'pending' | 'migrated' | 'built' | 'rolled-back';
  gitStashRef?: string;
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
   * Migrate a subtree to shared
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
      toBranch: 'shared',
      status: 'pending',
    };

    try {
      // Create a git stash point for rollback
      const stashMessage = `consolidator-${id}`;
      execSync(`git stash push -m "${stashMessage}" --include-untracked`, {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Check if stash was created (might be empty if no changes)
      const stashList = execSync('git stash list', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      if (stashList.includes(stashMessage)) {
        record.gitStashRef = 'stash@{0}';
        // Pop it back - we just wanted the ref for safety
        execSync('git stash pop', { cwd: config.projectPath });
      }

      // Move files to shared
      for (const file of subtree.files) {
        const srcPath = path.join(config.projectPath, 'apps/restaurant/src', file);
        const destPath = path.join(config.projectPath, config.sharedPath, file);

        if (fs.existsSync(srcPath)) {
          // Create destination directory
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          // Move file using git mv for proper tracking
          try {
            execSync(`git mv "${srcPath}" "${destPath}"`, {
              cwd: config.projectPath,
              encoding: 'utf-8',
            });
            this.emitOutput(`Moved: ${file}`);
          } catch (e) {
            // If git mv fails, try regular move
            fs.renameSync(srcPath, destPath);
            this.emitOutput(`Moved (non-git): ${file}`);
          }
        }
      }

      record.status = 'migrated';
      this.state.migrations.push(record);
      this.emitOutput(`Migration complete: ${subtree.files.length} files moved`);

      return record;
    } catch (e: any) {
      record.status = 'rolled-back';
      this.state.lastError = e.message;
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
   * Rollback the last migration
   */
  async rollback(): Promise<void> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    const lastMigration = this.state.migrations[this.state.migrations.length - 1];
    if (!lastMigration || lastMigration.status === 'rolled-back') {
      throw new Error('No migration to rollback');
    }

    this.emitOutput(`Rolling back migration: ${lastMigration.subtreeRoot}`);

    try {
      // Use git checkout to restore files
      execSync('git checkout HEAD -- .', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      // Clean up any untracked files that were created
      execSync('git clean -fd', {
        cwd: config.projectPath,
        encoding: 'utf-8',
      });

      lastMigration.status = 'rolled-back';
      this.emitOutput('Rollback complete');
    } catch (e: any) {
      this.state.lastError = e.message;
      throw e;
    }
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
    const errors = output.filter(line =>
      line.includes('error') ||
      line.includes('Error') ||
      line.includes('ERROR') ||
      line.includes('Cannot find') ||
      line.includes('TS')
    );

    return `Build errors from WebPOS consolidation migration:

\`\`\`
${errors.slice(-50).join('\n')}
\`\`\`

Full context:
- Migrated subtree: ${this.state.migrations[this.state.migrations.length - 1]?.subtreeRoot || 'unknown'}
- Files moved: ${this.state.migrations[this.state.migrations.length - 1]?.files.length || 0}
`;
  }
}

export const stateManager = new StateManager();
