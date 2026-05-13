# SPEC: Work Package Card Generation

**Project:** webpos-consolidator
**Feature:** Generate actionable work cards from clustering results
**Spec Version:** 1.0
**Date:** 2026-05-12

---

## 1. Overview

### What This Feature Does

Transforms clustering results into actionable **work cards** - structured documents that guide developers through migrating each package of conflict files. Each card contains:

- Package summary and priority
- File list with status indicators
- Dependency information (what must be done first)
- Estimated effort
- Suggested review checklist

### Why It Is Needed

Raw clustering output is useful for analysis but not actionable. Work cards:

1. **Guide execution** - Clear instructions for each migration batch
2. **Enable parallelism** - Independent cards can be worked simultaneously
3. **Track progress** - Cards serve as migration checklist
4. **Communicate scope** - Share with stakeholders

### Expected Output

Given 272 conflict files in ~22 packages, generate:
- 22 structured work cards (JSON/Markdown)
- 1 summary dashboard
- Dependency graph showing card ordering

---

## 2. Card Structure

### 2.1 WorkCard Interface

```typescript
export interface WorkCard {
  /** Unique card identifier */
  id: string;

  /** Human-readable title (auto-generated or custom) */
  title: string;

  /** Card priority (1 = highest) */
  priority: number;

  /** Execution status */
  status: 'pending' | 'in_progress' | 'blocked' | 'completed';

  /** Package this card represents */
  package: WorkPackage;

  /** Files in this card with detailed info */
  files: CardFile[];

  /** Cards that must be completed before this one */
  blockedBy: string[];

  /** Cards that this one unblocks */
  blocks: string[];

  /** Estimated effort metrics */
  effort: EffortEstimate;

  /** Domain/feature tags (from TF-IDF distinctive terms) */
  tags: string[];

  /** Generated summary description */
  summary: string;

  /** Review checklist items */
  checklist: ChecklistItem[];
}
```

### 2.2 CardFile Interface

```typescript
export interface CardFile {
  /** Relative path */
  relativePath: string;

  /** File status in comparison */
  status: 'conflict' | 'retail-only' | 'restaurant-only';

  /** Lines changed (for effort estimation) */
  linesChanged: number;

  /** Dependencies within this card */
  internalDeps: string[];

  /** Dependencies outside this card */
  externalDeps: string[];

  /** Brief description of changes needed */
  changeDescription?: string;
}
```

### 2.3 EffortEstimate Interface

```typescript
export interface EffortEstimate {
  /** Total files in card */
  fileCount: number;

  /** Total lines changed across all files */
  totalLinesChanged: number;

  /** T-shirt size: XS, S, M, L, XL */
  size: 'XS' | 'S' | 'M' | 'L' | 'XL';

  /** Complexity factors */
  complexity: {
    hasExternalDeps: boolean;
    hasCyclicDeps: boolean;
    hasTemplateChanges: boolean;
    hasServiceChanges: boolean;
  };
}
```

### 2.4 ChecklistItem Interface

```typescript
export interface ChecklistItem {
  /** Checklist item text */
  text: string;

  /** Whether item is checked */
  checked: boolean;

  /** Category of check */
  category: 'pre-migration' | 'migration' | 'post-migration' | 'testing';
}
```

---

## 3. Module Structure

### 3.1 New Directory

```
src/cards/
├── index.ts              # Public exports
├── types.ts              # Card interfaces
├── generator.ts          # Card generation logic
├── prioritizer.ts        # Priority and ordering
├── effort-estimator.ts   # Effort estimation
├── formatters/
│   ├── json.ts           # JSON output
│   ├── markdown.ts       # Markdown output
│   └── summary.ts        # Dashboard summary
```

### 3.2 Module Exports

```typescript
// src/cards/index.ts

export type {
  WorkCard,
  CardFile,
  EffortEstimate,
  ChecklistItem,
  CardGenerationOptions,
  CardSet,
} from './types';

export { generateWorkCards } from './generator';
export { prioritizeCards, computeDependencyOrder } from './prioritizer';
export { estimateEffort, getSizeLabel } from './effort-estimator';
export { formatAsJson, formatAsMarkdown, formatSummary } from './formatters';
```

---

## 4. API Design

### 4.1 Primary Function

```typescript
/**
 * Generate work cards from clustering result and analysis report.
 *
 * @param clusterResult - Combined clustering result
 * @param report - Analysis report with file details
 * @param options - Generation options
 * @returns CardSet with all generated cards
 */
export function generateWorkCards(
  clusterResult: CombinedClusteringResult,
  report: AnalysisReport,
  options?: CardGenerationOptions
): CardSet;
```

### 4.2 CardGenerationOptions

```typescript
export interface CardGenerationOptions {
  /** Include checklist items (default: true) */
  includeChecklist?: boolean;

  /** Include effort estimates (default: true) */
  includeEffort?: boolean;

  /** Custom title generator */
  titleGenerator?: (pkg: WorkPackage, tags: string[]) => string;

  /** Minimum files to create a card (default: 1) */
  minFilesPerCard?: number;

  /** Maximum tags per card (default: 5) */
  maxTags?: number;
}
```

### 4.3 CardSet Interface

```typescript
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
    sourceReport: string;
    clusteringParams: {
      resolution: number;
      topologicalWeight: number;
    };
  };
}
```

---

## 5. Title Generation

### 5.1 Auto-Generated Titles

Titles are generated from:
1. **Distinctive terms** from TF-IDF (top 2-3)
2. **Common path prefix** if files share directory
3. **File type pattern** (services, components, etc.)

### 5.2 Title Generation Algorithm

```typescript
function generateTitle(pkg: WorkPackage, distinctiveTerms: string[]): string {
  // 1. Try common directory
  const commonDir = findCommonDirectory(pkg.files);
  if (commonDir && commonDir !== 'src/app') {
    const dirName = commonDir.split('/').pop();
    return capitalize(dirName) + ' Module';
  }

  // 2. Use distinctive terms
  if (distinctiveTerms.length >= 2) {
    return distinctiveTerms
      .slice(0, 2)
      .map(capitalize)
      .join(' ') + ' Changes';
  }

  // 3. Fallback to file pattern
  const pattern = detectFilePattern(pkg.files);
  if (pattern) {
    return capitalize(pattern) + ' Updates';
  }

  // 4. Generic fallback
  return `Package ${pkg.id + 1}`;
}
```

### 5.3 Example Titles

| Package Contents | Generated Title |
|------------------|-----------------|
| `payment/*.ts` files | "Payment Module" |
| Files with terms: inventory, stock | "Inventory Stock Changes" |
| Multiple `*.service.ts` files | "Service Updates" |
| Mixed files, no pattern | "Package 7" |

---

## 6. Priority Calculation

### 6.1 Priority Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| **Dependency depth** | 40% | Cards with no blockers = higher priority |
| **Unlock count** | 30% | Cards that unblock many others = higher priority |
| **Effort size** | 20% | Smaller cards = higher priority (quick wins) |
| **Cohesion** | 10% | Higher cohesion = easier to work on |

### 6.2 Priority Algorithm

```typescript
function calculatePriority(
  card: WorkCard,
  allCards: WorkCard[],
  dependencyGraph: Map<string, string[]>
): number {
  // 1. Dependency depth (0 = no blockers)
  const depth = getMaxDependencyDepth(card.id, dependencyGraph);
  const depthScore = Math.max(0, 10 - depth * 2);

  // 2. Unlock count
  const unlockCount = card.blocks.length;
  const unlockScore = Math.min(10, unlockCount * 2);

  // 3. Effort (inverse - smaller is better)
  const effortScore = {
    'XS': 10, 'S': 8, 'M': 6, 'L': 4, 'XL': 2
  }[card.effort.size];

  // 4. Cohesion
  const cohesionScore = card.package.cohesion * 10;

  // Weighted sum (lower = higher priority)
  return (
    depthScore * 0.4 +
    unlockScore * 0.3 +
    effortScore * 0.2 +
    cohesionScore * 0.1
  );
}
```

### 6.3 Execution Order

Cards are ordered by:
1. **Topological sort** of dependency graph (required)
2. **Priority score** within each dependency level (optimization)

---

## 7. Effort Estimation

### 7.1 Size Thresholds

| Size | Files | Lines Changed |
|------|-------|---------------|
| XS | 1-2 | < 50 |
| S | 3-5 | 50-150 |
| M | 6-10 | 150-400 |
| L | 11-15 | 400-800 |
| XL | 16+ | 800+ |

### 7.2 Complexity Factors

```typescript
function detectComplexity(files: CardFile[]): ComplexityFactors {
  return {
    hasExternalDeps: files.some(f => f.externalDeps.length > 0),
    hasCyclicDeps: detectCycles(files),
    hasTemplateChanges: files.some(f =>
      f.relativePath.includes('.component.') ||
      f.relativePath.includes('.html')
    ),
    hasServiceChanges: files.some(f =>
      f.relativePath.includes('.service.')
    ),
  };
}
```

---

## 8. Checklist Generation

### 8.1 Standard Checklist Template

```typescript
const STANDARD_CHECKLIST: ChecklistItem[] = [
  // Pre-migration
  { text: 'Review all file diffs', category: 'pre-migration', checked: false },
  { text: 'Identify breaking changes', category: 'pre-migration', checked: false },
  { text: 'Check blocked-by cards are complete', category: 'pre-migration', checked: false },

  // Migration
  { text: 'Apply retail changes to merged branch', category: 'migration', checked: false },
  { text: 'Resolve merge conflicts', category: 'migration', checked: false },
  { text: 'Update imports if paths changed', category: 'migration', checked: false },

  // Post-migration
  { text: 'Verify TypeScript compilation', category: 'post-migration', checked: false },
  { text: 'Check for console errors', category: 'post-migration', checked: false },

  // Testing
  { text: 'Run unit tests for affected files', category: 'testing', checked: false },
  { text: 'Manual smoke test of feature', category: 'testing', checked: false },
];
```

### 8.2 Conditional Checklist Items

```typescript
function getConditionalChecklist(card: WorkCard): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  if (card.effort.complexity.hasServiceChanges) {
    items.push({
      text: 'Verify service injection still works',
      category: 'post-migration',
      checked: false,
    });
  }

  if (card.effort.complexity.hasTemplateChanges) {
    items.push({
      text: 'Check template bindings render correctly',
      category: 'testing',
      checked: false,
    });
  }

  if (card.blockedBy.length > 0) {
    items.push({
      text: `Verify imports from: ${card.blockedBy.join(', ')}`,
      category: 'post-migration',
      checked: false,
    });
  }

  return items;
}
```

---

## 9. Output Formats

### 9.1 JSON Output

```typescript
function formatAsJson(cardSet: CardSet): string {
  return JSON.stringify(cardSet, null, 2);
}
```

### 9.2 Markdown Output (Per Card)

```markdown
# Card 1: Payment Module

**Priority:** 1 (High)
**Status:** pending
**Effort:** M (8 files, ~320 lines)
**Tags:** payment, transaction, refund

## Summary
This card contains 8 files related to payment processing.
All files are in the `src/app/payment/` directory.

## Blocked By
- None (can start immediately)

## Blocks
- Card 3: Order Processing
- Card 7: Checkout Flow

## Files

| File | Status | Lines | Internal Deps | External Deps |
|------|--------|-------|---------------|---------------|
| payment.service.ts | conflict | 45 | 2 | 1 |
| payment-dialog.component.ts | conflict | 78 | 1 | 0 |
| ... | ... | ... | ... | ... |

## Checklist

### Pre-Migration
- [ ] Review all file diffs
- [ ] Identify breaking changes

### Migration
- [ ] Apply retail changes to merged branch
- [ ] Resolve merge conflicts

### Testing
- [ ] Run unit tests for affected files
- [ ] Verify service injection still works
```

### 9.3 Summary Dashboard

```markdown
# Migration Work Cards Summary

**Generated:** 2026-05-12T10:30:00Z
**Total Cards:** 22
**Total Files:** 272
**Total Lines Changed:** ~4,850

## Effort Distribution

| Size | Count | Files | Lines |
|------|-------|-------|-------|
| XS | 3 | 5 | 120 |
| S | 8 | 32 | 890 |
| M | 7 | 64 | 2,100 |
| L | 3 | 38 | 1,200 |
| XL | 1 | 18 | 540 |

## Execution Order

```
Phase 1 (No blockers):
  ├── Card 1: Payment Module [M]
  ├── Card 2: Auth Services [S]
  └── Card 5: Shared Utils [XS]

Phase 2 (After Phase 1):
  ├── Card 3: Order Processing [L]
  └── Card 4: Inventory [M]

Phase 3 (After Phase 2):
  └── Card 7: Checkout Flow [XL]
```

## Cards by Priority

1. **Payment Module** - M, 0 blockers, unblocks 2
2. **Auth Services** - S, 0 blockers, unblocks 3
3. **Shared Utils** - XS, 0 blockers, unblocks 5
...
```

---

## 10. Integration

### 10.1 Server Analysis Hook

Add after clustering in `server-analysis.ts`:

```typescript
// After clustering...
const cardSet = generateWorkCards(clusterResult, report, {
  includeChecklist: true,
  includeEffort: true,
});

// Write outputs
fs.writeFileSync('work-cards.json', formatAsJson(cardSet));
fs.writeFileSync('work-cards.md', formatAsMarkdown(cardSet));
fs.writeFileSync('work-cards-summary.md', formatSummary(cardSet));
```

### 10.2 Report Extension

```typescript
export interface AnalysisReport {
  // ... existing fields

  /** Generated work cards */
  workCards?: CardSet;
}
```

---

## 11. Test Cases

### 11.1 Card Generation

| Test | Description |
|------|-------------|
| `generates one card per package` | 1:1 mapping |
| `all files assigned to cards` | No missing files |
| `titles are unique` | No duplicate titles |
| `tags extracted from TF-IDF` | Distinctive terms used |

### 11.2 Priority & Ordering

| Test | Description |
|------|-------------|
| `cards with no blockers have highest priority` | Depth 0 first |
| `execution order respects dependencies` | Topological sort |
| `circular deps handled gracefully` | No infinite loops |

### 11.3 Formatters

| Test | Description |
|------|-------------|
| `JSON is valid` | Parses without error |
| `Markdown renders correctly` | Valid MD syntax |
| `Summary totals match` | Counts are accurate |

---

## 12. Acceptance Criteria

### Functional
- [ ] Cards generated for each work package
- [ ] Dependencies correctly identified
- [ ] Effort estimates reasonable
- [ ] Checklist items relevant
- [ ] All output formats valid

### Quality
- [ ] Titles are descriptive and unique
- [ ] Priority ordering makes sense
- [ ] Execution order is achievable

### Performance
- [ ] Card generation < 1 second for 300 files

---

## Appendix: Implementation Checklist

1. [ ] Create `src/cards/` directory
2. [ ] Implement `types.ts`
3. [ ] Implement `effort-estimator.ts`
4. [ ] Implement `prioritizer.ts`
5. [ ] Implement `generator.ts`
6. [ ] Implement `formatters/json.ts`
7. [ ] Implement `formatters/markdown.ts`
8. [ ] Implement `formatters/summary.ts`
9. [ ] Create `index.ts` exports
10. [ ] Write unit tests
11. [ ] Integrate with server-analysis
