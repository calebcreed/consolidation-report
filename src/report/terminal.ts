/**
 * Terminal Report - Generates readable console output
 */

import { AnalysisReport, CleanSubtree, BottleneckNode, SummaryStats } from './types';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',

  // Background
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

export class TerminalReporter {
  private useColors: boolean;

  constructor(useColors: boolean = true) {
    this.useColors = useColors;
  }

  private c(color: keyof typeof colors, text: string): string {
    if (!this.useColors) return text;
    return `${colors[color]}${text}${colors.reset}`;
  }

  /**
   * Generate full terminal report
   */
  generate(report: AnalysisReport): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(this.c('bold', '═'.repeat(70)));
    lines.push(this.c('bold', '  Branch Consolidation Report'));
    lines.push(this.c('dim', `  Generated: ${report.generatedAt}`));
    lines.push(this.c('bold', '═'.repeat(70)));
    lines.push('');

    // Summary Statistics
    lines.push(...this.renderStats(report.stats));
    lines.push('');

    // Clean Subtrees
    lines.push(...this.renderCleanSubtrees(report.cleanSubtrees));
    lines.push('');

    // Bottleneck Analysis
    lines.push(...this.renderBottlenecks(report.bottlenecks));
    lines.push('');

    lines.push(this.c('dim', '─'.repeat(70)));

    return lines.join('\n');
  }

  /**
   * Render summary statistics section
   */
  private renderStats(stats: SummaryStats): string[] {
    const lines: string[] = [];

    lines.push(this.c('bold', '┌─ Summary Statistics ─────────────────────────────────────────────┐'));
    lines.push('│');

    const total = stats.totalFiles;
    const cleanPct = total > 0 ? ((stats.cleanFiles / total) * 100).toFixed(1) : '0';
    const movablePct = total > 0 ? ((stats.immediatelyMovable / total) * 100).toFixed(1) : '0';

    lines.push(`│  ${this.c('bold', 'Total Files:')}           ${this.padLeft(stats.totalFiles, 6)}`);
    lines.push('│');
    lines.push(`│  ${this.c('green', 'Clean (Identical):')}    ${this.padLeft(stats.cleanFiles, 6)}  (${cleanPct}%)`);
    lines.push(`│  ${this.c('green', 'Same Change:')}          ${this.padLeft(stats.sameChangeFiles, 6)}`);
    lines.push(`│  ${this.c('magenta', 'Retail Only:')}          ${this.padLeft(stats.retailOnlyFiles, 6)}`);
    lines.push(`│  ${this.c('yellow', 'Restaurant Only:')}      ${this.padLeft(stats.restaurantOnlyFiles, 6)}`);
    lines.push(`│  ${this.c('red', 'Conflicts:')}            ${this.padLeft(stats.conflictFiles, 6)}`);
    lines.push('│');
    lines.push(`│  ${this.c('bold', this.c('green', 'Immediately Movable:'))} ${this.padLeft(stats.immediatelyMovable, 6)}  (${movablePct}%)`);
    lines.push(`│  ${this.c('dim', 'Blocked Clean:')}        ${this.padLeft(stats.blockedClean, 6)}`);
    lines.push('│');
    lines.push(this.c('bold', '└──────────────────────────────────────────────────────────────────┘'));

    return lines;
  }

  /**
   * Render clean subtrees section
   */
  private renderCleanSubtrees(subtrees: CleanSubtree[]): string[] {
    const lines: string[] = [];

    lines.push(this.c('bold', '┌─ Clean Subtrees (Safe to Move to Shared) ────────────────────────┐'));
    lines.push('│');

    if (subtrees.length === 0) {
      lines.push(`│  ${this.c('dim', 'No clean subtrees found')}`);
    } else {
      lines.push(`│  ${this.c('dim', `Found ${subtrees.length} clean subtrees, ranked by size:`)}`);
      lines.push('│');

      // Show top 20
      const toShow = subtrees.slice(0, 20);
      for (let i = 0; i < toShow.length; i++) {
        const tree = toShow[i];
        const rank = `${i + 1}.`.padEnd(4);
        const files = `${tree.totalFiles} files`.padEnd(10);
        const path = this.truncatePath(tree.rootPath, 45);

        lines.push(`│  ${this.c('green', rank)} ${this.c('bold', files)} ${path}`);

        // Show sample files for larger subtrees
        if (tree.totalFiles > 1 && tree.files.length > 1) {
          const sample = tree.files.slice(0, 3);
          for (const f of sample) {
            if (f !== tree.rootPath) {
              lines.push(`│       ${this.c('dim', '└─ ' + this.truncatePath(f, 50))}`);
            }
          }
          if (tree.files.length > 4) {
            lines.push(`│       ${this.c('dim', `   ... and ${tree.files.length - 3} more`)}`);
          }
        }
      }

      if (subtrees.length > 20) {
        lines.push('│');
        lines.push(`│  ${this.c('dim', `... and ${subtrees.length - 20} more subtrees`)}`);
      }
    }

    lines.push('│');
    lines.push(this.c('bold', '└──────────────────────────────────────────────────────────────────┘'));

    return lines;
  }

  /**
   * Render bottleneck analysis section
   */
  private renderBottlenecks(bottlenecks: BottleneckNode[]): string[] {
    const lines: string[] = [];

    lines.push(this.c('bold', '┌─ Bottleneck Analysis (Highest Impact to Resolve) ────────────────┐'));
    lines.push('│');

    // Filter to only meaningful bottlenecks
    const meaningful = bottlenecks.filter(b => b.unlockCount > 0);

    if (meaningful.length === 0) {
      lines.push(`│  ${this.c('dim', 'No bottlenecks found - no single file blocks clean subtrees')}`);
    } else {
      lines.push(`│  ${this.c('dim', 'Resolving these files would unlock the most clean subtrees:')}`);
      lines.push('│');

      // Show top 15
      const toShow = meaningful.slice(0, 15);
      for (let i = 0; i < toShow.length; i++) {
        const b = toShow[i];
        const rank = `${i + 1}.`.padEnd(4);
        const unlocks = this.c('cyan', `Unlocks ${b.unlockCount}`.padEnd(12));
        const status = this.renderStatus(b.status);
        const path = this.truncatePath(b.relativePath, 35);

        lines.push(`│  ${rank} ${unlocks} ${status} ${path}`);

        // Show sample of what would be unlocked
        if (b.unlockedPaths.length > 0) {
          const sample = b.unlockedPaths.slice(0, 2);
          for (const p of sample) {
            lines.push(`│       ${this.c('dim', '→ ' + this.truncatePath(p, 50))}`);
          }
          if (b.unlockedPaths.length > 2) {
            lines.push(`│       ${this.c('dim', `  ... and ${b.unlockCount - 2} more`)}`);
          }
        }
      }

      if (meaningful.length > 15) {
        lines.push('│');
        lines.push(`│  ${this.c('dim', `... and ${meaningful.length - 15} more bottlenecks`)}`);
      }
    }

    lines.push('│');
    lines.push(this.c('bold', '└──────────────────────────────────────────────────────────────────┘'));

    return lines;
  }

  /**
   * Render a status badge
   */
  private renderStatus(status: string): string {
    const width = 12;
    switch (status) {
      case 'clean':
        return this.c('green', 'CLEAN'.padEnd(width));
      case 'same-change':
        return this.c('green', 'SAME'.padEnd(width));
      case 'retail-only':
        return this.c('magenta', 'RETAIL'.padEnd(width));
      case 'restaurant-only':
        return this.c('yellow', 'RESTAURANT'.padEnd(width));
      case 'conflict':
        return this.c('red', 'CONFLICT'.padEnd(width));
      default:
        return status.padEnd(width);
    }
  }

  /**
   * Truncate a path to fit width
   */
  private truncatePath(path: string, maxWidth: number): string {
    if (path.length <= maxWidth) return path;
    return '...' + path.slice(-(maxWidth - 3));
  }

  /**
   * Pad number to the left
   */
  private padLeft(num: number, width: number): string {
    return num.toString().padStart(width);
  }
}
