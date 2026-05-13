/**
 * Tokenizer - Code-aware tokenization pipeline for TF-IDF
 *
 * Extracts meaningful domain terms from source code by:
 * 1. Stripping comments and string literals
 * 2. Extracting identifiers
 * 3. Splitting compound names (camelCase, PascalCase, snake_case)
 * 4. Filtering stopwords and short terms
 */

import { TokenizationOptions } from './types';
import { CODE_STOPWORDS, isStopword } from './stopwords';

/** Regex to extract identifiers from code */
const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Default tokenization options */
const DEFAULT_OPTIONS: Required<TokenizationOptions> = {
  minTokenLength: 3,
  additionalStopwords: [],
  stripComments: true,
  stripStrings: true,
};

/**
 * Splits compound identifiers into constituent words.
 *
 * @example
 * splitIdentifier('PaymentService')     // ['payment', 'service']
 * splitIdentifier('XMLHttpRequest')     // ['xml', 'http', 'request']
 * splitIdentifier('user_id')            // ['user', 'id']
 * splitIdentifier('getHTTPResponse')    // ['get', 'http', 'response']
 */
export function splitIdentifier(identifier: string): string[] {
  return identifier
    // Insert space before uppercase letters following lowercase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space between consecutive uppercase and following lowercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Split on spaces and underscores
    .split(/[\s_]+/)
    // Lowercase all
    .map(s => s.toLowerCase())
    // Filter empty and single-char
    .filter(s => s.length > 1);
}

/**
 * Strip single-line and multi-line comments from code
 */
export function stripComments(code: string): string {
  return code
    // Single-line comments
    .replace(/\/\/.*$/gm, '')
    // Multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Strip string literals from code
 */
export function stripStrings(code: string): string {
  return code
    // Single-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    // Double-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    // Template literals (backticks)
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ');
}

/**
 * Tokenizes a source file into normalized terms.
 *
 * Pipeline:
 * 1. Remove comments (optional)
 * 2. Remove string literals (optional)
 * 3. Extract identifiers
 * 4. Split compound names
 * 5. Remove stopwords and short tokens
 *
 * @param content - Source code content
 * @param options - Tokenization options
 * @returns Array of normalized tokens
 */
export function tokenizeFile(
  content: string,
  options?: TokenizationOptions
): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let code = content;

  // 1. Remove comments
  if (opts.stripComments) {
    code = stripComments(code);
  }

  // 2. Remove string literals
  if (opts.stripStrings) {
    code = stripStrings(code);
  }

  // 3. Extract identifiers
  const identifiers = code.match(IDENTIFIER_REGEX) || [];

  // 4. Split compound names and lowercase
  const tokens = identifiers.flatMap(splitIdentifier);

  // 5. Create additional stopwords set if provided
  const additionalSet = opts.additionalStopwords.length > 0
    ? new Set(opts.additionalStopwords)
    : undefined;

  // 6. Remove stopwords and short tokens
  return tokens.filter(t =>
    t.length >= opts.minTokenLength && !isStopword(t, additionalSet)
  );
}

/**
 * Get token frequency map for a document
 */
export function getTokenFrequencies(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return freq;
}
