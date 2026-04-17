/**
 * Git Operations - rollback and redo via git reset
 */

import { execSync } from 'child_process';
import { MigrationRecord, ServerConfig } from './state-types';

export interface RollbackResult {
  rolledBack: MigrationRecord[];
  targetCommit: string;
}

export interface RedoResult {
  redone: MigrationRecord[];
  targetCommit: string;
}

/**
 * Rollback to before a specific migration
 */
export function rollback(
  migrations: MigrationRecord[],
  migrationId: string | undefined,
  config: ServerConfig,
  emit: (line: string) => void
): RollbackResult {
  const activeMigrations = migrations.filter(m => m.status !== 'rolled-back');

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

  emit(`Rolling back ${migrationsToRollback.length} migration(s) to before: ${targetMigration.subtreeRoot}`);

  const targetCommit = targetMigration.parentCommitHash;
  if (!targetCommit) {
    throw new Error('Migration has no parent commit hash - cannot rollback');
  }

  emit(`Resetting to commit: ${targetCommit.substring(0, 8)}`);

  execSync(`git reset --hard ${targetCommit}`, {
    cwd: config.projectPath,
    encoding: 'utf-8',
  });

  // Mark migrations as rolled back
  for (const m of migrationsToRollback) {
    m.status = 'rolled-back';
  }

  emit(`Rollback complete - ${migrationsToRollback.length} migration(s) undone`);

  return {
    rolledBack: migrationsToRollback,
    targetCommit,
  };
}

/**
 * Fast-forward (redo) to a specific migration
 */
export function fastForward(
  redoStack: MigrationRecord[],
  migrationId: string | undefined,
  config: ServerConfig,
  emit: (line: string) => void
): RedoResult {
  if (redoStack.length === 0) {
    throw new Error('Nothing to redo');
  }

  let targetIndex: number;
  if (migrationId) {
    targetIndex = redoStack.findIndex(m => m.id === migrationId);
    if (targetIndex === -1) {
      throw new Error(`Migration ${migrationId} not found in redo stack`);
    }
  } else {
    targetIndex = redoStack.length - 1;
  }

  const migrationsToRedo = redoStack.slice(targetIndex);

  emit(`Redoing ${migrationsToRedo.length} migration(s)`);

  const targetMigration = migrationsToRedo[0];
  const targetCommit = targetMigration.commitHash;

  if (!targetCommit) {
    throw new Error('Migration has no commit hash - cannot redo');
  }

  emit(`Fast-forwarding to commit: ${targetCommit.substring(0, 8)}`);

  execSync(`git reset --hard ${targetCommit}`, {
    cwd: config.projectPath,
    encoding: 'utf-8',
  });

  // Mark migrations as active again
  for (const m of migrationsToRedo) {
    m.status = 'migrated';
  }

  emit(`Redo complete - ${migrationsToRedo.length} migration(s) restored`);

  return {
    redone: migrationsToRedo,
    targetCommit,
  };
}
