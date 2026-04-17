/**
 * Dependency Extractor - orchestrates all extraction passes
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
import { Project } from 'ts-morph';

import { Dependency, FileAnalysis, Export } from './types';
import { PathResolver } from './resolver';
import { ImportExtractor } from './extractor-imports';
import { AngularExtractor } from './extractor-angular';
import { NgRxExtractor } from './extractor-ngrx';

export class DependencyExtractor {
  private resolver: PathResolver;
  private project: Project;
  private importExtractor: ImportExtractor;
  private angularExtractor: AngularExtractor;
  private ngrxExtractor: NgRxExtractor;

  constructor(resolver: PathResolver) {
    this.resolver = resolver;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });

    this.importExtractor = new ImportExtractor(resolver);
    this.angularExtractor = new AngularExtractor();
    this.ngrxExtractor = new NgRxExtractor();
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
      this.importExtractor.extractImports(sourceFile, absolutePath, dependencies);

      // Pass 2: Export declarations (including re-exports)
      this.importExtractor.extractExports(sourceFile, absolutePath, dependencies, exports);

      // Pass 3: Dynamic imports
      this.importExtractor.extractDynamicImports(sourceFile, absolutePath, dependencies);

      // Pass 4: require() calls
      this.importExtractor.extractRequireCalls(sourceFile, absolutePath, dependencies);

      // Pass 5: Triple-slash references
      this.importExtractor.extractTripleSlash(sourceFile, absolutePath, dependencies);

      // Pass 6-8: Angular metadata
      const angularMetadata = this.angularExtractor.extract(sourceFile, absolutePath, dependencies);

      // Pass 9: NgRx metadata
      const ngrxMetadata = this.ngrxExtractor.extract(sourceFile, absolutePath, dependencies);

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
}
