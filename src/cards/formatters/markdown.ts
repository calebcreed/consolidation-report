/**
 * Markdown Formatter - Export cards as Markdown documents
 */

import { CardSet, WorkCard, ChecklistItem } from '../types';
import { getEffortDescription } from '../effort-estimator';

/**
 * Format entire card set as a single Markdown document
 */
export function formatAsMarkdown(cardSet: CardSet): string {
  const lines: string[] = [];

  lines.push('# Migration Work Cards');
  lines.push('');
  lines.push(`Generated: ${cardSet.metadata.generatedAt}`);
  lines.push(`Total Cards: ${cardSet.cards.length}`);
  lines.push(`Total Files: ${cardSet.totalFiles}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sort cards by priority
  const sortedCards = [...cardSet.cards].sort((a, b) => a.priority - b.priority);

  for (const card of sortedCards) {
    lines.push(formatCard(card));
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a single card as Markdown
 */
export function formatCard(card: WorkCard): string {
  const lines: string[] = [];

  // Header
  lines.push(`## ${card.id}: ${card.title}`);
  lines.push('');

  // Metadata
  lines.push(`**Priority:** ${card.priority}`);
  lines.push(`**Status:** ${card.status}`);
  lines.push(`**Effort:** ${getEffortDescription(card.effort)}`);

  if (card.tags.length > 0) {
    lines.push(`**Tags:** ${card.tags.join(', ')}`);
  }
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push('');
  lines.push(card.summary);
  lines.push('');

  // Dependencies
  lines.push('### Dependencies');
  lines.push('');

  if (card.blockedBy.length === 0) {
    lines.push('**Blocked By:** None (can start immediately)');
  } else {
    lines.push(`**Blocked By:** ${card.blockedBy.join(', ')}`);
  }

  if (card.blocks.length === 0) {
    lines.push('**Blocks:** None');
  } else {
    lines.push(`**Blocks:** ${card.blocks.join(', ')}`);
  }
  lines.push('');

  // Files table
  lines.push('### Files');
  lines.push('');
  lines.push('| File | Status | Lines | Internal Deps | External Deps |');
  lines.push('|------|--------|-------|---------------|---------------|');

  for (const file of card.files) {
    const fileName = file.relativePath.split('/').pop() || file.relativePath;
    lines.push(
      `| ${fileName} | ${file.status} | ${file.linesChanged} | ${file.internalDeps.length} | ${file.externalDeps.length} |`
    );
  }
  lines.push('');

  // Checklist
  if (card.checklist.length > 0) {
    lines.push('### Checklist');
    lines.push('');

    const categories = ['pre-migration', 'migration', 'post-migration', 'testing'] as const;
    const categoryLabels: Record<string, string> = {
      'pre-migration': 'Pre-Migration',
      'migration': 'Migration',
      'post-migration': 'Post-Migration',
      'testing': 'Testing',
    };

    for (const category of categories) {
      const items = card.checklist.filter(item => item.category === category);
      if (items.length > 0) {
        lines.push(`#### ${categoryLabels[category]}`);
        lines.push('');
        for (const item of items) {
          const checkbox = item.checked ? '[x]' : '[ ]';
          lines.push(`- ${checkbox} ${item.text}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format cards as individual markdown files (returns map of filename -> content)
 */
export function formatAsIndividualFiles(cardSet: CardSet): Map<string, string> {
  const files = new Map<string, string>();

  for (const card of cardSet.cards) {
    const filename = `${card.id}.md`;
    files.set(filename, formatCard(card));
  }

  return files;
}
