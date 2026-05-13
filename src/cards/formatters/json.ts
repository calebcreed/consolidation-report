/**
 * JSON Formatter - Export cards as JSON
 */

import { CardSet } from '../types';

/**
 * Format card set as JSON string
 */
export function formatAsJson(cardSet: CardSet, pretty: boolean = true): string {
  return JSON.stringify(cardSet, null, pretty ? 2 : undefined);
}

/**
 * Format card set as minimal JSON (for APIs)
 */
export function formatAsMinimalJson(cardSet: CardSet): string {
  const minimal = {
    totalFiles: cardSet.totalFiles,
    totalCards: cardSet.cards.length,
    executionOrder: cardSet.executionOrder,
    cards: cardSet.cards.map(card => ({
      id: card.id,
      title: card.title,
      priority: card.priority,
      status: card.status,
      fileCount: card.files.length,
      effort: card.effort.size,
      blockedBy: card.blockedBy,
      blocks: card.blocks,
      tags: card.tags,
    })),
  };

  return JSON.stringify(minimal, null, 2);
}
