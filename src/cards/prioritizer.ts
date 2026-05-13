/**
 * Prioritizer - Calculate priority and execution order for work cards
 */

import { WorkCard } from './types';

/**
 * Priority weights
 */
const WEIGHTS = {
  dependencyDepth: 0.4,
  unlockCount: 0.3,
  effortSize: 0.2,
  cohesion: 0.1,
};

/**
 * Effort size scores (higher = easier/faster)
 */
const SIZE_SCORES: Record<string, number> = {
  XS: 10,
  S: 8,
  M: 6,
  L: 4,
  XL: 2,
};

/**
 * Calculate priority scores for all cards and assign priority numbers
 */
export function prioritizeCards(cards: WorkCard[]): void {
  // Build dependency graph
  const depGraph = buildDependencyGraph(cards);

  // Calculate scores
  const scores: Map<string, number> = new Map();

  for (const card of cards) {
    const score = calculatePriorityScore(card, cards, depGraph);
    scores.set(card.id, score);
  }

  // Sort by score descending and assign priority
  const sortedCards = [...cards].sort((a, b) =>
    (scores.get(b.id) || 0) - (scores.get(a.id) || 0)
  );

  sortedCards.forEach((card, index) => {
    card.priority = index + 1;
  });
}

/**
 * Build dependency graph from cards
 */
function buildDependencyGraph(cards: WorkCard[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const card of cards) {
    graph.set(card.id, new Set(card.blockedBy));
  }

  return graph;
}

/**
 * Calculate priority score for a single card
 */
function calculatePriorityScore(
  card: WorkCard,
  allCards: WorkCard[],
  depGraph: Map<string, Set<string>>
): number {
  // 1. Dependency depth score (0 blockers = max score)
  const depth = getMaxDependencyDepth(card.id, depGraph);
  const depthScore = Math.max(0, 10 - depth * 2);

  // 2. Unlock count score (more unblocks = higher score)
  const unlockCount = card.blocks.length;
  const unlockScore = Math.min(10, unlockCount * 2);

  // 3. Effort size score (smaller = higher)
  const effortScore = SIZE_SCORES[card.effort.size] || 5;

  // 4. Cohesion score
  const cohesionScore = card.package.cohesion * 10;

  // Weighted sum
  return (
    depthScore * WEIGHTS.dependencyDepth +
    unlockScore * WEIGHTS.unlockCount +
    effortScore * WEIGHTS.effortSize +
    cohesionScore * WEIGHTS.cohesion
  );
}

/**
 * Get maximum dependency depth for a card
 */
function getMaxDependencyDepth(
  cardId: string,
  depGraph: Map<string, Set<string>>,
  visited: Set<string> = new Set()
): number {
  if (visited.has(cardId)) return 0; // Cycle detection
  visited.add(cardId);

  const blockers = depGraph.get(cardId);
  if (!blockers || blockers.size === 0) return 0;

  let maxDepth = 0;
  for (const blocker of blockers) {
    const depth = getMaxDependencyDepth(blocker, depGraph, visited);
    maxDepth = Math.max(maxDepth, depth + 1);
  }

  return maxDepth;
}

/**
 * Compute execution order using topological sort
 */
export function computeDependencyOrder(cards: WorkCard[]): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const inProgress = new Set<string>();

  // Build adjacency map
  const cardMap = new Map<string, WorkCard>();
  for (const card of cards) {
    cardMap.set(card.id, card);
  }

  // Topological sort with cycle detection
  function visit(cardId: string): boolean {
    if (visited.has(cardId)) return true;
    if (inProgress.has(cardId)) return true; // Cycle - skip

    inProgress.add(cardId);

    const card = cardMap.get(cardId);
    if (card) {
      // Visit all blockers first
      for (const blockerId of card.blockedBy) {
        if (!visit(blockerId)) return false;
      }
    }

    inProgress.delete(cardId);
    visited.add(cardId);
    order.push(cardId);

    return true;
  }

  // Visit all cards
  for (const card of cards) {
    visit(card.id);
  }

  return order;
}

/**
 * Group cards by execution phase (based on dependency depth)
 */
export function groupByPhase(cards: WorkCard[]): Map<number, WorkCard[]> {
  const depGraph = buildDependencyGraph(cards);
  const phases = new Map<number, WorkCard[]>();

  for (const card of cards) {
    const depth = getMaxDependencyDepth(card.id, depGraph);
    if (!phases.has(depth)) {
      phases.set(depth, []);
    }
    phases.get(depth)!.push(card);
  }

  // Sort cards within each phase by priority
  for (const [_phase, phaseCards] of phases) {
    phaseCards.sort((a, b) => a.priority - b.priority);
  }

  return phases;
}
