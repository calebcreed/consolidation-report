/**
 * Angular Metadata Extraction - handles A1-A12
 *
 * - Component/Directive/Pipe/NgModule/Injectable decorators
 * - Constructor injection (A1, A2)
 * - Template parsing (A7-A9)
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  SourceFile,
  Node,
  Decorator,
  ObjectLiteralExpression,
  ArrayLiteralExpression,
  ClassDeclaration,
} from 'ts-morph';

import {
  Dependency,
  DependencyType,
  AngularMetadata,
} from './types';
import { getArrayStrings } from './extractor-imports';

export class AngularExtractor {
  /**
   * Extract Angular metadata from source file
   */
  extract(
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
          this.parseExternalTemplate(templatePath, filePath, deps);
        } else if (propName === 'template' && Node.isStringLiteral(initializer!)) {
          metadata.template = initializer.getLiteralValue();
          this.parseInlineTemplate(metadata.template, filePath, decorator.getStartLineNumber(), deps);
        } else if (propName === 'template' && Node.isNoSubstitutionTemplateLiteral(initializer!)) {
          metadata.template = initializer.getLiteralValue();
          this.parseInlineTemplate(metadata.template, filePath, decorator.getStartLineNumber(), deps);
        } else if (propName === 'styleUrls' && Node.isArrayLiteralExpression(initializer!)) {
          metadata.styleUrls = getArrayStrings(initializer);
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
        const spreadExpr = element.getExpression();
        if (Node.isIdentifier(spreadExpr)) {
          name = spreadExpr.getText();
        }
      } else if (Node.isCallExpression(element)) {
        const expr = element.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          name = expr.getExpression().getText();
        }
      }

      if (name) {
        names.push(name);
        deps.push({
          type,
          source: filePath,
          target: `symbol:${name}`,
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

  /**
   * Extract constructor injections (A1, A2)
   */
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

  /**
   * Parse external template file (A7-A9)
   */
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

  /**
   * Parse inline template (A7-A9)
   */
  private parseInlineTemplate(
    template: string,
    componentPath: string,
    startLine: number,
    deps: Dependency[]
  ): void {
    this.parseTemplateContent(template, componentPath, startLine, deps);
  }

  /**
   * Parse template content for components, pipes, and directives
   */
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
    const builtInPipes = [
      'async', 'date', 'uppercase', 'lowercase', 'currency',
      'number', 'percent', 'json', 'slice', 'keyvalue', 'titlecase'
    ];

    while ((match = pipeRegex.exec(content)) !== null) {
      const pipeName = match[1];
      if (builtInPipes.includes(pipeName)) continue;

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
    const builtInDirectives = [
      'ngIf', 'ngFor', 'ngSwitch', 'ngClass', 'ngStyle', 'ngModel',
      'formControl', 'formGroup', 'formControlName', 'formGroupName',
      'formArrayName', 'routerLink', 'routerLinkActive'
    ];

    while ((match = directiveRegex.exec(content)) !== null) {
      const directiveName = match[1];
      if (builtInDirectives.includes(directiveName)) continue;

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
}
