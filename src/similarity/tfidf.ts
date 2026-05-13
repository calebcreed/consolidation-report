/**
 * TF-IDF - Term Frequency-Inverse Document Frequency implementation
 *
 * Computes TF-IDF vectors for code files and calculates cosine similarity
 * to find semantically related files.
 */

import {
  TokenizationOptions,
  FileContent,
  TfIdfIndex,
  SimilarFile,
  FileSimilarity,
} from './types';
import { tokenizeFile, getTokenFrequencies } from './tokenizer';

/**
 * Builds a TF-IDF index from a collection of files.
 *
 * @param files - Array of file contents to index
 * @param options - Tokenization options
 * @returns TfIdfIndex for similarity computation
 */
export function buildTfIdfIndex(
  files: FileContent[],
  options?: TokenizationOptions
): TfIdfIndex {
  const filePaths: string[] = [];
  const documents: string[][] = [];
  const termDocFreq = new Map<string, number>();

  // Tokenize all documents and compute document frequency
  for (const file of files) {
    filePaths.push(file.relativePath);
    const tokens = tokenizeFile(file.content, options);
    documents.push(tokens);

    // Track which terms appear in this document (unique)
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
    }
  }

  const docCount = files.length;

  // Compute TF-IDF vectors
  const vectors: Map<string, number>[] = [];
  const norms: number[] = [];

  for (const tokens of documents) {
    const vector = new Map<string, number>();
    const termFreq = getTokenFrequencies(tokens);
    const maxFreq = Math.max(...termFreq.values(), 1);

    let normSquared = 0;

    for (const [term, freq] of termFreq) {
      // TF: normalized term frequency (0.5 + 0.5 * freq/maxFreq)
      const tf = 0.5 + 0.5 * (freq / maxFreq);

      // IDF: inverse document frequency
      const df = termDocFreq.get(term) || 1;
      const idf = Math.log(docCount / df);

      // TF-IDF
      const tfidf = tf * idf;

      if (tfidf > 0) {
        vector.set(term, tfidf);
        normSquared += tfidf * tfidf;
      }
    }

    vectors.push(vector);
    norms.push(Math.sqrt(normSquared));
  }

  return {
    filePaths,
    documents,
    termDocFreq,
    docCount,
    vectors,
    norms,
  };
}

/**
 * Computes cosine similarity between two files.
 *
 * @param fileIndexA - Index of first file in the index
 * @param fileIndexB - Index of second file in the index
 * @param index - The TF-IDF index
 * @returns Cosine similarity in [0, 1]
 */
export function computeSimilarity(
  fileIndexA: number,
  fileIndexB: number,
  index: TfIdfIndex
): number {
  if (fileIndexA === fileIndexB) return 1.0;

  const vectorA = index.vectors[fileIndexA];
  const vectorB = index.vectors[fileIndexB];
  const normA = index.norms[fileIndexA];
  const normB = index.norms[fileIndexB];

  if (normA === 0 || normB === 0) return 0;

  // Compute dot product
  let dotProduct = 0;
  const smaller = vectorA.size < vectorB.size ? vectorA : vectorB;
  const larger = vectorA.size < vectorB.size ? vectorB : vectorA;

  for (const [term, valueA] of smaller) {
    const valueB = larger.get(term);
    if (valueB !== undefined) {
      dotProduct += valueA * valueB;
    }
  }

  // Cosine similarity
  return dotProduct / (normA * normB);
}

/**
 * Finds the K most similar files to a given file.
 *
 * @param fileIndex - Index of the source file
 * @param index - The TF-IDF index
 * @param k - Maximum number of results (default: 10)
 * @param minScore - Minimum similarity score to include (default: 0.1)
 * @returns Array of similar files, sorted by score descending
 */
export function getTopSimilar(
  fileIndex: number,
  index: TfIdfIndex,
  k: number = 10,
  minScore: number = 0.1
): SimilarFile[] {
  const similarities: SimilarFile[] = [];

  for (let i = 0; i < index.docCount; i++) {
    if (i === fileIndex) continue; // Skip self

    const score = computeSimilarity(fileIndex, i, index);
    if (score >= minScore) {
      similarities.push({
        relativePath: index.filePaths[i],
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  // Sort by score descending and take top k
  similarities.sort((a, b) => b.score - a.score);
  return similarities.slice(0, k);
}

/**
 * Get the most distinctive terms for a file (highest TF-IDF values)
 *
 * @param fileIndex - Index of the file
 * @param index - The TF-IDF index
 * @param k - Number of terms to return (default: 5)
 * @returns Array of distinctive terms
 */
export function getDistinctiveTerms(
  fileIndex: number,
  index: TfIdfIndex,
  k: number = 5
): string[] {
  const vector = index.vectors[fileIndex];

  // Sort terms by TF-IDF value descending
  const entries = Array.from(vector.entries());
  entries.sort((a, b) => b[1] - a[1]);

  return entries.slice(0, k).map(([term]) => term);
}

/**
 * Computes similarity results for all files.
 *
 * @param index - The TF-IDF index
 * @param k - Max similar files per file (default: 10)
 * @param minScore - Minimum similarity score (default: 0.1)
 * @returns Array of FileSimilarity for each file
 */
export function computeAllSimilarities(
  index: TfIdfIndex,
  k: number = 10,
  minScore: number = 0.1
): FileSimilarity[] {
  const results: FileSimilarity[] = [];

  for (let i = 0; i < index.docCount; i++) {
    results.push({
      relativePath: index.filePaths[i],
      topSimilar: getTopSimilar(i, index, k, minScore),
      tokenCount: index.documents[i].length,
      distinctiveTerms: getDistinctiveTerms(i, index),
    });
  }

  return results;
}

/**
 * Build a similarity matrix for all files (for clustering integration)
 *
 * @param index - The TF-IDF index
 * @returns 2D array where matrix[i][j] is similarity between file i and j
 */
export function buildSimilarityMatrix(index: TfIdfIndex): number[][] {
  const n = index.docCount;
  const matrix: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(1.0);
      } else if (j < i) {
        // Matrix is symmetric, reuse computed value
        row.push(matrix[j][i]);
      } else {
        row.push(computeSimilarity(i, j, index));
      }
    }
    matrix.push(row);
  }

  return matrix;
}
