"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTemplate = exports.AngularParser = void 0;
const ts_morph_1 = require("ts-morph");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const template_1 = require("./template");
const ngrx_1 = require("./ngrx");
class AngularParser {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.project = new ts_morph_1.Project({
            skipAddingFilesFromTsConfig: true,
            compilerOptions: {
                allowJs: true,
                skipLibCheck: true,
            }
        });
    }
    parseDirectory(dirPath, extensions = ['.ts'], showProgress = false) {
        const files = this.collectFiles(dirPath, extensions);
        const parsed = [];
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
            }
            catch (err) {
                console.warn(`Failed to parse ${filePath}: ${err}`);
            }
        }
        if (showProgress) {
            process.stdout.write(`\r  Parsed ${count}/${files.length} files.    \n`);
        }
        return parsed;
    }
    collectFiles(dirPath, extensions) {
        const results = [];
        const walk = (dir) => {
            if (!fs.existsSync(dir))
                return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
                        walk(fullPath);
                    }
                }
                else if (entry.isFile()) {
                    if (extensions.some(ext => entry.name.endsWith(ext))) {
                        results.push(fullPath);
                    }
                }
            }
        };
        walk(dirPath);
        return results;
    }
    parseFile(filePath) {
        if (!fs.existsSync(filePath))
            return null;
        const result = {
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
            }
            else if (filePath.endsWith('.html')) {
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
                }
                else if (name === 'NgModule') {
                    result.type = 'module';
                    result.className = cls.getName();
                    this.parseNgModuleDecorator(decorator, result);
                }
                else if (name === 'Injectable') {
                    result.type = 'service';
                    result.className = cls.getName();
                    this.parseInjectableDecorator(decorator, result);
                    this.parseConstructorInjections(cls, result);
                }
                else if (name === 'Directive') {
                    result.type = 'directive';
                    result.className = cls.getName();
                    this.parseDirectiveDecorator(decorator, result);
                    this.parseConstructorInjections(cls, result);
                }
                else if (name === 'Pipe') {
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
            result.ngrx = (0, ngrx_1.parseNgRxPatterns)(filePath, content);
            result.ngrxFileType = (0, ngrx_1.inferNgRxFileType)(filePath);
        }
        this.project.removeSourceFile(sourceFile);
        return result;
    }
    parseImports(sourceFile, currentFile) {
        const imports = [];
        const importDecls = sourceFile.getImportDeclarations();
        for (const imp of importDecls) {
            const moduleSpecifier = imp.getModuleSpecifierValue();
            // Skip external packages
            if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
                continue;
            }
            // Resolve relative path
            const currentDir = path.dirname(currentFile);
            let resolved = path.resolve(currentDir, moduleSpecifier);
            // Handle directory imports and missing extensions
            if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                resolved = path.join(resolved, 'index.ts');
            }
            else if (!path.extname(resolved)) {
                if (fs.existsSync(resolved + '.ts')) {
                    resolved = resolved + '.ts';
                }
                else if (fs.existsSync(resolved + '.tsx')) {
                    resolved = resolved + '.tsx';
                }
                else if (fs.existsSync(resolved + '/index.ts')) {
                    resolved = resolved + '/index.ts';
                }
            }
            imports.push(resolved);
        }
        return imports;
    }
    parseComponentDecorator(decorator, result, filePath) {
        const args = decorator.getArguments();
        if (args.length === 0)
            return;
        const obj = args[0];
        if (!ts_morph_1.Node.isObjectLiteralExpression(obj))
            return;
        for (const prop of obj.getProperties()) {
            if (!ts_morph_1.Node.isPropertyAssignment(prop))
                continue;
            const propName = prop.getName();
            const initializer = prop.getInitializer();
            if (!initializer)
                continue;
            if (propName === 'selector' && ts_morph_1.Node.isStringLiteral(initializer)) {
                result.selector = initializer.getLiteralValue();
            }
            else if (propName === 'providers' && ts_morph_1.Node.isArrayLiteralExpression(initializer)) {
                result.componentProviders = this.parseArrayOfIdentifiers(initializer);
            }
            else if (propName === 'templateUrl' && ts_morph_1.Node.isStringLiteral(initializer)) {
                // Parse template file for selector references
                const templatePath = path.resolve(path.dirname(filePath), initializer.getLiteralValue());
                if (fs.existsSync(templatePath)) {
                    const templateContent = fs.readFileSync(templatePath, 'utf-8');
                    result.templateRefs = (0, template_1.parseTemplate)(templateContent);
                }
            }
            else if (propName === 'template' && ts_morph_1.Node.isStringLiteral(initializer)) {
                // Inline template
                result.templateRefs = (0, template_1.parseTemplate)(initializer.getLiteralValue());
            }
            else if (propName === 'template' && ts_morph_1.Node.isNoSubstitutionTemplateLiteral(initializer)) {
                result.templateRefs = (0, template_1.parseTemplate)(initializer.getLiteralValue());
            }
        }
    }
    parseNgModuleDecorator(decorator, result) {
        const args = decorator.getArguments();
        if (args.length === 0)
            return;
        const obj = args[0];
        if (!ts_morph_1.Node.isObjectLiteralExpression(obj))
            return;
        for (const prop of obj.getProperties()) {
            if (!ts_morph_1.Node.isPropertyAssignment(prop))
                continue;
            const propName = prop.getName();
            const initializer = prop.getInitializer();
            if (!initializer)
                continue;
            if (ts_morph_1.Node.isArrayLiteralExpression(initializer)) {
                const identifiers = this.parseArrayOfIdentifiers(initializer);
                if (propName === 'imports') {
                    result.ngModuleImports = identifiers;
                }
                else if (propName === 'declarations') {
                    result.ngModuleDeclarations = identifiers;
                }
                else if (propName === 'exports') {
                    result.ngModuleExports = identifiers;
                }
                else if (propName === 'providers') {
                    result.ngModuleProviders = identifiers;
                }
            }
        }
    }
    parseInjectableDecorator(decorator, result) {
        const args = decorator.getArguments();
        if (args.length === 0)
            return;
        const obj = args[0];
        if (!ts_morph_1.Node.isObjectLiteralExpression(obj))
            return;
        for (const prop of obj.getProperties()) {
            if (!ts_morph_1.Node.isPropertyAssignment(prop))
                continue;
            if (prop.getName() === 'providedIn') {
                const initializer = prop.getInitializer();
                if (initializer && ts_morph_1.Node.isStringLiteral(initializer)) {
                    result.providedIn = initializer.getLiteralValue();
                }
            }
        }
    }
    parseDirectiveDecorator(decorator, result) {
        const args = decorator.getArguments();
        if (args.length === 0)
            return;
        const obj = args[0];
        if (!ts_morph_1.Node.isObjectLiteralExpression(obj))
            return;
        for (const prop of obj.getProperties()) {
            if (!ts_morph_1.Node.isPropertyAssignment(prop))
                continue;
            if (prop.getName() === 'selector') {
                const initializer = prop.getInitializer();
                if (initializer && ts_morph_1.Node.isStringLiteral(initializer)) {
                    result.selector = initializer.getLiteralValue();
                }
            }
        }
    }
    parsePipeDecorator(decorator, result) {
        const args = decorator.getArguments();
        if (args.length === 0)
            return;
        const obj = args[0];
        if (!ts_morph_1.Node.isObjectLiteralExpression(obj))
            return;
        for (const prop of obj.getProperties()) {
            if (!ts_morph_1.Node.isPropertyAssignment(prop))
                continue;
            if (prop.getName() === 'name') {
                const initializer = prop.getInitializer();
                if (initializer && ts_morph_1.Node.isStringLiteral(initializer)) {
                    result.selector = initializer.getLiteralValue(); // Using selector field for pipe name
                }
            }
        }
    }
    parseConstructorInjections(cls, result) {
        const constructor = cls.getConstructors()[0];
        if (!constructor)
            return;
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
    parseArrayOfIdentifiers(arr) {
        const results = [];
        if (!ts_morph_1.Node.isArrayLiteralExpression(arr))
            return results;
        for (const element of arr.getElements()) {
            if (ts_morph_1.Node.isIdentifier(element)) {
                results.push(element.getText());
            }
            else if (ts_morph_1.Node.isCallExpression(element)) {
                // Handle forRoot(), forChild(), etc.
                const expr = element.getExpression();
                if (ts_morph_1.Node.isPropertyAccessExpression(expr)) {
                    const obj = expr.getExpression();
                    if (ts_morph_1.Node.isIdentifier(obj)) {
                        results.push(obj.getText());
                    }
                }
            }
            else if (ts_morph_1.Node.isPropertyAccessExpression(element)) {
                // Handle things like SomeModule.forRoot
                const obj = element.getExpression();
                if (ts_morph_1.Node.isIdentifier(obj)) {
                    results.push(obj.getText());
                }
            }
        }
        return results;
    }
    inferTypeFromFilename(filePath) {
        const basename = path.basename(filePath, path.extname(filePath));
        if (basename.endsWith('.component'))
            return 'component';
        if (basename.endsWith('.service'))
            return 'service';
        if (basename.endsWith('.module'))
            return 'module';
        if (basename.endsWith('.directive'))
            return 'directive';
        if (basename.endsWith('.pipe'))
            return 'pipe';
        if (basename.endsWith('.guard'))
            return 'guard';
        if (basename.endsWith('.interceptor'))
            return 'interceptor';
        if (basename.endsWith('.model') || basename.endsWith('.interface') || basename.endsWith('.dto'))
            return 'model';
        if (basename.endsWith('.util') || basename.endsWith('.helper') || basename.endsWith('.utils'))
            return 'util';
        return 'unknown';
    }
}
exports.AngularParser = AngularParser;
var template_2 = require("./template");
Object.defineProperty(exports, "parseTemplate", { enumerable: true, get: function () { return template_2.parseTemplate; } });
