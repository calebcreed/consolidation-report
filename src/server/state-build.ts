/**
 * Build Runner - spawns and manages build processes
 */

import { spawn, ChildProcess } from 'child_process';
import { ServerConfig, BuildState } from './state-types';

export class BuildRunner {
  private buildProcess: ChildProcess | null = null;
  private outputListeners: ((line: string) => void)[] = [];
  private buildState: BuildState = {
    running: false,
    output: [],
    exitCode: null,
  };

  getState(): BuildState {
    return this.buildState;
  }

  onOutput(listener: (line: string) => void): () => void {
    this.outputListeners.push(listener);
    return () => {
      this.outputListeners = this.outputListeners.filter(l => l !== listener);
    };
  }

  emit(line: string): void {
    this.buildState.output.push(line);
    // Keep last 500 lines
    if (this.buildState.output.length > 500) {
      this.buildState.output.shift();
    }
    this.outputListeners.forEach(l => l(line));
  }

  async run(config: ServerConfig): Promise<{ success: boolean; output: string[] }> {
    if (this.buildState.running) {
      throw new Error('Build already running');
    }

    this.buildState = {
      running: true,
      output: [],
      exitCode: null,
    };

    this.emit(`$ ${config.buildCommand}`);

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
          if (line.trim()) this.emit(line);
        });
      });

      this.buildProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) this.emit(line);
        });
      });

      this.buildProcess.on('close', (code) => {
        this.buildState.running = false;
        this.buildState.exitCode = code;
        this.buildProcess = null;

        if (code === 0) {
          this.emit('Build succeeded!');
        } else {
          this.emit(`Build failed with exit code ${code}`);
        }

        resolve({
          success: code === 0,
          output: this.buildState.output,
        });
      });
    });
  }

  stop(): void {
    if (this.buildProcess) {
      this.buildProcess.kill('SIGTERM');
      this.emit('Build cancelled');
    }
  }

  /**
   * Extract error lines for debugging
   */
  getErrorsForClaude(lastMigration?: { subtreeRoot: string; files: string[]; status: string }, lastError?: string | null): string {
    const output = this.buildState.output;

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
      line.includes('\u2716') ||
      line.includes('ENOENT') ||
      line.includes('Module build failed')
    );

    const recentOutput = output.slice(-30);

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
- Last error: ${lastError || 'none'}
`;
  }
}
