/**
 * AST Normalizer - Normalize AST for semantic comparison
 *
 * Normalizes files to ignore:
 * - Whitespace/formatting
 * - Comment content
 * - Import order
 * - Trailing commas
 *
 * But preserves:
 * - Variable names (D13 is DIRTY - renames matter)
 * - Function bodies
 * - Type annotations
 */

import * as crypto from 'crypto';
import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  ImportDeclaration,
} from 'ts-morph';

import { NormalizedAST, NormalizedNode, FileSignature } from './types';

export class ASTNormalizer {
  private project: Project;

  constructor() {
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Normalize a source file for comparison
   */
  normalize(filePath: string): NormalizedAST {
    const sourceFile = this.project.addSourceFileAtPath(filePath);

    try {
      // Sort imports for comparison (so import order doesn't matter)
      const sortedImports = this.getSortedImports(sourceFile);

      // Build normalized tree
      const root = this.normalizeNode(sourceFile);

      // Extract useful info for matching
      const exportedNames = this.getExportedNames(sourceFile);
      const functionNames = this.getFunctionNames(sourceFile);
      const classNames = this.getClassNames(sourceFile);

      // Compute hash from normalized representation
      const hashInput = JSON.stringify({
        imports: sortedImports,
        tree: root,
      });
      const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

      return {
        root,
        hash,
        exportedNames,
        functionNames,
        classNames,
      };
    } finally {
      this.project.removeSourceFile(sourceFile);
    }
  }

  /**
   * Get a file signature for quick matching
   */
  getSignature(filePath: string): FileSignature {
    const normalized = this.normalize(filePath);
    const lineCount = require('fs').readFileSync(filePath, 'utf-8').split('\n').length;

    return {
      path: filePath,
      hash: normalized.hash,
      exportedNames: normalized.exportedNames,
      functionNames: normalized.functionNames,
      classNames: normalized.classNames,
      lineCount,
    };
  }

  /**
   * Get sorted import specifiers (for order-independent comparison)
   */
  private getSortedImports(sourceFile: SourceFile): string[] {
    const imports = sourceFile.getImportDeclarations();

    return imports
      .map(imp => {
        const specifier = imp.getModuleSpecifierValue();
        const named = imp.getNamedImports().map(n => n.getName()).sort();
        const defaultImport = imp.getDefaultImport()?.getText() || '';
        const namespace = imp.getNamespaceImport()?.getText() || '';
        const isTypeOnly = imp.isTypeOnly();

        return JSON.stringify({
          specifier,
          named,
          defaultImport,
          namespace,
          isTypeOnly,
        });
      })
      .sort();
  }

  /**
   * Normalize a node recursively, stripping non-semantic info
   */
  private normalizeNode(node: Node): NormalizedNode {
    const kind = node.getKindName();
    const normalized: NormalizedNode = {
      kind,
      children: [],
    };

    // Skip comments entirely
    if (node.getKind() === SyntaxKind.SingleLineCommentTrivia ||
        node.getKind() === SyntaxKind.MultiLineCommentTrivia) {
      return normalized;
    }

    // For identifiers, preserve the name
    if (Node.isIdentifier(node)) {
      normalized.name = node.getText();
      return normalized;
    }

    // For literals, preserve the value
    if (Node.isStringLiteral(node)) {
      normalized.value = node.getLiteralValue();
      return normalized;
    }

    if (Node.isNumericLiteral(node)) {
      normalized.value = node.getLiteralValue().toString();
      return normalized;
    }

    // For imports, use a canonical form (will be sorted separately)
    if (Node.isImportDeclaration(node)) {
      normalized.value = this.canonicalizeImport(node);
      return normalized;
    }

    // Recursively normalize children (excluding whitespace/comments)
    for (const child of node.getChildren()) {
      const childKind = child.getKind();

      // Skip whitespace and comments
      if (childKind === SyntaxKind.WhitespaceTrivia ||
          childKind === SyntaxKind.NewLineTrivia ||
          childKind === SyntaxKind.SingleLineCommentTrivia ||
          childKind === SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }

      normalized.children.push(this.normalizeNode(child));
    }

    return normalized;
  }

  /**
   * Canonicalize an import declaration
   */
  private canonicalizeImport(node: ImportDeclaration): string {
    const specifier = node.getModuleSpecifierValue();
    const named = node.getNamedImports().map(n => {
      const name = n.getName();
      const alias = n.getAliasNode()?.getText();
      return alias ? `${name} as ${alias}` : name;
    }).sort();

    const defaultImport = node.getDefaultImport()?.getText();
    const namespace = node.getNamespaceImport()?.getText();
    const isTypeOnly = node.isTypeOnly();

    const parts: string[] = [];
    if (isTypeOnly) parts.push('type');
    if (defaultImport) parts.push(defaultImport);
    if (namespace) parts.push(`* as ${namespace}`);
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    parts.push(`from '${specifier}'`);

    return parts.join(' ');
  }

  /**
   * Get all exported names from a file
   */
  private getExportedNames(sourceFile: SourceFile): string[] {
    const names: string[] = [];

    const exported = sourceFile.getExportedDeclarations();
    for (const [name] of exported) {
      names.push(name);
    }

    return names.sort();
  }

  /**
   * Get all function names from a file
   */
  private getFunctionNames(sourceFile: SourceFile): string[] {
    const names: string[] = [];

    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName();
      if (name) names.push(name);
    }

    // Also get methods from classes
    for (const cls of sourceFile.getClasses()) {
      for (const method of cls.getMethods()) {
        names.push(`${cls.getName()}.${method.getName()}`);
      }
    }

    return names.sort();
  }

  /**
   * Get all class names from a file
   */
  private getClassNames(sourceFile: SourceFile): string[] {
    return sourceFile.getClasses()
      .map(cls => cls.getName() || '')
      .filter(name => name)
      .sort();
  }

  /**
   * Check if two files have identical normalized content
   */
  areIdentical(fileA: string, fileB: string): boolean {
    const normalizedA = this.normalize(fileA);
    const normalizedB = this.normalize(fileB);
    return normalizedA.hash === normalizedB.hash;
  }
}
