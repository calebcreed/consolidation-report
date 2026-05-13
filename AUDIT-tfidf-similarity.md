# AUDIT: TF-IDF for Code Similarity Analysis

## Task #7: Conflict File Grouping via Non-LLM NLP

**Context:** The webpos-consolidator project has ~272 conflict TypeScript/Angular files that need grouping by semantic similarity (same domain/feature area). LLMs cannot be used on the target machine, so we need a lightweight, non-LLM NLP approach.

---

## 1. TF-IDF Fundamentals

### What is TF-IDF?

**TF-IDF** (Term Frequency-Inverse Document Frequency) is a numerical statistic that reflects how important a word is to a document within a collection (corpus). It's the product of two metrics:

#### Term Frequency (TF)
How often a term appears in a single document, normalized by document length.

```
TF(t, d) = (count of term t in document d) / (total terms in document d)
```

A term that appears 10 times in a 100-word document has TF = 0.10

#### Inverse Document Frequency (IDF)
How rare or common a term is across ALL documents. Rare terms get higher weight.

```
IDF(t) = log(total documents / documents containing term t)
```

- Term in 1 of 272 files: IDF = log(272/1) = 5.61 (highly distinctive)
- Term in 272 of 272 files: IDF = log(272/272) = 0 (completely common, ignored)

#### Combined TF-IDF Score
```
TF-IDF(t, d) = TF(t, d) × IDF(t)
```

### Why TF-IDF is Perfect for This Use Case

1. **Finds distinctive domain terms:** "Payment", "inventory", "receipt" will have high TF-IDF in their respective feature areas because they appear frequently in related files but rarely elsewhere.

2. **Automatically ignores boilerplate:** Common Angular patterns (`Component`, `Injectable`, `Observable`, `subscribe`) appear in most files, so IDF drives their score toward zero.

3. **No training required:** Pure mathematical computation on the corpus itself.

4. **Deterministic:** Same input always produces same output (important for auditing).

5. **Fast:** Linear time complexity O(n × m) where n = documents, m = average terms.

### Cosine Similarity for Comparing Vectors

Each file becomes a vector in term-space where each dimension is a term's TF-IDF score.

```
File A vector: [0.0, 0.15, 0.0, 0.22, 0.08, ...]
File B vector: [0.0, 0.18, 0.0, 0.19, 0.05, ...]
```

**Cosine similarity** measures the angle between vectors, ignoring magnitude:

```
cosine_similarity(A, B) = (A · B) / (||A|| × ||B||)
```

- **1.0** = identical term profiles (same domain)
- **0.0** = no terms in common (completely different domains)
- **0.5-0.8** = related but distinct (e.g., payment-service.ts and payment-dialog.ts)

**Why cosine over Euclidean distance?**
- Normalizes for document length (a 500-line file and 50-line file can still be similar)
- Values bounded [0, 1] for easy threshold setting

---

## 2. Tokenization Strategy for Code

Code is NOT natural language. Effective tokenization requires code-aware processing.

### Step 1: Extract Meaningful Identifiers

**Include:**
- Class names: `PaymentService`, `InventoryComponent`
- Function/method names: `processRefund`, `calculateTotal`
- Property names: `orderId`, `customerName`
- Interface names: `IPaymentRequest`, `OrderDto`
- Enum values: `PaymentStatus.COMPLETED`
- Type aliases
- Decorator names (but not `@Component`, `@Injectable` - too common)

**Parse approach:**
```typescript
// Simple regex extraction (no AST needed)
const identifiers = code.match(/[A-Za-z_][A-Za-z0-9_]*/g);
```

### Step 2: Split Compound Identifiers

camelCase and PascalCase encode semantic meaning that must be extracted:

```typescript
function splitIdentifier(id: string): string[] {
  return id
    // Insert space before uppercase letters
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before sequences of uppercase followed by lowercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Split on spaces and underscores
    .split(/[\s_]+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);
}

// Examples:
// PaymentService -> ['payment', 'service']
// XMLHttpRequest -> ['xml', 'http', 'request']
// user_id -> ['user', 'id']
// calculateTotalWithTax -> ['calculate', 'total', 'with', 'tax']
```

### Step 3: Lowercase Normalization

All tokens converted to lowercase for matching:
- `Payment` = `payment` = `PAYMENT`

### Step 4: Code-Specific Stopwords

Remove terms that appear in nearly every TypeScript/Angular file:

```typescript
const CODE_STOPWORDS = new Set([
  // Language keywords
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
  'interface', 'type', 'enum', 'extends', 'implements', 'return', 'if',
  'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try',
  'catch', 'throw', 'new', 'this', 'super', 'static', 'public', 'private',
  'protected', 'readonly', 'async', 'await', 'void', 'null', 'undefined',
  'true', 'false', 'string', 'number', 'boolean', 'any', 'unknown', 'never',

  // Angular ubiquitous
  'component', 'injectable', 'module', 'directive', 'pipe', 'input', 'output',
  'subscribe', 'observable', 'subject', 'behaviorsubject', 'oninit', 'ondestroy',
  'ngmodule', 'declarations', 'providers', 'imports', 'exports',

  // RxJS common
  'map', 'filter', 'tap', 'switchmap', 'mergemap', 'catcherror', 'of', 'from',

  // Common programming terms
  'get', 'set', 'data', 'result', 'response', 'request', 'error', 'value',
  'item', 'items', 'list', 'array', 'object', 'index', 'length', 'key',

  // Single letters and tiny words
  'a', 'b', 'c', 'i', 'j', 'k', 'n', 'x', 'y', 'id', 'el', 'fn'
]);
```

**Note:** The stopword list should be tuned based on actual corpus analysis. Run TF-IDF once, identify terms with IDF near 0, add to stopwords.

### Step 5: String Literals - EXCLUDE

**Recommendation: EXCLUDE most string literals**

**Reasons to exclude:**
- Translation keys (`'PAYMENT.BUTTON.SUBMIT'`) vary wildly
- URLs, paths are noise
- Error messages are implementation details

**Implementation:**
```typescript
// Strip string literals before tokenization
const codeNoStrings = code
  .replace(/'[^']*'/g, '')
  .replace(/"[^"]*"/g, '')
  .replace(/`[^`]*`/g, '');
```

### Complete Tokenization Pipeline

```typescript
function tokenizeFile(code: string): string[] {
  // 1. Remove comments
  const noComments = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. Remove string literals
  const noStrings = noComments
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/`[^`]*`/g, ' ');

  // 3. Extract identifiers
  const identifiers = noStrings.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];

  // 4. Split compound names and lowercase
  const tokens = identifiers.flatMap(splitIdentifier);

  // 5. Remove stopwords and short tokens
  return tokens.filter(t =>
    t.length > 2 && !CODE_STOPWORDS.has(t)
  );
}
```

---

## 3. JavaScript Libraries

### Option A: `natural` Package (Recommended)

**NPM:** `npm install natural`

**Built-in TF-IDF class:**

```typescript
import { TfIdf } from 'natural';

const tfidf = new TfIdf();

// Add documents
conflictFiles.forEach((file, index) => {
  const tokens = tokenizeFile(file.content);
  tfidf.addDocument(tokens);
});

// Get TF-IDF vector for document 0
const vector: Record<string, number> = {};
tfidf.listTerms(0).forEach(item => {
  vector[item.term] = item.tfidf;
});

// Find similar documents to document 0
tfidf.tfidfs(tokenizeFile(file0.content), (docIndex, measure) => {
  console.log(`Document ${docIndex}: ${measure}`);
});
```

**Pros:**
- Battle-tested, well-maintained
- Handles TF-IDF math correctly
- Also includes: stemming, phonetics, classifiers, tokenizers
- 800K weekly downloads, active development

**Cons:**
- Large package if only using TF-IDF (but tree-shaking helps)
- Default tokenization is for English prose, not code (must provide our own tokens)

### Option B: Hand-Rolling TF-IDF

**Complexity: ~100 lines**

```typescript
interface TfIdfIndex {
  documents: string[][];           // tokens per document
  termDocFreq: Map<string, number>; // how many docs contain term
  docCount: number;
}

function buildIndex(documents: string[][]): TfIdfIndex {
  const termDocFreq = new Map<string, number>();

  documents.forEach(tokens => {
    const uniqueTerms = new Set(tokens);
    uniqueTerms.forEach(term => {
      termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
    });
  });

  return { documents, termDocFreq, docCount: documents.length };
}

function getTfIdfVector(
  docIndex: number,
  index: TfIdfIndex
): Map<string, number> {
  const tokens = index.documents[docIndex];
  const termCounts = new Map<string, number>();

  tokens.forEach(t => termCounts.set(t, (termCounts.get(t) || 0) + 1));

  const vector = new Map<string, number>();
  const docLength = tokens.length;

  termCounts.forEach((count, term) => {
    const tf = count / docLength;
    const df = index.termDocFreq.get(term) || 1;
    const idf = Math.log(index.docCount / df);
    vector.set(term, tf * idf);
  });

  return vector;
}

function cosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const allTerms = new Set([...vecA.keys(), ...vecB.keys()]);

  allTerms.forEach(term => {
    const a = vecA.get(term) || 0;
    const b = vecB.get(term) || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  });

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Pros:**
- Zero dependencies
- Full control over algorithm
- Smaller bundle size

**Cons:**
- Must implement and test yourself
- Edge cases (empty documents, division by zero)

### Performance Considerations for 900+ Files

| Operation | 272 Files | 900 Files | Notes |
|-----------|-----------|-----------|-------|
| Build index | ~50ms | ~150ms | Linear O(n) |
| Single similarity | <1ms | <1ms | O(vocabulary size) |
| Full matrix (n²) | ~1.8s | ~20s | 272² = 74K, 900² = 810K comparisons |

**Memory:**
- Each TF-IDF vector: ~500 terms × 8 bytes = 4KB
- 900 files: ~3.6MB for vectors (trivial)

**Verdict:** Performance is a non-issue for this scale.

---

## 4. Why NOT Code Embeddings

### What Are Code Embeddings?

**CodeBERT** (Microsoft, 2020):
- Transformer model pre-trained on 6M code-comment pairs
- Produces 768-dimensional vectors capturing semantic meaning
- Understands that `calculateSum` and `computeTotal` are similar

**UniXcoder**, **GraphCodeBERT**, **CodeT5**, etc.:
- Various improvements adding AST structure, documentation, etc.

### Why They're Overkill Here

| Factor | TF-IDF | Code Embeddings |
|--------|--------|-----------------|
| **Model size** | 0 MB | 500MB - 2GB |
| **Inference time** | <1ms/file | 50-200ms/file |
| **Dependencies** | 1 NPM package | Python, PyTorch, CUDA |
| **Setup complexity** | 5 minutes | Hours |
| **Semantic understanding** | Lexical only | Deep semantic |
| **Target machine support** | Any | GPU recommended |

**Our specific constraints:**
1. "LLMs cannot be used on the target machine" - eliminates embedding models
2. 272 files is small enough that lexical similarity suffices
3. We're grouping by feature area (payment, inventory, etc.) - these WILL share vocabulary
4. Files already have descriptive names providing strong signal

### When You WOULD Use Embeddings

- **Code clone detection:** Finding semantically similar code with different variable names
- **Code search:** "Find functions that validate email addresses"
- **Cross-language similarity:** Comparing Python and JavaScript implementations
- **Plagiarism detection:** When obfuscation is expected

**Our use case:** Same codebase, same naming conventions, goal is grouping by domain. TF-IDF is the right tool.

---

## 5. Integration with the Consolidator

### Where to Hook In

```
1. File Discovery      -> Find all conflict files
2. File Comparison     -> Existing: compare individual pairs
3. [NEW] Similarity    -> Compute cross-file similarity
4. [NEW] Clustering    -> Group similar files
5. Reporting           -> Include cluster info in reports
```

**Hook point:** After file comparison completes, before final reporting.

### Output Format (Recommended)

Per-file top-K similar + cluster assignment:

```typescript
interface FileSimilarity {
  file: string;
  topSimilar: Array<{
    file: string;
    score: number;
  }>;  // Top 10-20 most similar
  clusterAssignment?: number;
}
```

### Automatic Cluster Labeling

Extract the most distinctive term(s) from each cluster:

```typescript
function labelCluster(
  clusterFiles: string[],
  allTermVectors: Map<string, Map<string, number>>
): string {
  const clusterVector = new Map<string, number>();

  clusterFiles.forEach(file => {
    const vec = allTermVectors.get(file)!;
    vec.forEach((score, term) => {
      clusterVector.set(term, (clusterVector.get(term) || 0) + score);
    });
  });

  const sorted = [...clusterVector.entries()]
    .sort((a, b) => b[1] - a[1]);

  return sorted[0]?.[0] || 'unknown';
}
```

**Expected labels:** `payment`, `inventory`, `order`, `customer`, `receipt`, `menu`, etc.

---

## 6. Summary

| Aspect | Recommendation |
|--------|----------------|
| **Algorithm** | TF-IDF with cosine similarity |
| **Library** | `natural` package (or hand-roll ~100 LOC) |
| **Tokenization** | Extract identifiers, split camelCase, code stopwords |
| **String literals** | Exclude (noise) |
| **Output** | Per-file top-K similar + cluster assignment |
| **Clustering** | Simple threshold (0.3) or hierarchical |
| **Performance** | <30s for 900 files, <5s for 272 |

**Why not embeddings?** Target machine constraints, lexical similarity sufficient for domain grouping, vastly simpler implementation.

---

## 7. Next Steps

1. Implement tokenizer with code-specific stopwords
2. Build TF-IDF index using `natural` or hand-rolled
3. Compute pairwise similarities (threshold at 0.3)
4. Cluster and auto-label
5. Integrate into consolidator reporting
