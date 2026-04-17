/**
 * Dependency Extractor - uses ts-morph to extract ALL dependency types
 *
 * Extraction passes:
 * 1. Import declarations - All `import` variants (S1-S11)
 * 2. Export declarations - Re-exports `export { X } from`
 * 3. Dynamic imports - `import()` expressions
 * 4. require() calls - CommonJS
 * 5. Triple-slash - `/// <reference path="" />`
 * 6. Decorators - @Component, @NgModule, @Injectable, @Pipe, @Directive
 * 7. Constructor params - Constructor injection types
 * 8. Template analysis - Parse templateUrl/template for selectors/pipes
 * 9. NgRx patterns - Actions in reducers/effects, selectors
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  Project,
  SourceFile,
  ImportDeclaration,
  ExportDeclaration,
  CallExpression,
  SyntaxKind,
  Node,
  Decorator,
  ObjectLiteralExpression,
  PropertyAssignment,
  ArrayLiteralExpression,
  ClassDeclaration,
  ConstructorDeclaration,
} from 'ts-morph';

import {
  Dependency,
  DependencyType,
  FileAnalysis,
  Export,
  AngularMetadata,
  NgRxMetadata,
  NgRxAction,
  NgRxReducer,
  NgRxEffect,
  NgRxSelector,
  InjectedDependency,
} from './types';
import { PathResolver } from './resolver';

export class DependencyExtractor {
  private resolver: PathResolver;
  private project: Project;

  constructor(resolver: PathResolver) {
    this.resolver = resolver;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });
  }

  /**
   * Extract all dependencies from a single file
   */
  extract(filePath: string): FileAnalysis {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(this.resolver.getRootDir(), absolutePath);

    if (!fs.existsSync(absolutePath)) {
      return {
        path: absolutePath,
        relativePath,
        dependencies: [],
        exports: [],
      };
    }

    const sourceFile = this.project.addSourceFileAtPath(absolutePath);

    try {
      const dependencies: Dependency[] = [];
      const exports: Export[] = [];

      // Pass 1: Import declarations
      this.extractImports(sourceFile, absolutePath, dependencies);

      // Pass 2: Export declarations (including re-exports)
      this.extractExports(sourceFile, absolutePath, dependencies, exports);

      // Pass 3: Dynamic imports
      this.extractDynamicImports(sourceFile, absolutePath, dependencies);

      // Pass 4: require() calls
      this.extractRequireCalls(sourceFile, absolutePath, dependencies);

      // Pass 5: Triple-slash references
      this.extractTripleSlash(sourceFile, absolutePath, dependencies);

      // Pass 6-8: Angular metadata
      const angularMetadata = this.extractAngularMetadata(sourceFile, absolutePath, dependencies);

      // Pass 9: NgRx metadata
      const ngrxMetadata = this.extractNgRxMetadata(sourceFile, absolutePath, dependencies);

      return {
        path: absolutePath,
        relativePath,
        dependencies,
        exports,
        angularMetadata,
        ngrxMetadata,
      };
    } finally {
      // Clean up to avoid memory issues
      this.project.removeSourceFile(sourceFile);
    }
  }

  /**
   * Extract from multiple files
   */
  extractAll(filePaths: string[]): Map<string, FileAnalysis> {
    const results = new Map<string, FileAnalysis>();
    for (const filePath of filePaths) {
      const analysis = this.extract(filePath);
      results.set(analysis.path, analysis);
    }
    return results;
  }

  // ============ IMPORT EXTRACTION (S1-S11) ============

  private extractImports(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
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

  // ============ EXPORT EXTRACTION (S7-S8) ============

  private extractExports(
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

  // ============ DYNAMIC IMPORTS (S10) ============

  private extractDynamicImports(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
    // Find all import() call expressions
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

  // ============ REQUIRE CALLS (O3) ============

  private extractRequireCalls(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
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

  // ============ TRIPLE-SLASH REFERENCES (O2) ============

  private extractTripleSlash(sourceFile: SourceFile, filePath: string, deps: Dependency[]): void {
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

  // ============ ANGULAR METADATA (A1-A12) ============

  private extractAngularMetadata(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): AngularMetadata | undefined {
    const classes = sourceFile.getClasses();
    let angularMetadata: AngularMetadata | undefined;

    for (const cls of classes) {
      const decorators = cls.getDecorators();

      for (const decorator of decorators) {
        const name = decorator.getName();

        if (name === 'Component') {
          angularMetadata = this.extractComponentMetadata(decorator, filePath, deps);
          angularMetadata.type = 'component';
          this.extractConstructorInjections(cls, filePath, deps);
        } else if (name === 'Directive') {
          angularMetadata = this.extractDirectiveMetadata(decorator);
          angularMetadata.type = 'directive';
          this.extractConstructorInjections(cls, filePath, deps);
        } else if (name === 'Pipe') {
          angularMetadata = this.extractPipeMetadata(decorator);
          angularMetadata.type = 'pipe';
        } else if (name === 'NgModule') {
          angularMetadata = this.extractNgModuleMetadata(decorator, filePath, deps);
          angularMetadata.type = 'module';
        } else if (name === 'Injectable') {
          angularMetadata = this.extractInjectableMetadata(decorator);
          angularMetadata.type = 'service';
          this.extractConstructorInjections(cls, filePath, deps);
        }
      }
    }

    return angularMetadata;
  }

  private extractComponentMetadata(
    decorator: Decorator,
    filePath: string,
    deps: Dependency[]
  ): AngularMetadata {
    const metadata: AngularMetadata = { type: 'component' };
    const args = decorator.getArguments();

    if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0] as ObjectLiteralExpression;

      for (const prop of obj.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;

        const propName = prop.getName();
        const initializer = prop.getInitializer();

        if (propName === 'selector' && Node.isStringLiteral(initializer!)) {
          metadata.selector = initializer.getLiteralValue();
        } else if (propName === 'templateUrl' && Node.isStringLiteral(initializer!)) {
          const templatePath = initializer.getLiteralValue();
          metadata.templateUrl = templatePath;

          // Parse the template for component/pipe/directive usage
          this.parseExternalTemplate(templatePath, filePath, deps);
        } else if (propName === 'template' && Node.isStringLiteral(initializer!)) {
          metadata.template = initializer.getLiteralValue();
          this.parseInlineTemplate(metadata.template, filePath, decorator.getStartLineNumber(), deps);
        } else if (propName === 'template' && Node.isNoSubstitutionTemplateLiteral(initializer!)) {
          metadata.template = initializer.getLiteralValue();
          this.parseInlineTemplate(metadata.template, filePath, decorator.getStartLineNumber(), deps);
        } else if (propName === 'styleUrls' && Node.isArrayLiteralExpression(initializer!)) {
          metadata.styleUrls = this.getArrayStrings(initializer);
        }
      }
    }

    return metadata;
  }

  private extractDirectiveMetadata(decorator: Decorator): AngularMetadata {
    const metadata: AngularMetadata = { type: 'directive' };
    const args = decorator.getArguments();

    if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0] as ObjectLiteralExpression;
      for (const prop of obj.getProperties()) {
        if (Node.isPropertyAssignment(prop) && prop.getName() === 'selector') {
          const init = prop.getInitializer();
          if (Node.isStringLiteral(init!)) {
            metadata.selector = init.getLiteralValue();
          }
        }
      }
    }

    return metadata;
  }

  private extractPipeMetadata(decorator: Decorator): AngularMetadata {
    const metadata: AngularMetadata = { type: 'pipe' };
    const args = decorator.getArguments();

    if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0] as ObjectLiteralExpression;
      for (const prop of obj.getProperties()) {
        if (Node.isPropertyAssignment(prop) && prop.getName() === 'name') {
          const init = prop.getInitializer();
          if (Node.isStringLiteral(init!)) {
            metadata.selector = init.getLiteralValue(); // Pipe name stored in selector
          }
        }
      }
    }

    return metadata;
  }

  private extractNgModuleMetadata(
    decorator: Decorator,
    filePath: string,
    deps: Dependency[]
  ): AngularMetadata {
    const metadata: AngularMetadata = { type: 'module' };
    const args = decorator.getArguments();

    if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0] as ObjectLiteralExpression;

      for (const prop of obj.getProperties()) {
        if (!Node.isPropertyAssignment(prop)) continue;

        const propName = prop.getName();
        const initializer = prop.getInitializer();

        if (!Node.isArrayLiteralExpression(initializer!)) continue;

        const arr = initializer as ArrayLiteralExpression;
        const line = prop.getStartLineNumber();

        if (propName === 'imports') {
          metadata.imports = this.extractNgModuleReferences(arr, filePath, 'ngmodule-import', line, deps);
        } else if (propName === 'declarations') {
          metadata.declarations = this.extractNgModuleReferences(arr, filePath, 'ngmodule-declaration', line, deps);
        } else if (propName === 'providers') {
          metadata.providers = this.extractNgModuleReferences(arr, filePath, 'ngmodule-provider', line, deps);
        } else if (propName === 'exports') {
          metadata.exports = this.extractNgModuleReferences(arr, filePath, 'ngmodule-export', line, deps);
        }
      }
    }

    return metadata;
  }

  private extractNgModuleReferences(
    arr: ArrayLiteralExpression,
    filePath: string,
    type: DependencyType,
    line: number,
    deps: Dependency[]
  ): string[] {
    const names: string[] = [];

    for (const element of arr.getElements()) {
      let name: string | undefined;

      if (Node.isIdentifier(element)) {
        name = element.getText();
      } else if (Node.isSpreadElement(element)) {
        // Handle spread elements like ...components
        const spreadExpr = element.getExpression();
        if (Node.isIdentifier(spreadExpr)) {
          name = spreadExpr.getText();
        }
      } else if (Node.isCallExpression(element)) {
        // Handle forRoot/forChild patterns
        const expr = element.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          name = expr.getExpression().getText();
          const methodName = expr.getName();
          if (methodName === 'forRoot' || methodName === 'forChild') {
            // Mark this as a module with forRoot/forChild
          }
        }
      }

      if (name) {
        names.push(name);
        deps.push({
          type,
          source: filePath,
          target: `symbol:${name}`,  // Symbol reference, needs later resolution
          specifier: name,
          line,
          column: 0,
          metadata: { symbol: name },
        });
      }
    }

    return names;
  }

  private extractInjectableMetadata(decorator: Decorator): AngularMetadata {
    const metadata: AngularMetadata = { type: 'service' };
    const args = decorator.getArguments();

    if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
      const obj = args[0] as ObjectLiteralExpression;
      for (const prop of obj.getProperties()) {
        if (Node.isPropertyAssignment(prop) && prop.getName() === 'providedIn') {
          const init = prop.getInitializer();
          if (Node.isStringLiteral(init!)) {
            metadata.providedIn = init.getLiteralValue();
          }
        }
      }
    }

    return metadata;
  }

  // ============ CONSTRUCTOR INJECTION (A1, A2) ============

  private extractConstructorInjections(
    cls: ClassDeclaration,
    filePath: string,
    deps: Dependency[]
  ): void {
    const ctor = cls.getConstructors()[0];
    if (!ctor) return;

    for (const param of ctor.getParameters()) {
      const typeNode = param.getTypeNode();
      if (!typeNode) continue;

      const typeName = typeNode.getText();
      const line = param.getStartLineNumber();

      // Check for @Inject decorator
      let token: string | undefined;
      for (const decorator of param.getDecorators()) {
        if (decorator.getName() === 'Inject') {
          const args = decorator.getArguments();
          if (args.length > 0) {
            token = args[0].getText();
          }
        }
      }

      if (token) {
        // A2: @Inject(TOKEN) pattern
        deps.push({
          type: 'inject-token',
          source: filePath,
          target: `symbol:${token}`,
          specifier: token,
          line,
          column: 0,
          metadata: { token, typeName },
        });
      } else {
        // A1: Constructor injection
        deps.push({
          type: 'injection',
          source: filePath,
          target: `symbol:${typeName}`,
          specifier: typeName,
          line,
          column: 0,
          metadata: { typeName },
        });
      }
    }
  }

  // ============ TEMPLATE PARSING (A7, A8, A9) ============

  private parseExternalTemplate(
    templatePath: string,
    componentPath: string,
    deps: Dependency[]
  ): void {
    const componentDir = path.dirname(componentPath);
    const fullTemplatePath = path.resolve(componentDir, templatePath);

    if (!fs.existsSync(fullTemplatePath)) return;

    const templateContent = fs.readFileSync(fullTemplatePath, 'utf-8');
    this.parseTemplateContent(templateContent, componentPath, 1, deps);
  }

  private parseInlineTemplate(
    template: string,
    componentPath: string,
    startLine: number,
    deps: Dependency[]
  ): void {
    this.parseTemplateContent(template, componentPath, startLine, deps);
  }

  private parseTemplateContent(
    content: string,
    filePath: string,
    baseLine: number,
    deps: Dependency[]
  ): void {
    // A7: Template components <app-foo>
    const componentRegex = /<([a-z]+-[a-z0-9-]+)/g;
    let match;
    while ((match = componentRegex.exec(content)) !== null) {
      const selector = match[1];
      const lineOffset = content.slice(0, match.index).split('\n').length - 1;

      deps.push({
        type: 'template-component',
        source: filePath,
        target: `selector:${selector}`,
        specifier: selector,
        line: baseLine + lineOffset,
        column: 0,
        metadata: { selector },
      });
    }

    // A8: Template pipes {{ value | pipeName }}
    const pipeRegex = /\|\s*([a-zA-Z][a-zA-Z0-9]*)/g;
    while ((match = pipeRegex.exec(content)) !== null) {
      const pipeName = match[1];
      // Skip common built-in pipes
      if (['async', 'date', 'uppercase', 'lowercase', 'currency', 'number', 'percent', 'json', 'slice', 'keyvalue', 'titlecase'].includes(pipeName)) {
        continue;
      }

      const lineOffset = content.slice(0, match.index).split('\n').length - 1;

      deps.push({
        type: 'template-pipe',
        source: filePath,
        target: `pipe:${pipeName}`,
        specifier: pipeName,
        line: baseLine + lineOffset,
        column: 0,
        metadata: { pipeName },
      });
    }

    // A9: Template directives [appDirective]
    const directiveRegex = /\[([a-z][a-zA-Z]+)\]/g;
    while ((match = directiveRegex.exec(content)) !== null) {
      const directiveName = match[1];
      // Skip common built-in directives
      if (['ngIf', 'ngFor', 'ngSwitch', 'ngClass', 'ngStyle', 'ngModel', 'formControl', 'formGroup', 'formControlName', 'formGroupName', 'formArrayName', 'routerLink', 'routerLinkActive'].includes(directiveName)) {
        continue;
      }

      const lineOffset = content.slice(0, match.index).split('\n').length - 1;

      deps.push({
        type: 'template-directive',
        source: filePath,
        target: `directive:${directiveName}`,
        specifier: directiveName,
        line: baseLine + lineOffset,
        column: 0,
        metadata: { directiveName },
      });
    }
  }

  // ============ LAZY ROUTES (A10) ============

  // Lazy routes are detected via dynamic imports with specific patterns
  // They're captured by extractDynamicImports and can be identified by metadata

  // ============ NGRX METADATA (N1-N5) ============

  private extractNgRxMetadata(
    sourceFile: SourceFile,
    filePath: string,
    deps: Dependency[]
  ): NgRxMetadata | undefined {
    const metadata: NgRxMetadata = {};
    const fileName = path.basename(filePath);

    // Detect file type by name convention
    const isActionFile = fileName.includes('.actions.');
    const isReducerFile = fileName.includes('.reducer.');
    const isEffectFile = fileName.includes('.effects.');
    const isSelectorFile = fileName.includes('.selectors.');

    if (isActionFile) {
      metadata.actions = this.extractNgRxActions(sourceFile);
    }

    if (isReducerFile) {
      metadata.reducers = this.extractNgRxReducers(sourceFile, filePath, deps);
    }

    if (isEffectFile) {
      metadata.effects = this.extractNgRxEffects(sourceFile, filePath, deps);
    }

    if (isSelectorFile) {
      metadata.selectors = this.extractNgRxSelectors(sourceFile, filePath, deps);
    }

    // Check for feature key
    const featureKey = this.extractFeatureKey(sourceFile);
    if (featureKey) {
      metadata.featureKey = featureKey;
    }

    // Return undefined if no NgRx metadata was found
    if (!metadata.actions?.length && !metadata.reducers?.length &&
        !metadata.effects?.length && !metadata.selectors?.length && !metadata.featureKey) {
      return undefined;
    }

    return metadata;
  }

  private extractNgRxActions(sourceFile: SourceFile): NgRxAction[] {
    const actions: NgRxAction[] = [];

    // New pattern: createAction
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'createAction') {
          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            const actionType = args[0].getLiteralValue();

            // Get the variable name
            const parent = node.getParent();
            let name = actionType;
            if (Node.isVariableDeclaration(parent)) {
              name = parent.getName();
            }

            actions.push({
              name,
              type: actionType,
              line: node.getStartLineNumber(),
            });
          }
        }
      }
    });

    // Old pattern: class extending Action
    for (const cls of sourceFile.getClasses()) {
      const heritage = cls.getHeritageClauses();
      for (const clause of heritage) {
        const text = clause.getText();
        if (text.includes('implements') && text.includes('Action')) {
          const typeProperty = cls.getProperty('type');
          if (typeProperty) {
            const initializer = typeProperty.getInitializer();
            if (initializer && Node.isStringLiteral(initializer)) {
              actions.push({
                name: cls.getName() || 'UnnamedAction',
                type: initializer.getLiteralValue(),
                line: cls.getStartLineNumber(),
              });
            }
          }
        }
      }
    }

    return actions;
  }

  private extractNgRxReducers(sourceFile: SourceFile, filePath: string, deps: Dependency[]): NgRxReducer[] {
    const reducers: NgRxReducer[] = [];

    // New pattern: createReducer with on()
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'createReducer') {
          const actions: string[] = [];

          // Find on() calls in the arguments
          for (const arg of node.getArguments()) {
            if (Node.isCallExpression(arg)) {
              const argExpr = arg.getExpression();
              if (Node.isIdentifier(argExpr) && argExpr.getText() === 'on') {
                const onArgs = arg.getArguments();
                // First arg(s) are action(s)
                for (const onArg of onArgs) {
                  if (Node.isIdentifier(onArg)) {
                    const actionName = onArg.getText();
                    actions.push(actionName);

                    deps.push({
                      type: 'ngrx-action',
                      source: filePath,
                      target: `ngrx-action:${actionName}`,
                      specifier: actionName,
                      line: onArg.getStartLineNumber(),
                      column: 0,
                      metadata: { context: 'reducer' },
                    });
                  }
                }
              }
            }
          }

          // Get reducer name
          const parent = node.getParent();
          let name = 'reducer';
          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          reducers.push({
            name,
            actions,
            line: node.getStartLineNumber(),
          });
        }
      }
    });

    // Old pattern: switch on action.type
    for (const fn of sourceFile.getFunctions()) {
      const body = fn.getBody();
      if (!body) continue;

      const switchStatements = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
      for (const sw of switchStatements) {
        const expr = sw.getExpression();
        if (expr.getText().includes('.type')) {
          const actions: string[] = [];
          const clauses = sw.getClauses();

          for (const clause of clauses) {
            if (Node.isCaseClause(clause)) {
              const caseExpr = clause.getExpression();
              if (caseExpr) {
                const actionRef = caseExpr.getText();
                actions.push(actionRef);

                deps.push({
                  type: 'ngrx-action',
                  source: filePath,
                  target: `ngrx-action:${actionRef}`,
                  specifier: actionRef,
                  line: clause.getStartLineNumber(),
                  column: 0,
                  metadata: { context: 'reducer', pattern: 'switch' },
                });
              }
            }
          }

          reducers.push({
            name: fn.getName() || 'reducer',
            actions,
            line: fn.getStartLineNumber(),
          });
        }
      }
    }

    return reducers;
  }

  private extractNgRxEffects(sourceFile: SourceFile, filePath: string, deps: Dependency[]): NgRxEffect[] {
    const effects: NgRxEffect[] = [];

    for (const cls of sourceFile.getClasses()) {
      for (const prop of cls.getProperties()) {
        const initializer = prop.getInitializer();
        if (!initializer) continue;

        // Look for createEffect or @Effect decorator
        const decorators = prop.getDecorators();
        const hasEffectDecorator = decorators.some(d => d.getName() === 'Effect');

        if (hasEffectDecorator || this.isCreateEffectCall(initializer)) {
          const actions: string[] = [];
          const dispatches: string[] = [];

          // Find ofType calls
          initializer.forEachDescendant((node) => {
            if (Node.isCallExpression(node)) {
              const expr = node.getExpression();
              if (Node.isIdentifier(expr) && expr.getText() === 'ofType') {
                for (const arg of node.getArguments()) {
                  const actionName = arg.getText();
                  actions.push(actionName);

                  deps.push({
                    type: 'ngrx-action',
                    source: filePath,
                    target: `ngrx-action:${actionName}`,
                    specifier: actionName,
                    line: arg.getStartLineNumber(),
                    column: 0,
                    metadata: { context: 'effect' },
                  });
                }
              }
            }
          });

          effects.push({
            name: prop.getName(),
            actions,
            dispatches,
            line: prop.getStartLineNumber(),
          });
        }
      }
    }

    return effects;
  }

  private isCreateEffectCall(node: Node): boolean {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isIdentifier(expr) && expr.getText() === 'createEffect') {
        return true;
      }
    }
    return false;
  }

  private extractNgRxSelectors(sourceFile: SourceFile, filePath: string, deps: Dependency[]): NgRxSelector[] {
    const selectors: NgRxSelector[] = [];

    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === 'createSelector') {
          const args = node.getArguments();
          const composedFrom: string[] = [];

          // All args except the last are input selectors
          for (let i = 0; i < args.length - 1; i++) {
            const arg = args[i];
            if (Node.isIdentifier(arg)) {
              const selectorName = arg.getText();
              composedFrom.push(selectorName);

              deps.push({
                type: 'ngrx-selector',
                source: filePath,
                target: `ngrx-selector:${selectorName}`,
                specifier: selectorName,
                line: arg.getStartLineNumber(),
                column: 0,
                metadata: { context: 'composition' },
              });
            }
          }

          // Get selector name
          const parent = node.getParent();
          let name = 'selector';
          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          selectors.push({
            name,
            composedFrom: composedFrom.length > 0 ? composedFrom : undefined,
            line: node.getStartLineNumber(),
          });
        }

        // createFeatureSelector
        if (Node.isIdentifier(expr) && expr.getText() === 'createFeatureSelector') {
          const parent = node.getParent();
          let name = 'featureSelector';
          let featureKey: string | undefined;

          if (Node.isVariableDeclaration(parent)) {
            name = parent.getName();
          }

          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            featureKey = args[0].getLiteralValue();
          }

          selectors.push({
            name,
            featureKey,
            line: node.getStartLineNumber(),
          });
        }
      }
    });

    return selectors;
  }

  private extractFeatureKey(sourceFile: SourceFile): string | undefined {
    // Look for StoreModule.forFeature('key', reducer)
    let featureKey: string | undefined;

    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const objName = expr.getExpression().getText();
          const methodName = expr.getName();

          if (objName === 'StoreModule' && methodName === 'forFeature') {
            const args = node.getArguments();
            if (args.length > 0 && Node.isStringLiteral(args[0])) {
              featureKey = args[0].getLiteralValue();
            }
          }
        }
      }
    });

    return featureKey;
  }

  // ============ UTILITIES ============

  private getArrayStrings(arr: ArrayLiteralExpression): string[] {
    const strings: string[] = [];
    for (const element of arr.getElements()) {
      if (Node.isStringLiteral(element)) {
        strings.push(element.getLiteralValue());
      }
    }
    return strings;
  }
}
