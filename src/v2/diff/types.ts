/**
 * Core types for AST-based diffing
 */

export type DiffStatus = 'identical' | 'clean' | 'dirty' | 'structural';

export type CleanReason =
  | 'whitespace-only'      // D10
  | 'comments-only'        // D11
  | 'import-order-only';   // D12

export type StructuralChangeKind = 'moved' | 'renamed' | 'folder-moved' | 'split' | 'merged';

export interface StructuralChange {
  kind: StructuralChangeKind;
  newPath?: string;        // For moved, renamed, folder-moved
  newName?: string;        // For renamed
  parts?: string[];        // For split
  sources?: string[];      // For merged
}

export interface Change {
  type: 'added' | 'removed' | 'modified';
  location: { line: number; column: number };
  description: string;
  astPath?: string;  // e.g., "FunctionDeclaration.processOrder.body"
}

// Union type for all possible diff results
export type DiffResult =
  | { status: 'identical' }
  | { status: 'clean'; reason: CleanReason }
  | { status: 'dirty'; changes: Change[] }
  | { status: 'structural'; change: StructuralChange };

export interface StructuralMatch {
  matchedFile: string;
  confidence: number;  // 0-1
  structuralChange: StructuralChange;
}

export interface NormalizedNode {
  kind: string;
  name?: string;
  children: NormalizedNode[];
  value?: string;  // For literals, identifiers, etc.
}

export interface NormalizedAST {
  root: NormalizedNode;
  hash: string;

  // Extracted info useful for matching
  exportedNames: string[];
  functionNames: string[];
  classNames: string[];
}

export interface FileSignature {
  path: string;
  hash: string;
  exportedNames: string[];
  functionNames: string[];
  classNames: string[];
  lineCount: number;
}
