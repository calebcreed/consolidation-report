/**
 * Import/Export Extraction - handles S1-S11, O2, O3
 *
 * - Import declarations (S1-S11)
 * - Export declarations / re-exports (S7-S8)
 * - Dynamic imports (S10)
 * - require() calls (O3)
 * - Triple-slash references (O2)
 */

import {
  SourceFile,
  Node,
  SyntaxKind,
  ArrayLiteralExpression,
} from 'ts-morph';

import { Dependency, DependencyType, Export } from './types';
import { PathResolver } from './resolver';

export class ImportExtractor {
  constructor(private resolver: PathResolver) {}

  /**
   * Extract import declarations (S1-S11)
   */
  extractImports(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
    const imports = sourceFile.getImportDeclarations();

    for (const imp of imports) {
      const specifier = imp.getModuleSpecifierValue();
      const resolved = this.resolver.resolve(specifier, filePath);
      const line = imp.getStartLineNumber();
      const column = imp.getStart() - imp.getStartLinePos();

      // Determine import type
      let type: DependencyType = 'import';

      if (imp.isTypeOnly()) {
        type = 'import-type'; // S11
      } else if (!imp.getNamedImports().length &&
                 !imp.getDefaultImport() &&
                 !imp.getNamespaceImport()) {
        type = 'import-side-effect'; // S9
      }

      deps.push({
        type,
        source: filePath,
        target: resolved.absolute || `unresolved:${specifier}`,
        specifier,
        line,
        column,
        metadata: {
          isBarrel: resolved.isBarrel,
          namedImports: imp.getNamedImports().map(n => ({
            name: n.getName(),
            alias: n.getAliasNode()?.getText(),
          })),
          defaultImport: imp.getDefaultImport()?.getText(),
          namespaceImport: imp.getNamespaceImport()?.getText(),
        },
      });
    }
  }

  /**
   * Extract export declarations and re-exports (S7-S8)
   */
  extractExports(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[],
    exports: Export[]
  ): void {
    // Re-exports: export { X } from './foo'
    const exportDecls = sourceFile.getExportDeclarations();

    for (const exp of exportDecls) {
      const moduleSpecifier = exp.getModuleSpecifierValue();

      if (moduleSpecifier) {
        // This is a re-export (S7, S8)
        const resolved = this.resolver.resolve(moduleSpecifier, filePath);
        const line = exp.getStartLineNumber();
        const column = exp.getStart() - exp.getStartLinePos();

        deps.push({
          type: 'export-from',
          source: filePath,
          target: resolved.absolute || `unresolved:${moduleSpecifier}`,
          specifier: moduleSpecifier,
          line,
          column,
          metadata: {
            namedExports: exp.getNamedExports().map(n => ({
              name: n.getName(),
              alias: n.getAliasNode()?.getText(),
            })),
            isNamespaceExport: exp.isNamespaceExport(),
          },
        });
      }

      // Collect named exports (whether re-export or not)
      for (const named of exp.getNamedExports()) {
        exports.push({
          name: named.getName(),
          alias: named.getAliasNode()?.getText(),
          isDefault: false,
          isType: exp.isTypeOnly(),
          line: named.getStartLineNumber(),
        });
      }
    }

    // Regular exports
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
      for (const decl of declarations) {
        // Skip if this came from a re-export
        if (decl.getSourceFile() !== sourceFile) continue;

        exports.push({
          name,
          isDefault: name === 'default',
          isType: Node.isTypeAliasDeclaration(decl) || Node.isInterfaceDeclaration(decl),
          line: decl.getStartLineNumber(),
        });
      }
    }
  }

  /**
   * Extract dynamic imports (S10)
   */
  extractDynamicImports(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (expr.getKind() === SyntaxKind.ImportKeyword) {
          const args = node.getArguments();
          if (args.length > 0) {
            const arg = args[0];
            if (Node.isStringLiteral(arg)) {
              const specifier = arg.getLiteralValue();
              const resolved = this.resolver.resolve(specifier, filePath);
              const line = node.getStartLineNumber();
              const column = node.getStart() - node.getStartLinePos();

              deps.push({
                type: 'import-dynamic',
                source: filePath,
                target: resolved.absolute || `unresolved:${specifier}`,
                specifier,
                line,
                column,
              });
            }
          }
        }
      }
    });
  }

  /**
   * Extract require() calls (O3)
   */
  extractRequireCalls(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'require') {
          const args = node.getArguments();
          if (args.length > 0) {
            const arg = args[0];
            if (Node.isStringLiteral(arg)) {
              const specifier = arg.getLiteralValue();
              const resolved = this.resolver.resolve(specifier, filePath);
              const line = node.getStartLineNumber();
              const column = node.getStart() - node.getStartLinePos();

              deps.push({
                type: 'require',
                source: filePath,
                target: resolved.absolute || `unresolved:${specifier}`,
                specifier,
                line,
                column,
              });
            }
          }
        }
      }
    });
  }

  /**
   * Extract triple-slash references (O2)
   */
  extractTripleSlash(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
    const fileText = sourceFile.getFullText();
    const tripleSlashRegex = /\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g;

    let match;
    while ((match = tripleSlashRegex.exec(fileText)) !== null) {
      const specifier = match[1];
      const resolved = this.resolver.resolve(specifier, filePath);

      // Calculate line number
      const textBefore = fileText.slice(0, match.index);
      const line = textBefore.split('\n').length;

      deps.push({
        type: 'triple-slash',
        source: filePath,
        target: resolved.absolute || `unresolved:${specifier}`,
        specifier,
        line,
        column: 0,
      });
    }
  }
}

/**
 * Utility to extract string values from array literal
 */
export function getArrayStrings(arr: ArrayLiteralExpression): string[] {
  const strings: string[] = [];
  for (const element of arr.getElements()) {
    if (Node.isStringLiteral(element)) {
      strings.push(element.getLiteralValue());
    }
  }
  return strings;
}
