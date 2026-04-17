/**
 * Semantic Comparator - Compare files semantically using normalized ASTs
 *
 * Classifies file pairs as:
 * - identical: Exact same normalized content
 * - clean: Only non-semantic differences (whitespace, comments, import order)
 * - dirty: Semantic differences exist
 * - structural: File was moved, renamed, split, or merged
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
} from 'ts-morph';

import {
  DiffResult,
  Change,
  CleanReason,
  StructuralChange,
  StructuralMatch,
  FileSignature,
} from './types';
import { ASTNormalizer } from './normalizer';

export class SemanticComparator {
  private normalizer: ASTNormalizer;
  private project: Project;

  constructor() {
    this.normalizer = new ASTNormalizer();
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Compare two files semantically
   */
  compare(fileA: string, fileB: string): DiffResult {
    // Check files exist
    if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
      return {
        status: 'dirty',
        changes: [{
          type: !fs.existsSync(fileA) ? 'removed' : 'added',
          location: { line: 1, column: 0 },
          description: !fs.existsSync(fileA) ? 'File A does not exist' : 'File B does not exist',
        }],
      };
    }

    // Quick hash check - if raw content is identical, we're done
    const contentA = fs.readFileSync(fileA, 'utf-8');
    const contentB = fs.readFileSync(fileB, 'utf-8');

    if (contentA === contentB) {
      return { status: 'identical' };
    }

    // Check if only whitespace differs
    const normalizedContentA = this.normalizeWhitespace(contentA);
    const normalizedContentB = this.normalizeWhitespace(contentB);

    if (normalizedContentA === normalizedContentB) {
      return { status: 'clean', reason: 'whitespace-only' };
    }

    // Check if only comments differ
    const noCommentsA = this.stripComments(contentA);
    const noCommentsB = this.stripComments(contentB);

    if (this.normalizeWhitespace(noCommentsA) === this.normalizeWhitespace(noCommentsB)) {
      return { status: 'clean', reason: 'comments-only' };
    }

    // Check if only import order differs
    const reorderedA = this.reorderImports(contentA);
    const reorderedB = this.reorderImports(contentB);

    if (this.normalizeWhitespace(this.stripComments(reorderedA)) ===
        this.normalizeWhitespace(this.stripComments(reorderedB))) {
      return { status: 'clean', reason: 'import-order-only' };
    }

    // Full semantic comparison - find actual differences
    const changes = this.findChanges(fileA, fileB);

    return {
      status: 'dirty',
      changes,
    };
  }

  /**
   * Find a structurally matching file among candidates
   * Used to detect moved, renamed, split, or merged files
   */
  findMatch(file: string, candidates: string[]): StructuralMatch | null {
    if (!fs.existsSync(file)) return null;

    const signature = this.normalizer.getSignature(file);
    let bestMatch: StructuralMatch | null = null;

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate) || candidate === file) continue;

      const candidateSig = this.normalizer.getSignature(candidate);
      const similarity = this.calculateSimilarity(signature, candidateSig);

      if (similarity > 0.8) {  // 80% threshold for structural match
        const change = this.classifyStructuralChange(file, candidate, signature, candidateSig);

        if (!bestMatch || similarity > bestMatch.confidence) {
          bestMatch = {
            matchedFile: candidate,
            confidence: similarity,
            structuralChange: change,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity between two file signatures
   */
  private calculateSimilarity(sigA: FileSignature, sigB: FileSignature): number {
    // If hashes match, files are identical
    if (sigA.hash === sigB.hash) return 1.0;

    let score = 0;
    let factors = 0;

    // Compare exported names
    const exportOverlap = this.setOverlap(
      new Set(sigA.exportedNames),
      new Set(sigB.exportedNames)
    );
    score += exportOverlap * 0.4;
    factors += 0.4;

    // Compare function names
    const funcOverlap = this.setOverlap(
      new Set(sigA.functionNames),
      new Set(sigB.functionNames)
    );
    score += funcOverlap * 0.3;
    factors += 0.3;

    // Compare class names
    const classOverlap = this.setOverlap(
      new Set(sigA.classNames),
      new Set(sigB.classNames)
    );
    score += classOverlap * 0.2;
    factors += 0.2;

    // Compare line counts (files of similar size)
    const lineDiff = Math.abs(sigA.lineCount - sigB.lineCount);
    const maxLines = Math.max(sigA.lineCount, sigB.lineCount);
    const lineSimilarity = maxLines > 0 ? 1 - (lineDiff / maxLines) : 1;
    score += lineSimilarity * 0.1;
    factors += 0.1;

    return score / factors;
  }

  /**
   * Calculate overlap between two sets (Jaccard index)
   */
  private setOverlap(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return intersection / union;
  }

  /**
   * Classify the type of structural change between two files
   */
  private classifyStructuralChange(
    fileA: string,
    fileB: string,
    sigA: FileSignature,
    sigB: FileSignature
  ): StructuralChange {
    const dirA = path.dirname(fileA);
    const dirB = path.dirname(fileB);
    const nameA = path.basename(fileA);
    const nameB = path.basename(fileB);

    // Same name, different directory = moved
    if (nameA === nameB && dirA !== dirB) {
      return { kind: 'moved', newPath: fileB };
    }

    // Same directory, different name = renamed
    if (dirA === dirB && nameA !== nameB) {
      return { kind: 'renamed', newName: nameB, newPath: fileB };
    }

    // Different directory structure = folder-moved
    if (dirA !== dirB) {
      return { kind: 'folder-moved', newPath: fileB };
    }

    // Default to moved
    return { kind: 'moved', newPath: fileB };
  }

  /**
   * Detect if a file was split into multiple files
   */
  detectSplit(originalFile: string, candidates: string[]): StructuralMatch | null {
    if (!fs.existsSync(originalFile)) return null;

    const originalSig = this.normalizer.getSignature(originalFile);
    const originalExports = new Set(originalSig.exportedNames);

    // Find candidates that collectively contain all exports
    const matchingCandidates: string[] = [];
    const coveredExports = new Set<string>();

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate) || candidate === originalFile) continue;

      const candSig = this.normalizer.getSignature(candidate);

      // Check if this candidate has any of our exports
      let hasOverlap = false;
      for (const exp of candSig.exportedNames) {
        if (originalExports.has(exp)) {
          hasOverlap = true;
          coveredExports.add(exp);
        }
      }

      if (hasOverlap) {
        matchingCandidates.push(candidate);
      }
    }

    // If multiple files cover most exports, it's likely a split
    if (matchingCandidates.length > 1 &&
        coveredExports.size / originalExports.size > 0.8) {
      return {
        matchedFile: matchingCandidates[0],  // Primary match
        confidence: coveredExports.size / originalExports.size,
        structuralChange: {
          kind: 'split',
          parts: matchingCandidates,
        },
      };
    }

    return null;
  }

  /**
   * Detect if multiple files were merged into one
   */
  detectMerge(targetFile: string, candidates: string[]): StructuralMatch | null {
    if (!fs.existsSync(targetFile)) return null;

    const targetSig = this.normalizer.getSignature(targetFile);
    const targetExports = new Set(targetSig.exportedNames);

    // Find candidates whose exports are subsets of target
    const sourceCandidates: string[] = [];
    const coveredExports = new Set<string>();

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate) || candidate === targetFile) continue;

      const candSig = this.normalizer.getSignature(candidate);

      // Check if all of candidate's exports are in target
      let isSubset = true;
      let hasExports = false;
      for (const exp of candSig.exportedNames) {
        hasExports = true;
        if (targetExports.has(exp)) {
          coveredExports.add(exp);
        } else {
          isSubset = false;
        }
      }

      if (isSubset && hasExports) {
        sourceCandidates.push(candidate);
      }
    }

    // If multiple source files seem to have been merged
    if (sourceCandidates.length > 1) {
      return {
        matchedFile: targetFile,
        confidence: coveredExports.size / targetExports.size,
        structuralChange: {
          kind: 'merged',
          sources: sourceCandidates,
        },
      };
    }

    return null;
  }

  /**
   * Find specific changes between two files
   */
  private findChanges(fileA: string, fileB: string): Change[] {
    const changes: Change[] = [];

    const sourceA = this.project.addSourceFileAtPath(fileA);
    const sourceB = this.project.addSourceFileAtPath(fileB);

    try {
      // Compare exports
      const exportsA = this.getExportMap(sourceA);
      const exportsB = this.getExportMap(sourceB);

      // Find removed exports
      for (const [name, info] of exportsA) {
        if (!exportsB.has(name)) {
          changes.push({
            type: 'removed',
            location: { line: info.line, column: 0 },
            description: `Export '${name}' was removed`,
            astPath: `export.${name}`,
          });
        }
      }

      // Find added exports
      for (const [name, info] of exportsB) {
        if (!exportsA.has(name)) {
          changes.push({
            type: 'added',
            location: { line: info.line, column: 0 },
            description: `Export '${name}' was added`,
            astPath: `export.${name}`,
          });
        }
      }

      // Compare function bodies
      const functionsA = this.getFunctionMap(sourceA);
      const functionsB = this.getFunctionMap(sourceB);

      for (const [name, bodyA] of functionsA) {
        const bodyB = functionsB.get(name);
        if (bodyB && bodyA !== bodyB) {
          changes.push({
            type: 'modified',
            location: { line: 1, column: 0 },  // Would need better tracking
            description: `Function '${name}' was modified`,
            astPath: `function.${name}`,
          });
        }
      }

      // Compare class definitions
      const classesA = this.getClassMap(sourceA);
      const classesB = this.getClassMap(sourceB);

      for (const [name, hashA] of classesA) {
        const hashB = classesB.get(name);
        if (hashB && hashA !== hashB) {
          changes.push({
            type: 'modified',
            location: { line: 1, column: 0 },
            description: `Class '${name}' was modified`,
            astPath: `class.${name}`,
          });
        }
      }

    } finally {
      this.project.removeSourceFile(sourceA);
      this.project.removeSourceFile(sourceB);
    }

    return changes;
  }

  /**
   * Get a map of exported names to their info
   */
  private getExportMap(sourceFile: SourceFile): Map<string, { line: number }> {
    const map = new Map<string, { line: number }>();
    const exports = sourceFile.getExportedDeclarations();

    for (const [name, declarations] of exports) {
      if (declarations.length > 0) {
        const decl = declarations[0];
        map.set(name, { line: decl.getStartLineNumber() });
      }
    }

    return map;
  }

  /**
   * Get a map of function names to normalized body hashes
   */
  private getFunctionMap(sourceFile: SourceFile): Map<string, string> {
    const map = new Map<string, string>();

    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name) {
        const body = fn.getBody()?.getText() || '';
        const hash = crypto.createHash('md5')
          .update(this.normalizeWhitespace(body))
          .digest('hex');
        map.set(name, hash);
      }
    }

    return map;
  }

  /**
   * Get a map of class names to normalized hashes
   */
  private getClassMap(sourceFile: SourceFile): Map<string, string> {
    const map = new Map<string, string>();

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (name) {
        const text = cls.getText();
        const hash = crypto.createHash('md5')
          .update(this.normalizeWhitespace(this.stripComments(text)))
          .digest('hex');
        map.set(name, hash);
      }
    }

    return map;
  }

  /**
   * Normalize whitespace in content
   */
  private normalizeWhitespace(content: string): string {
    return content
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/[ \t]+/g, ' ')          // Collapse horizontal whitespace
      .replace(/\n+/g, '\n')            // Collapse vertical whitespace
      .replace(/^\s+|\s+$/g, '')        // Trim
      .replace(/\s*([{};,:=()[\]<>])\s*/g, '$1'); // Remove space around punctuation and operators
  }

  /**
   * Strip comments from content
   */
  private stripComments(content: string): string {
    // Remove single-line comments
    let result = content.replace(/\/\/[^\n]*/g, '');

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    return result;
  }

  /**
   * Reorder imports alphabetically for comparison
   */
  private reorderImports(content: string): string {
    // Extract all import statements (allow leading whitespace)
    const importRegex = /^[ \t]*import\s+.*?;?\s*$/gm;
    const imports: string[] = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[0].trim());
    }

    // Sort imports
    imports.sort();

    // Replace original imports with sorted ones
    let result = content.replace(importRegex, '<<<IMPORT>>>');

    // Put sorted imports back
    for (const imp of imports) {
      result = result.replace('<<<IMPORT>>>', imp);
    }

    return result;
  }
}
