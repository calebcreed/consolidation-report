/**
 * Similarity Types - Interfaces for TF-IDF content similarity
 */

/**
 * Options for tokenizing source files
 */
export interface TokenizationOptions {
  /** Minimum token length to include (default: 3) */
  minTokenLength?: number;

  /** Additional stopwords to filter */
  additionalStopwords?: string[];

  /** Strip comments from source (default: true) */
  stripComments?: boolean;

  /** Strip string literals from source (default: true) */
  stripStrings?: boolean;
}

/**
 * File content for similarity analysis
 */
export interface FileContent {
  /** Relative path of the file */
  relativePath: string;

  /** Source code content */
  content: string;
}

/**
 * TF-IDF index for a collection of files
 */
export interface TfIdfIndex {
  /** Ordered list of file paths */
  filePaths: string[];

  /** Tokenized documents (one per file) */
  documents: string[][];

  /** Term -> document frequency map */
  termDocFreq: Map<string, number>;

  /** Total number of documents */
  docCount: number;

  /** TF-IDF vectors (sparse representation) */
  vectors: Map<string, number>[];

  /** Vector norms for cosine similarity */
  norms: number[];
}

/**
 * A similar file with similarity score
 */
export interface SimilarFile {
  /** Relative path of the similar file */
  relativePath: string;

  /** Cosine similarity score [0, 1] */
  score: number;
}

/**
 * Similarity analysis result for a single file
 */
export interface FileSimilarity {
  /** Relative path of the analyzed file */
  relativePath: string;

  /** Most similar files, sorted by score descending */
  topSimilar: SimilarFile[];

  /** Number of tokens in this file */
  tokenCount: number;

  /** Most distinctive terms for this file (high TF-IDF) */
  distinctiveTerms: string[];
}
