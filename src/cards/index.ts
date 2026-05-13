/**
 * Cards Module - Generate actionable work cards from clustering results
 *
 * Transforms clustering output into structured work cards with:
 * - Auto-generated titles and tags
 * - Priority calculation and execution ordering
 * - Effort estimation (T-shirt sizing)
 * - Review checklists
 * - Multiple output formats (JSON, Markdown)
 */

// Types
export type {
  WorkCard,
  CardFile,
  EffortEstimate,
  ComplexityFactors,
  ChecklistItem,
  CardSet,
  CardGenerationOptions,
} from './types';

// Generator
export { generateWorkCards } from './generator';

// Prioritizer
export {
  prioritizeCards,
  computeDependencyOrder,
  groupByPhase,
} from './prioritizer';

// Effort Estimator
export {
  estimateEffort,
  getSizeLabel,
  detectComplexity,
  getEffortDescription,
} from './effort-estimator';

// Formatters
export { formatAsJson, formatAsMinimalJson } from './formatters/json';
export { formatAsMarkdown, formatCard, formatAsIndividualFiles } from './formatters/markdown';
export { formatSummary, formatBriefList } from './formatters/summary';
