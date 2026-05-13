/**
 * Summary Formatter - Generate dashboard summary
 */

import { CardSet, WorkCard } from '../types';
import { groupByPhase } from '../prioritizer';

/**
 * Format card set as a summary dashboard
 */
export function formatSummary(cardSet: CardSet): string {
  const lines: string[] = [];

  // Header
  lines.push('# Migration Work Cards Summary');
  lines.push('');
  lines.push(`**Generated:** ${cardSet.metadata.generatedAt}`);
  lines.push(`**Total Cards:** ${cardSet.cards.length}`);
  lines.push(`**Total Files:** ${cardSet.totalFiles}`);
  lines.push(`**Total Lines Changed:** ~${cardSet.totalEffort.linesChanged.toLocaleString()}`);
  lines.push('');

  // Clustering params
  lines.push('## Clustering Parameters');
  lines.push('');
  lines.push(`- Resolution: ${cardSet.metadata.clusteringParams.resolution}`);
  lines.push(`- Topological Weight: ${cardSet.metadata.clusteringParams.topologicalWeight}`);
  lines.push(`- Content Weight: ${(1 - cardSet.metadata.clusteringParams.topologicalWeight).toFixed(1)}`);
  lines.push('');

  // Effort distribution
  lines.push('## Effort Distribution');
  lines.push('');
  lines.push('| Size | Cards | Files | Description |');
  lines.push('|------|-------|-------|-------------|');

  const sizeDescriptions: Record<string, string> = {
    XS: '1-2 files, <50 lines',
    S: '3-5 files, 50-150 lines',
    M: '6-10 files, 150-400 lines',
    L: '11-15 files, 400-800 lines',
    XL: '16+ files, 800+ lines',
  };

  for (const size of ['XS', 'S', 'M', 'L', 'XL']) {
    const count = cardSet.totalEffort.sizeBreakdown[size] || 0;
    const filesInSize = cardSet.cards
      .filter(c => c.effort.size === size)
      .reduce((sum, c) => sum + c.files.length, 0);

    lines.push(`| ${size} | ${count} | ${filesInSize} | ${sizeDescriptions[size]} |`);
  }
  lines.push('');

  // Execution phases
  lines.push('## Execution Phases');
  lines.push('');

  const phases = groupByPhase(cardSet.cards);
  const sortedPhases = Array.from(phases.keys()).sort((a, b) => a - b);

  for (const phase of sortedPhases) {
    const phaseCards = phases.get(phase) || [];
    lines.push(`### Phase ${phase + 1}${phase === 0 ? ' (No blockers)' : ''}`);
    lines.push('');

    for (const card of phaseCards) {
      const blockerInfo = card.blockedBy.length > 0
        ? ` (after: ${card.blockedBy.join(', ')})`
        : '';
      lines.push(`- **${card.title}** [${card.effort.size}]${blockerInfo}`);
    }
    lines.push('');
  }

  // Cards by priority
  lines.push('## Cards by Priority');
  lines.push('');
  lines.push('| # | Card | Size | Blockers | Unblocks | Tags |');
  lines.push('|---|------|------|----------|----------|------|');

  const sortedCards = [...cardSet.cards].sort((a, b) => a.priority - b.priority);

  for (const card of sortedCards) {
    const tags = card.tags.slice(0, 3).join(', ') || '-';
    lines.push(
      `| ${card.priority} | ${card.title} | ${card.effort.size} | ${card.blockedBy.length} | ${card.blocks.length} | ${tags} |`
    );
  }
  lines.push('');

  // Quick stats
  lines.push('## Quick Stats');
  lines.push('');

  const noBlockers = cardSet.cards.filter(c => c.blockedBy.length === 0).length;
  const withExtDeps = cardSet.cards.filter(c => c.effort.complexity.hasExternalDeps).length;
  const withServices = cardSet.cards.filter(c => c.effort.complexity.hasServiceChanges).length;
  const withTemplates = cardSet.cards.filter(c => c.effort.complexity.hasTemplateChanges).length;

  lines.push(`- Cards with no blockers (can start immediately): **${noBlockers}**`);
  lines.push(`- Cards with external dependencies: **${withExtDeps}**`);
  lines.push(`- Cards with service changes: **${withServices}**`);
  lines.push(`- Cards with template changes: **${withTemplates}**`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a brief one-line summary per card
 */
export function formatBriefList(cardSet: CardSet): string {
  const lines: string[] = [];

  lines.push('# Card List');
  lines.push('');

  const sortedCards = [...cardSet.cards].sort((a, b) => a.priority - b.priority);

  for (const card of sortedCards) {
    const status = card.blockedBy.length === 0 ? '🟢' : '🔴';
    lines.push(`${status} **${card.priority}.** ${card.title} (${card.effort.size}, ${card.files.length} files)`);
  }

  return lines.join('\n');
}
