/**
 * State Manager - orchestrates server state
 *
 * Coordinates:
 * - Config management
 * - Migration execution
 * - Build running
 * - Git rollback/redo
 */

import { AnalysisReport, CleanSubtree } from '../report/types';
import {
  ServerState,
  ServerConfig,
  MigrationRecord,
  createInitialState,
} from './state-types';
import { ConfigManager } from './state-config';
import { migrateSubtree } from './state-migration';
import { BuildRunner } from './state-build';
import { rollback, fastForward } from './state-git';

export { ServerState, ServerConfig, MigrationRecord } from './state-types';

export class StateManager {
  private state: ServerState = createInitialState();
  private configManager: ConfigManager;
  private buildRunner: BuildRunner;

  constructor() {
    this.configManager = new ConfigManager();
    this.buildRunner = new BuildRunner();
    this.state.config = this.configManager.load();
  }

  // ============ State Accessors ============

  getState(): ServerState {
    return this.state;
  }

  getConfig(): ServerConfig | null {
    return this.state.config;
  }

  saveConfig(config: ServerConfig): void {
    this.state.config = config;
    this.configManager.save(config);
  }

  setReport(report: AnalysisReport): void {
    this.state.report = report;
  }

  getReport(): AnalysisReport | null {
    return this.state.report;
  }

  getActiveMigrations(): MigrationRecord[] {
    return this.state.migrations.filter(m => m.status !== 'rolled-back');
  }

  getRedoStack(): MigrationRecord[] {
    return this.state.redoStack;
  }

  // ============ Build Output ============

  onBuildOutput(listener: (line: string) => void): () => void {
    return this.buildRunner.onOutput(listener);
  }

  private emitOutput(line: string): void {
    this.buildRunner.emit(line);
  }

  // ============ Migration ============

  async migrate(subtree: CleanSubtree): Promise<MigrationRecord> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    try {
      const { record, commitHash } = await migrateSubtree(
        subtree,
        config,
        (line) => this.emitOutput(line)
      );

      this.state.migrations.push(record);
      this.state.currentCommit = commitHash;

      // Clear redo stack - new migration invalidates any "future" that was undone
      if (this.state.redoStack.length > 0) {
        this.emitOutput(`Clearing ${this.state.redoStack.length} redo entries (new timeline branch)`);
        this.state.redoStack = [];
      }

      return record;
    } catch (e: any) {
      this.state.lastError = e.message;
      throw e;
    }
  }

  // ============ Build ============

  async build(): Promise<{ success: boolean; output: string[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    const result = await this.buildRunner.run(config);

    this.state.currentBuild = this.buildRunner.getState();

    if (result.success) {
      const lastMigration = this.state.migrations[this.state.migrations.length - 1];
      if (lastMigration && lastMigration.status === 'migrated') {
        lastMigration.status = 'built';
      }
    } else {
      this.state.lastError = this.state.currentBuild.output.join('\n');
    }

    return result;
  }

  stopBuild(): void {
    this.buildRunner.stop();
  }

  // ============ Rollback/Redo ============

  async rollback(migrationId?: string): Promise<{ rolledBack: MigrationRecord[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    try {
      const result = rollback(
        this.state.migrations,
        migrationId,
        config,
        (line) => this.emitOutput(line)
      );

      // Add rolled back migrations to redo stack
      this.state.redoStack = [...result.rolledBack.slice().reverse(), ...this.state.redoStack];
      this.state.currentCommit = result.targetCommit;

      this.emitOutput(`Redo stack now has ${this.state.redoStack.length} migration(s)`);

      return { rolledBack: result.rolledBack };
    } catch (e: any) {
      this.state.lastError = e.message;
      throw e;
    }
  }

  async fastForward(migrationId?: string): Promise<{ redone: MigrationRecord[] }> {
    const config = this.state.config;
    if (!config) throw new Error('No config set');

    try {
      const targetIndex = migrationId
        ? this.state.redoStack.findIndex(m => m.id === migrationId)
        : this.state.redoStack.length - 1;

      const result = fastForward(
        this.state.redoStack,
        migrationId,
        config,
        (line) => this.emitOutput(line)
      );

      // Remove redone migrations from redo stack
      this.state.redoStack = this.state.redoStack.slice(0, targetIndex);
      this.state.currentCommit = result.targetCommit;

      return { redone: result.redone };
    } catch (e: any) {
      this.state.lastError = e.message;
      throw e;
    }
  }

  // ============ Error Reporting ============

  getErrorsForClaude(): string {
    const lastMigration = this.state.migrations[this.state.migrations.length - 1];
    return this.buildRunner.getErrorsForClaude(lastMigration, this.state.lastError);
  }
}

export const stateManager = new StateManager();
