import { Project, SourceFile, SyntaxKind, Node, ClassDeclaration, Decorator } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { FileNode } from '../config';
import { parseTemplate, TemplateRef } from './template';
import { parseNgRxPatterns, NgRxPatterns, inferNgRxFileType } from './ngrx';

export interface ParsedFile {
  filePath: string;
  relativePath: string;
  className?: string;
  type: FileNode['type'];
  selector?: string;
  providedIn?: string;
  imports: string[];           // ES module imports (resolved paths)
  ngModuleImports: string[];   // @NgModule imports array
  ngModuleDeclarations: string[];
  ngModuleExports: string[];
  ngModuleProviders: string[];
  componentProviders: string[];
  constructorInjections: string[];
  templateRefs: TemplateRef[];
  ngrx?: NgRxPatterns;         // NgRx action/reducer/effect/selector patterns
  ngrxFileType?: 'action' | 'reducer' | 'effect' | 'selector' | 'state' | null;
}

export class AngularParser {
  private project: Project;
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        skipLibCheck: true,
      }
    });
  }

  parseDirectory(dirPath: string, extensions: string[] = ['.ts'], showProgress: boolean = false): ParsedFile[] {
    const files = this.collectFiles(dirPath, extensions);
    const parsed: ParsedFile[] = [];

    let count = 0;
    for (const filePath of files) {
      try {
        const result = this.parseFile(filePath);
        if (result) {
          parsed.push(result);
        }
        count++;
        if (showProgress && count % 100 === 0) {
          process.stdout.write(`\r  Parsed ${count}/${files.length} files...`);
        }
      } catch (err) {
        console.warn(`Failed to parse ${filePath}: ${err}`);
      }
    }

    if (showProgress) {
      process.stdout.write(`\r  Parsed ${count}/${files.length} files.    \n`);
    }

    return parsed;
  }

  private collectFiles(dirPath: string, extensions: string[]): string[] {
    const results: string[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (extensions.some(ext => entry.name.endsWith(ext))) {
            results.push(fullPath);
          }
        }
      }
    };

    walk(dirPath);
    return results;
  }

  parseFile(filePath: string): ParsedFile | null {
    if (!fs.existsSync(filePath)) return null;

    const result: ParsedFile = {
      filePath,
      relativePath: path.relative(this.baseDir, filePath),
      type: 'unknown',
      imports: [],
      ngModuleImports: [],
      ngModuleDeclarations: [],
      ngModuleExports: [],
      ngModuleProviders: [],
      componentProviders: [],
      constructorInjections: [],
      templateRefs: [],
    };

    // For non-TypeScript files, just return basic info without ts-morph parsing
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
      if (filePath.endsWith('.scss')) {
        result.type = 'util'; // Style files
      } else if (filePath.endsWith('.html')) {
        result.type = 'unknown'; // Template files (parsed via component's templateUrl)
      }
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });

    // Parse ES imports
    result.imports = this.parseImports(sourceFile, filePath);

    // Find decorated classes
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const decorators = cls.getDecorators();
      for (const decorator of decorators) {
        const name = decorator.getName();

        if (name === 'Component') {
          result.type = 'component';
          result.className = cls.getName();
          this.parseComponentDecorator(decorator, result, filePath);
          this.parseConstructorInjections(cls, result);
        } else if (name === 'NgModule') {
          result.type = 'module';
          result.className = cls.getName();
          this.parseNgModuleDecorator(decorator, result);
        } else if (name === 'Injectable') {
          result.type = 'service';
          result.className = cls.getName();
          this.parseInjectableDecorator(decorator, result);
          this.parseConstructorInjections(cls, result);
        } else if (name === 'Directive') {
          result.type = 'directive';
          result.className = cls.getName();
          this.parseDirectiveDecorator(decorator, result);
          this.parseConstructorInjections(cls, result);
        } else if (name === 'Pipe') {
          result.type = 'pipe';
          result.className = cls.getName();
          this.parsePipeDecorator(decorator, result);
        }
      }
    }

    // Infer type from filename if not decorated
    if (result.type === 'unknown') {
      result.type = this.inferTypeFromFilename(filePath);
      // Try to get class name even without decorator
      if (classes.length > 0) {
        result.className = classes[0].getName();
      }
    }

    // Parse NgRx patterns (actions, reducers, effects, selectors)
    if (filePath.endsWith('.ts')) {
      result.ngrx = parseNgRxPatterns(filePath, content);
      result.ngrxFileType = inferNgRxFileType(filePath);
    }

    this.project.removeSourceFile(sourceFile);
    return result;
  }

  private parseImports(sourceFile: SourceFile, currentFile: string): string[] {
    const imports: string[] = [];
    const currentDir = path.dirname(currentFile);

    // Parse import declarations
    const importDecls = sourceFile.getImportDeclarations();
    for (const imp of importDecls) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const resolved = this.resolveModuleSpecifier(moduleSpecifier, currentDir);
      if (resolved) {
        imports.push(resolved);
      }
    }

    // Parse export declarations (re-exports like: export { X } from './foo' or export * from './bar')
    const exportDecls = sourceFile.getExportDeclarations();
    for (const exp of exportDecls) {
      const moduleSpecifier = exp.getModuleSpecifierValue();
      if (moduleSpecifier) {
        const resolved = this.resolveModuleSpecifier(moduleSpecifier, currentDir);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }

    return imports;
  }

  private resolveModuleSpecifier(moduleSpecifier: string, currentDir: string): string | null {
    // Skip external packages
    if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
      return null;
    }

    // Resolve relative path
    let resolved = path.resolve(currentDir, moduleSpecifier);

    // Handle directory imports and missing extensions
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = path.join(resolved, 'index.ts');
    } else if (!path.extname(resolved)) {
      if (fs.existsSync(resolved + '.ts')) {
        resolved = resolved + '.ts';
      } else if (fs.existsSync(resolved + '.tsx')) {
        resolved = resolved + '.tsx';
      } else if (fs.existsSync(resolved + '/index.ts')) {
        resolved = resolved + '/index.ts';
      }
    }

    return resolved;
  }

  private parseComponentDecorator(decorator: Decorator, result: ParsedFile, filePath: string): void {
    const args = decorator.getArguments();
    if (args.length === 0) return;

    const obj = args[0];
    if (!Node.isObjectLiteralExpression(obj)) return;

    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;

      const propName = prop.getName();
      const initializer = prop.getInitializer();
      if (!initializer) continue;

      if (propName === 'selector' && Node.isStringLiteral(initializer)) {
        result.selector = initializer.getLiteralValue();
      } else if (propName === 'providers' && Node.isArrayLiteralExpression(initializer)) {
        result.componentProviders = this.parseArrayOfIdentifiers(initializer);
      } else if (propName === 'templateUrl' && Node.isStringLiteral(initializer)) {
        // Parse template file for selector references
        const templatePath = path.resolve(path.dirname(filePath), initializer.getLiteralValue());
        if (fs.existsSync(templatePath)) {
          const templateContent = fs.readFileSync(templatePath, 'utf-8');
          result.templateRefs = parseTemplate(templateContent);
        }
      } else if (propName === 'template' && Node.isStringLiteral(initializer)) {
        // Inline template
        result.templateRefs = parseTemplate(initializer.getLiteralValue());
      } else if (propName === 'template' && Node.isNoSubstitutionTemplateLiteral(initializer)) {
        result.templateRefs = parseTemplate(initializer.getLiteralValue());
      }
    }
  }

  private parseNgModuleDecorator(decorator: Decorator, result: ParsedFile): void {
    const args = decorator.getArguments();
    if (args.length === 0) return;

    const obj = args[0];
    if (!Node.isObjectLiteralExpression(obj)) return;

    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;

      const propName = prop.getName();
      const initializer = prop.getInitializer();
      if (!initializer) continue;

      if (Node.isArrayLiteralExpression(initializer)) {
        const identifiers = this.parseArrayOfIdentifiers(initializer);

        if (propName === 'imports') {
          result.ngModuleImports = identifiers;
        } else if (propName === 'declarations') {
          result.ngModuleDeclarations = identifiers;
        } else if (propName === 'exports') {
          result.ngModuleExports = identifiers;
        } else if (propName === 'providers') {
          result.ngModuleProviders = identifiers;
        }
      }
    }
  }

  private parseInjectableDecorator(decorator: Decorator, result: ParsedFile): void {
    const args = decorator.getArguments();
    if (args.length === 0) return;

    const obj = args[0];
    if (!Node.isObjectLiteralExpression(obj)) return;

    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;

      if (prop.getName() === 'providedIn') {
        const initializer = prop.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          result.providedIn = initializer.getLiteralValue();
        }
      }
    }
  }

  private parseDirectiveDecorator(decorator: Decorator, result: ParsedFile): void {
    const args = decorator.getArguments();
    if (args.length === 0) return;

    const obj = args[0];
    if (!Node.isObjectLiteralExpression(obj)) return;

    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;

      if (prop.getName() === 'selector') {
        const initializer = prop.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          result.selector = initializer.getLiteralValue();
        }
      }
    }
  }

  private parsePipeDecorator(decorator: Decorator, result: ParsedFile): void {
    const args = decorator.getArguments();
    if (args.length === 0) return;

    const obj = args[0];
    if (!Node.isObjectLiteralExpression(obj)) return;

    for (const prop of obj.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) continue;

      if (prop.getName() === 'name') {
        const initializer = prop.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          result.selector = initializer.getLiteralValue(); // Using selector field for pipe name
        }
      }
    }
  }

  private parseConstructorInjections(cls: ClassDeclaration, result: ParsedFile): void {
    const constructor = cls.getConstructors()[0];
    if (!constructor) return;

    for (const param of constructor.getParameters()) {
      const typeNode = param.getTypeNode();
      if (typeNode) {
        const typeText = typeNode.getText();
        // Filter out primitives and common non-injectable types
        if (!['string', 'number', 'boolean', 'any', 'void', 'null', 'undefined'].includes(typeText)) {
          result.constructorInjections.push(typeText);
        }
      }
    }
  }

  private parseArrayOfIdentifiers(arr: Node): string[] {
    const results: string[] = [];

    if (!Node.isArrayLiteralExpression(arr)) return results;

    for (const element of arr.getElements()) {
      if (Node.isIdentifier(element)) {
        results.push(element.getText());
      } else if (Node.isCallExpression(element)) {
        // Handle forRoot(), forChild(), etc.
        const expr = element.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const obj = expr.getExpression();
          if (Node.isIdentifier(obj)) {
            results.push(obj.getText());
          }
        }
      } else if (Node.isPropertyAccessExpression(element)) {
        // Handle things like SomeModule.forRoot
        const obj = element.getExpression();
        if (Node.isIdentifier(obj)) {
          results.push(obj.getText());
        }
      }
    }

    return results;
  }

  private inferTypeFromFilename(filePath: string): FileNode['type'] {
    const basename = path.basename(filePath, path.extname(filePath));

    if (basename.endsWith('.component')) return 'component';
    if (basename.endsWith('.service')) return 'service';
    if (basename.endsWith('.module')) return 'module';
    if (basename.endsWith('.directive')) return 'directive';
    if (basename.endsWith('.pipe')) return 'pipe';
    if (basename.endsWith('.guard')) return 'guard';
    if (basename.endsWith('.interceptor')) return 'interceptor';
    if (basename.endsWith('.model') || basename.endsWith('.interface') || basename.endsWith('.dto')) return 'model';
    if (basename.endsWith('.util') || basename.endsWith('.helper') || basename.endsWith('.utils')) return 'util';

    return 'unknown';
  }
}

export { parseTemplate, TemplateRef } from './template';
