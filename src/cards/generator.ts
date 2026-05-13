/**
 * Card Generator - Generate work cards from clustering results
 */

import { CombinedClusteringResult, WorkPackage } from '../clustering/types';
import { AnalysisReport, FileMatch } from '../report/types';
import {
  WorkCard,
  CardFile,
  CardSet,
  ChecklistItem,
  CardGenerationOptions,
} from './types';
import { estimateEffort } from './effort-estimator';
import { prioritizeCards, computeDependencyOrder } from './prioritizer';

/** Default generation options */
const DEFAULT_OPTIONS: Required<CardGenerationOptions> = {
  includeChecklist: true,
  includeEffort: true,
  maxTags: 5,
};

/**
 * Generate work cards from clustering result and analysis report.
 */
export function generateWorkCards(
  clusterResult: CombinedClusteringResult,
  report: AnalysisReport,
  options?: CardGenerationOptions
): CardSet {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build file lookup map
  const fileMap = new Map<string, FileMatch>();
  for (const file of report.files) {
    fileMap.set(file.relativePath, file);
  }

  // Generate cards for each package
  const cards: WorkCard[] = [];

  for (const pkg of clusterResult.packages) {
    const card = generateCard(pkg, fileMap, opts);
    cards.push(card);
  }

  // Compute inter-card dependencies
  computeCardDependencies(cards, fileMap);

  // Calculate priorities
  prioritizeCards(cards);

  // Compute execution order
  const executionOrder = computeDependencyOrder(cards);

  // Calculate totals
  const totalFiles = cards.reduce((sum, c) => sum + c.files.length, 0);
  const totalLinesChanged = cards.reduce((sum, c) => sum + c.effort.totalLinesChanged, 0);

  const sizeBreakdown: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0 };
  for (const card of cards) {
    sizeBreakdown[card.effort.size]++;
  }

  return {
    cards,
    totalFiles,
    totalEffort: {
      linesChanged: totalLinesChanged,
      sizeBreakdown,
    },
    executionOrder,
    metadata: {
      generatedAt: new Date().toISOString(),
      clusteringParams: {
        resolution: clusterResult.resolution,
        topologicalWeight: clusterResult.weights.topological,
      },
    },
  };
}

/**
 * Generate a single card from a package
 */
function generateCard(
  pkg: WorkPackage,
  fileMap: Map<string, FileMatch>,
  opts: Required<CardGenerationOptions>
): WorkCard {
  const cardId = `card-${pkg.id + 1}`;

  // Build card files
  const cardFiles: CardFile[] = [];
  const allInternalDeps = new Set<string>();
  const allExternalDeps = new Set<string>();
  const pkgFileSet = new Set(pkg.files);

  for (const filePath of pkg.files) {
    const fileMatch = fileMap.get(filePath);
    if (!fileMatch) continue;

    const internalDeps: string[] = [];
    const externalDeps: string[] = [];

    for (const dep of fileMatch.dependencies) {
      if (pkgFileSet.has(dep)) {
        internalDeps.push(dep);
        allInternalDeps.add(dep);
      } else {
        externalDeps.push(dep);
        allExternalDeps.add(dep);
      }
    }

    cardFiles.push({
      relativePath: filePath,
      status: fileMatch.status,
      linesChanged: fileMatch.linesChanged || 0,
      internalDeps,
      externalDeps,
    });
  }

  // Estimate effort
  const effort = opts.includeEffort
    ? estimateEffort(cardFiles)
    : { fileCount: cardFiles.length, totalLinesChanged: 0, size: 'M' as const, complexity: { hasExternalDeps: false, hasCyclicDeps: false, hasTemplateChanges: false, hasServiceChanges: false, hasModuleChanges: false } };

  // Generate tags from file paths
  const tags = generateTags(pkg.files, opts.maxTags);

  // Generate title
  const title = generateTitle(pkg, tags);

  // Generate summary
  const summary = generateSummary(pkg, cardFiles, effort);

  // Generate checklist
  const checklist = opts.includeChecklist
    ? generateChecklist(effort, allExternalDeps.size > 0)
    : [];

  return {
    id: cardId,
    title,
    priority: 0, // Will be set by prioritizer
    status: 'pending',
    package: pkg,
    files: cardFiles,
    blockedBy: [], // Will be computed
    blocks: [], // Will be computed
    effort,
    tags,
    summary,
    checklist,
  };
}

/**
 * Generate title from package contents
 */
function generateTitle(pkg: WorkPackage, tags: string[]): string {
  // Try to find common directory
  const commonDir = findCommonDirectory(pkg.files);
  if (commonDir && commonDir !== 'src' && commonDir !== 'src/app') {
    const dirName = commonDir.split('/').pop() || '';
    if (dirName.length > 2) {
      return capitalize(dirName.replace(/-/g, ' '));
    }
  }

  // Use top tags
  if (tags.length >= 2) {
    return tags.slice(0, 2).map(capitalize).join(' ');
  }

  if (tags.length === 1) {
    return capitalize(tags[0]) + ' Changes';
  }

  // Detect file pattern
  const pattern = detectFilePattern(pkg.files);
  if (pattern) {
    return capitalize(pattern) + ' Updates';
  }

  // Fallback
  return `Package ${pkg.id + 1}`;
}

/**
 * Find common directory prefix
 */
function findCommonDirectory(files: string[]): string | null {
  if (files.length === 0) return null;

  const parts = files[0].split('/');
  let commonParts: string[] = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (files.every(f => f.split('/')[i] === part)) {
      commonParts.push(part);
    } else {
      break;
    }
  }

  return commonParts.length > 0 ? commonParts.join('/') : null;
}

/**
 * Generate tags from file paths
 */
function generateTags(files: string[], maxTags: number): string[] {
  const tagCounts = new Map<string, number>();

  for (const file of files) {
    // Extract meaningful parts from path
    const parts = file.split('/');
    for (const part of parts) {
      // Skip common parts
      if (['src', 'app', 'index.ts', 'index'].includes(part)) continue;

      // Extract name without extension
      const name = part.replace(/\.(ts|tsx|js|jsx|html|css|scss)$/, '');

      // Split camelCase/kebab-case
      const words = name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/-/g, ' ')
        .toLowerCase()
        .split(' ')
        .filter(w => w.length > 2);

      for (const word of words) {
        if (!isCommonWord(word)) {
          tagCounts.set(word, (tagCounts.get(word) || 0) + 1);
        }
      }
    }
  }

  // Sort by count and take top N
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([tag]) => tag);
}

/**
 * Check if word is too common to be a useful tag
 */
function isCommonWord(word: string): boolean {
  const common = new Set([
    'component', 'service', 'module', 'model', 'interface', 'type',
    'spec', 'test', 'mock', 'stub', 'helper', 'util', 'utils',
    'index', 'main', 'app', 'core', 'shared', 'common', 'base',
  ]);
  return common.has(word);
}

/**
 * Detect file type pattern
 */
function detectFilePattern(files: string[]): string | null {
  const patterns = {
    services: files.filter(f => f.includes('.service.')).length,
    components: files.filter(f => f.includes('.component.')).length,
    modules: files.filter(f => f.includes('.module.')).length,
    pipes: files.filter(f => f.includes('.pipe.')).length,
    directives: files.filter(f => f.includes('.directive.')).length,
    guards: files.filter(f => f.includes('.guard.')).length,
    models: files.filter(f => f.includes('.model.') || f.includes('.interface.')).length,
  };

  const maxPattern = Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])[0];

  if (maxPattern && maxPattern[1] >= files.length * 0.5) {
    return maxPattern[0];
  }

  return null;
}

/**
 * Generate summary description
 */
function generateSummary(
  pkg: WorkPackage,
  files: CardFile[],
  effort: ReturnType<typeof estimateEffort>
): string {
  const parts: string[] = [];

  parts.push(`This card contains ${files.length} file${files.length > 1 ? 's' : ''}`);

  const conflictCount = files.filter(f => f.status === 'conflict').length;
  if (conflictCount > 0 && conflictCount < files.length) {
    parts.push(`(${conflictCount} conflicts)`);
  }

  const commonDir = findCommonDirectory(pkg.files);
  if (commonDir) {
    parts.push(`in the \`${commonDir}/\` directory`);
  }

  if (effort.complexity.hasServiceChanges) {
    parts.push('with service changes');
  } else if (effort.complexity.hasTemplateChanges) {
    parts.push('with template changes');
  }

  return parts.join(' ') + '.';
}

/**
 * Generate checklist items
 */
function generateChecklist(
  effort: ReturnType<typeof estimateEffort>,
  hasExternalDeps: boolean
): ChecklistItem[] {
  const items: ChecklistItem[] = [
    // Pre-migration
    { text: 'Review all file diffs', category: 'pre-migration', checked: false },
    { text: 'Identify breaking changes', category: 'pre-migration', checked: false },

    // Migration
    { text: 'Apply changes to merged branch', category: 'migration', checked: false },
    { text: 'Resolve merge conflicts', category: 'migration', checked: false },
  ];

  if (hasExternalDeps) {
    items.push({
      text: 'Verify imports from other packages work',
      category: 'migration',
      checked: false,
    });
  }

  // Post-migration
  items.push({
    text: 'Verify TypeScript compilation',
    category: 'post-migration',
    checked: false,
  });

  if (effort.complexity.hasServiceChanges) {
    items.push({
      text: 'Verify service injection works',
      category: 'post-migration',
      checked: false,
    });
  }

  if (effort.complexity.hasTemplateChanges) {
    items.push({
      text: 'Check template bindings render',
      category: 'post-migration',
      checked: false,
    });
  }

  // Testing
  items.push({
    text: 'Run unit tests for affected files',
    category: 'testing',
    checked: false,
  });
  items.push({
    text: 'Manual smoke test of feature',
    category: 'testing',
    checked: false,
  });

  return items;
}

/**
 * Compute dependencies between cards
 */
function computeCardDependencies(
  cards: WorkCard[],
  fileMap: Map<string, FileMatch>
): void {
  // Build card lookup by file
  const fileToCard = new Map<string, string>();
  for (const card of cards) {
    for (const file of card.files) {
      fileToCard.set(file.relativePath, card.id);
    }
  }

  // Find cross-card dependencies
  for (const card of cards) {
    const blockedBySet = new Set<string>();

    for (const file of card.files) {
      for (const dep of file.externalDeps) {
        const depCardId = fileToCard.get(dep);
        if (depCardId && depCardId !== card.id) {
          blockedBySet.add(depCardId);
        }
      }
    }

    card.blockedBy = Array.from(blockedBySet);
  }

  // Compute blocks (inverse of blockedBy)
  for (const card of cards) {
    for (const blockerId of card.blockedBy) {
      const blockerCard = cards.find(c => c.id === blockerId);
      if (blockerCard && !blockerCard.blocks.includes(card.id)) {
        blockerCard.blocks.push(card.id);
      }
    }
  }
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
