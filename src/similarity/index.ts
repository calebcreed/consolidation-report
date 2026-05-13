/**
 * Similarity Module - TF-IDF content similarity for code files
 *
 * Provides semantic similarity analysis using Term Frequency-Inverse
 * Document Frequency to identify related files based on code content.
 */

// Types
export type {
  TokenizationOptions,
  FileContent,
  TfIdfIndex,
  SimilarFile,
  FileSimilarity,
} from './types';

// Tokenizer
export {
  tokenizeFile,
  splitIdentifier,
  stripComments,
  stripStrings,
  getTokenFrequencies,
} from './tokenizer';

// TF-IDF
export {
  buildTfIdfIndex,
  computeSimilarity,
  getTopSimilar,
  getDistinctiveTerms,
  computeAllSimilarities,
  buildSimilarityMatrix,
} from './tfidf';

// Stopwords
export { CODE_STOPWORDS, isStopword } from './stopwords';
