/**
 * Card Types - Interfaces for work package cards
 */

import { WorkPackage } from '../clustering/types';

/**
 * A file within a work card
 */
export interface CardFile {
  /** Relative path */
  relativePath: string;

  /** File status in comparison */
  status: 'conflict' | 'retail-only' | 'restaurant-only' | 'clean' | 'same-change';

  /** Lines changed (for effort estimation) */
  linesChanged: number;

  /** Dependencies within this card */
  internalDeps: string[];

  /** Dependencies outside this card */
  externalDeps: string[];
}

/**
 * Complexity factors for effort estimation
 */
export interface ComplexityFactors {
  hasExternalDeps: boolean;
  hasCyclicDeps: boolean;
  hasTemplateChanges: boolean;
  hasServiceChanges: boolean;
  hasModuleChanges: boolean;
}

/**
 * Effort estimate for a card
 */
export interface EffortEstimate {
  /** Total files in card */
  fileCount: number;

  /** Total lines changed across all files */
  totalLinesChanged: number;

  /** T-shirt size: XS, S, M, L, XL */
  size: 'XS' | 'S' | 'M' | 'L' | 'XL';

  /** Complexity factors */
  complexity: ComplexityFactors;
}

/**
 * Checklist item for a card
 */
export interface ChecklistItem {
  /** Checklist item text */
  text: string;

  /** Whether item is checked */
  checked: boolean;

  /** Category of check */
  category: 'pre-migration' | 'migration' | 'post-migration' | 'testing';
}

/**
 * A work card representing a package of files to migrate
 */
export interface WorkCard {
  /** Unique card identifier */
  id: string;

  /** Human-readable title */
  title: string;

  /** Card priority (1 = highest) */
  priority: number;

  /** Execution status */
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';

  /** Package this card represents */
  package: WorkPackage;

  /** Files in this card with detailed info */
  files: CardFile[];

  /** Card IDs that must be completed before this one */
  blockedBy: string[];

  /** Card IDs that this one unblocks */
  blocks: string[];

  /** Estimated effort metrics */
  effort: EffortEstimate;

  /** Domain/feature tags */
  tags: string[];

  /** Generated summary description */
  summary: string;

  /** Review checklist items */
  checklist: ChecklistItem[];
}

/**
 * Complete set of generated cards
 */
export interface CardSet {
  /** All generated cards */
  cards: WorkCard[];

  /** Total files across all cards */
  totalFiles: number;

  /** Total estimated effort */
  totalEffort: {
    linesChanged: number;
    sizeBreakdown: Record<string, number>;
  };

  /** Execution order (card IDs in dependency order) */
  executionOrder: string[];

  /** Generation metadata */
  metadata: {
    generatedAt: string;
    clusteringParams: {
      resolution: number;
      topologicalWeight: number;
    };
  };
}

/**
 * Options for card generation
 */
export interface CardGenerationOptions {
  /** Include checklist items (default: true) */
  includeChecklist?: boolean;

  /** Include effort estimates (default: true) */
  includeEffort?: boolean;

  /** Maximum tags per card (default: 5) */
  maxTags?: number;
}
