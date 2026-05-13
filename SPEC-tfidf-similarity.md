# SPEC: TF-IDF Content Similarity Scoring

**Project:** webpos-consolidator
**Feature:** Group conflict files by semantic similarity using TF-IDF
**Spec Version:** 1.0
**Date:** 2026-05-11

---

## 1. Overview

### What This Feature Does

This feature adds TF-IDF (Term Frequency-Inverse Document Frequency) content similarity scoring to webpos-consolidator. It enables automatic grouping of conflict files by semantic similarity based on their code content, identifying files that belong to the same domain/feature area (e.g., payment, inventory, orders).

### Why It Is Needed

The project has approximately 272 conflict files. By grouping semantically related files:

1. **Batch related work** - Resolve all payment-related conflicts together
2. **Identify patterns** - See common themes in conflicts within a domain
3. **Reduce context-switching** - Work within a single feature area

### Constraints

- **No LLMs** - Target machine cannot run LLM inference
- **Deterministic output** - Same input produces identical results
- **Performance** - Analysis of 900 files must complete in under 30 seconds

---

## 2. Library Choice: `natural` Package

**Recommendation: Use `natural`**

| Factor | `natural` | Hand-rolled |
|--------|-----------|-------------|
| **Implementation time** | <1 hour | 2-4 hours |
| **Bug risk** | Low (battle-tested) | Medium |
| **Weekly downloads** | 800K+ | N/A |
| **TF-IDF correctness** | Proven | Must verify |

```typescript
import { TfIdf } from 'natural';
```

---

## 3. Dependencies to Add

```json
{
  "dependencies": {
    "natural": "^6.10.0"
  },
  "devDependencies": {
    "@types/natural": "^5.1.5"
  }
}
```

```bash
npm install natural
npm install -D @types/natural
```

---

## 4. New Module Structure

### Directory: `src/similarity/`

```
src/similarity/
  index.ts         # Public exports
  types.ts         # Interfaces and type definitions
  tokenizer.ts     # Code-aware tokenization pipeline
  tfidf.ts         # TF-IDF index building and similarity computation
  stopwords.ts     # Code-specific stopword list
```

### Module Exports

```typescript
// src/similarity/index.ts

export {
  TfIdfIndex,
  SimilarFile,
  FileSimilarity,
  FileContent,
  TokenizationOptions,
} from './types';

export { tokenizeFile } from './tokenizer';
export {
  buildTfIdfIndex,
  computeSimilarity,
  getTopSimilar,
  computeAllSimilarities,
} from './tfidf';

export { CODE_STOPWORDS } from './stopwords';
```

---

## 5. Tokenization Rules

### 5.1 Identifier Extraction Regex

```typescript
const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;
```

### 5.2 camelCase/PascalCase Splitting Function

```typescript
/**
 * Splits compound identifiers into constituent words.
 *
 * @example
 * splitIdentifier('PaymentService')     // ['payment', 'service']
 * splitIdentifier('XMLHttpRequest')     // ['xml', 'http', 'request']
 * splitIdentifier('user_id')            // ['user', 'id']
 */
function splitIdentifier(identifier: string): string[] {
  return identifier
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_]+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);
}
```

### 5.3 Code Stopwords List

```typescript
export const CODE_STOPWORDS = new Set([
  // TypeScript Keywords
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
  'interface', 'type', 'enum', 'extends', 'implements', 'return', 'if',
  'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try',
  'catch', 'throw', 'new', 'this', 'super', 'static', 'public', 'private',
  'protected', 'readonly', 'async', 'await', 'void', 'null', 'undefined',
  'true', 'false', 'string', 'number', 'boolean', 'any', 'unknown', 'never',

  // Angular Ubiquitous
  'component', 'injectable', 'module', 'directive', 'pipe', 'input', 'output',
  'subscribe', 'observable', 'subject', 'behaviorsubject', 'oninit', 'ondestroy',
  'ngmodule', 'declarations', 'providers', 'imports', 'exports',

  // RxJS Common
  'map', 'filter', 'tap', 'switchmap', 'mergemap', 'catcherror', 'of', 'from',

  // Common Programming Terms
  'get', 'set', 'data', 'result', 'response', 'request', 'error', 'value',
  'item', 'items', 'list', 'array', 'object', 'index', 'length', 'key',

  // Single Letters
  'a', 'b', 'c', 'i', 'j', 'k', 'n', 'x', 'y', 'id', 'el', 'fn',
]);
```

### 5.4 Content Exclusions

```typescript
function stripComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripStrings(code: string): string {
  return code
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ');
}
```

### 5.5 Complete Tokenization Pipeline

```typescript
function tokenizeFile(content: string, options?: TokenizationOptions): string[] {
  let code = content;

  // 1. Remove comments
  code = stripComments(code);

  // 2. Remove string literals
  code = stripStrings(code);

  // 3. Extract identifiers
  const identifiers = code.match(IDENTIFIER_REGEX) || [];

  // 4. Split compound names and lowercase
  const tokens = identifiers.flatMap(splitIdentifier);

  // 5. Remove stopwords and short tokens
  const minLength = options?.minTokenLength ?? 3;
  return tokens.filter(t =>
    t.length >= minLength && !CODE_STOPWORDS.has(t)
  );
}
```

---

## 6. API Design

### 6.1 Type Definitions

```typescript
// src/similarity/types.ts

export interface TokenizationOptions {
  minTokenLength?: number;  // default: 3
  additionalStopwords?: string[];
  stripComments?: boolean;  // default: true
  stripStrings?: boolean;   // default: true
}

export interface FileContent {
  relativePath: string;
  content: string;
}

export interface TfIdfIndex {
  filePaths: string[];
  documents: string[][];
  termDocFreq: Map<string, number>;
  docCount: number;
  vectors: Map<string, number>[];
  norms: number[];
}

export interface SimilarFile {
  relativePath: string;
  score: number;  // [0, 1]
}

export interface FileSimilarity {
  relativePath: string;
  topSimilar: SimilarFile[];
  tokenCount: number;
  distinctiveTerms: string[];
}
```

### 6.2 Function Signatures

```typescript
/**
 * Tokenizes a source file into normalized terms.
 */
export function tokenizeFile(
  content: string,
  options?: TokenizationOptions
): string[];

/**
 * Builds a TF-IDF index from a collection of files.
 */
export function buildTfIdfIndex(
  files: FileContent[],
  options?: TokenizationOptions
): TfIdfIndex;

/**
 * Computes cosine similarity between two files.
 * Returns value in [0, 1].
 */
export function computeSimilarity(
  fileIndexA: number,
  fileIndexB: number,
  index: TfIdfIndex
): number;

/**
 * Finds the K most similar files to a given file.
 */
export function getTopSimilar(
  fileIndex: number,
  index: TfIdfIndex,
  k?: number,        // default: 10
  minScore?: number  // default: 0.1
): SimilarFile[];

/**
 * Computes similarity results for all files.
 */
export function computeAllSimilarities(
  index: TfIdfIndex,
  k?: number,
  minScore?: number
): FileSimilarity[];
```

---

## 7. Integration Point

### Hook Location

After `ReportAnalyzer.analyze()` completes, before final report generation:

```
1. File Discovery
2. Dependency Extraction
3. File Comparison
4. Report Analysis
5. [NEW] Similarity Analysis  ← Hook here
6. Report Generation
```

### Integration Code

```typescript
// Add to ReportAnalyzer class
analyzeSimilarity(fileMatches: FileMatch[]): FileSimilarity[] {
  const conflictFiles: FileContent[] = fileMatches
    .filter(f => f.status === 'conflict')
    .map(f => ({
      relativePath: f.relativePath,
      content: fs.readFileSync(f.retailPath || f.restaurantPath!, 'utf-8'),
    }));

  if (conflictFiles.length === 0) return [];

  const index = buildTfIdfIndex(conflictFiles);
  return computeAllSimilarities(index, 10, 0.2);
}
```

---

## 8. Output Format

### Example Output

```json
{
  "relativePath": "src/app/payment/payment.service.ts",
  "topSimilar": [
    { "relativePath": "src/app/payment/payment-dialog.component.ts", "score": 0.82 },
    { "relativePath": "src/app/payment/refund.service.ts", "score": 0.76 },
    { "relativePath": "src/app/payment/payment-method.model.ts", "score": 0.71 }
  ],
  "tokenCount": 127,
  "distinctiveTerms": ["payment", "refund", "transaction", "gateway", "stripe"]
}
```

---

## 9. Performance Considerations

| Operation | 272 Files | 900 Files |
|-----------|-----------|-----------|
| Tokenization | ~20ms | ~60ms |
| Build Index | ~50ms | ~150ms |
| Single Similarity | <1ms | <1ms |
| All Pairwise (n²) | ~1.8s | ~20s |

**Memory:** ~6MB for 900 files

**Verdict:** Performance is not a concern at this scale.

---

## 10. Test Cases

### Tokenizer Tests

```typescript
describe('splitIdentifier', () => {
  it('splits camelCase', () => {
    expect(splitIdentifier('paymentService')).toEqual(['payment', 'service']);
  });

  it('handles XMLHttpRequest', () => {
    expect(splitIdentifier('XMLHttpRequest')).toEqual(['xml', 'http', 'request']);
  });

  it('splits snake_case', () => {
    expect(splitIdentifier('payment_service')).toEqual(['payment', 'service']);
  });
});

describe('tokenizeFile', () => {
  it('extracts domain terms', () => {
    const content = `class PaymentService { processRefund() {} }`;
    const tokens = tokenizeFile(content);
    expect(tokens).toContain('payment');
    expect(tokens).toContain('refund');
  });

  it('removes stopwords', () => {
    const tokens = tokenizeFile(`export class TestClass {}`);
    expect(tokens).not.toContain('export');
    expect(tokens).not.toContain('class');
  });

  it('strips comments', () => {
    const tokens = tokenizeFile(`// PaymentProcessor\nclass RealClass {}`);
    expect(tokens).not.toContain('payment');
    expect(tokens).toContain('real');
  });
});
```

### TF-IDF Tests

```typescript
describe('computeSimilarity', () => {
  it('returns 1.0 for identical files', () => {
    const files = [
      { relativePath: 'a.ts', content: 'class PaymentService {}' },
      { relativePath: 'b.ts', content: 'class PaymentService {}' },
    ];
    const index = buildTfIdfIndex(files);
    expect(computeSimilarity(0, 1, index)).toBeCloseTo(1.0);
  });

  it('returns higher score for related files', () => {
    const files = [
      { relativePath: 'a.ts', content: 'class PaymentService { processPayment() }' },
      { relativePath: 'b.ts', content: 'class PaymentDialog { showPayment() }' },
      { relativePath: 'c.ts', content: 'class InventoryService { checkStock() }' },
    ];
    const index = buildTfIdfIndex(files);
    const paymentSim = computeSimilarity(0, 1, index);
    const crossDomainSim = computeSimilarity(0, 2, index);
    expect(paymentSim).toBeGreaterThan(crossDomainSim);
  });
});
```

---

## 11. Acceptance Criteria

### Functional
- [ ] `tokenizeFile` splits camelCase, PascalCase, snake_case
- [ ] `tokenizeFile` removes comments and string literals
- [ ] `tokenizeFile` filters stopwords
- [ ] `computeSimilarity` returns [0, 1]
- [ ] `computeSimilarity` returns 1.0 for identical content
- [ ] `getTopSimilar` excludes source file from results
- [ ] `computeAllSimilarities` includes distinctive terms

### Performance
- [ ] Build index for 300 files in < 1 second
- [ ] Full pairwise for 300 files in < 5 seconds

### Integration
- [ ] `FileSimilarity[]` available in `AnalysisReport`
- [ ] HTML report displays similar files per conflict

---

## Appendix: Implementation Checklist

1. [ ] Create `src/similarity/` directory
2. [ ] Implement `types.ts`
3. [ ] Implement `stopwords.ts`
4. [ ] Implement `tokenizer.ts`
5. [ ] Implement `tfidf.ts`
6. [ ] Create `index.ts` exports
7. [ ] Install `natural` and types
8. [ ] Write unit tests
9. [ ] Integrate with `ReportAnalyzer`
10. [ ] Update HTML report template
