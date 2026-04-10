/**
 * Path resolution - single source of truth for resolving import specifiers
 *
 * Handles:
 * 1. Relative imports (./foo, ../bar)
 * 2. Barrel resolution (folder → index.ts)
 * 3. baseUrl imports (Payments/foo via baseUrl: "src")
 * 4. Path aliases (@app/*, @core/*)
 * 5. Multi-part extensions (.component.ts, .service.ts)
 * 6. External packages (returns external:packageName)
 */

import * as path from 'path';
import * as fs from 'fs';
import { ResolvedPath, PathResolverConfig } from './types';

// Real code file extensions
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

// Extensions to try when resolving
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'];

// Known external packages that might look like paths
const EXTERNAL_PATTERNS = [
  /^@angular\//,
  /^@ngrx\//,
  /^@ionic\//,
  /^@capacitor\//,
  /^rxjs/,
  /^tslib/,
  /^zone\.js/,
];

export class PathResolver {
  private baseUrl: string | undefined;
  private paths: Record<string, string[]>;
  private extensions: string[];
  private rootDir: string;

  constructor(config: PathResolverConfig) {
    this.rootDir = config.rootDir;
    this.baseUrl = config.baseUrl;
    this.paths = config.paths || {};
    this.extensions = config.extensions || DEFAULT_EXTENSIONS;
  }

  /**
   * Parse tsconfig.json and extract path configuration
   */
  static parseTsconfig(tsconfigPath: string): { baseUrl?: string; paths?: Record<string, string[]> } {
    if (!fs.existsSync(tsconfigPath)) {
      return {};
    }

    const content = fs.readFileSync(tsconfigPath, 'utf-8');

    // Handle JSON5 syntax (comments, trailing commas)
    // We need to be careful not to remove // inside strings like "../../path"
    // Strategy: Replace strings with placeholders, strip comments, restore strings
    const strings: string[] = [];
    let cleaned = content.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
      const idx = strings.length;
      strings.push(match);
      return `__STRING_${idx}__`;
    });

    // Now safely remove comments
    cleaned = cleaned
      // Remove single-line comments
      .replace(/\/\/[^\n]*/g, '')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Restore strings
    cleaned = cleaned.replace(/__STRING_(\d+)__/g, (_, idx) => strings[parseInt(idx)]);

    // Remove trailing commas
    cleaned = cleaned.replace(/,(\s*[\}\]])/g, '$1');

    try {
      const tsconfig = JSON.parse(cleaned);
      const compilerOptions = tsconfig.compilerOptions || {};

      return {
        baseUrl: compilerOptions.baseUrl,
        paths: compilerOptions.paths,
      };
    } catch (e) {
      console.error(`Failed to parse tsconfig at ${tsconfigPath}:`, e);
      return {};
    }
  }

  /**
   * Create a PathResolver from a tsconfig file
   */
  static fromTsconfig(tsconfigPath: string): PathResolver {
    const tsconfigDir = path.dirname(tsconfigPath);
    const { baseUrl, paths } = PathResolver.parseTsconfig(tsconfigPath);

    // baseUrl is relative to tsconfig location
    const resolvedBaseUrl = baseUrl ? path.resolve(tsconfigDir, baseUrl) : undefined;

    return new PathResolver({
      rootDir: tsconfigDir,
      baseUrl: resolvedBaseUrl,
      paths: paths,
    });
  }

  /**
   * Check if a specifier is an external package
   */
  isExternal(specifier: string): boolean {
    // Relative paths are never external
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      return false;
    }

    // Check known external patterns
    for (const pattern of EXTERNAL_PATTERNS) {
      if (pattern.test(specifier)) {
        return true;
      }
    }

    // Bare specifiers without path separators are typically npm packages
    // But we need to check path aliases first
    if (this.matchPathAlias(specifier)) {
      return false;
    }

    // If it looks like a path (has / in it) and could be a baseUrl import, not external
    if (specifier.includes('/') && this.baseUrl) {
      const baseUrlResolved = this.tryResolveWithExtensions(
        path.join(this.baseUrl, specifier)
      );
      if (baseUrlResolved) {
        return false;
      }
    }

    // Scoped packages or simple package names
    if (specifier.startsWith('@') || !specifier.includes('/')) {
      return true;
    }

    // Has a / but no path alias match and no baseUrl match - likely external
    return true;
  }

  /**
   * Resolve an import specifier to an absolute path
   */
  resolve(specifier: string, fromFile: string): ResolvedPath {
    const fromDir = path.dirname(fromFile);

    // 1. Check if external
    if (this.isExternal(specifier)) {
      return {
        absolute: `external:${specifier}`,
        isExternal: true,
        isBarrel: false,
        originalSpecifier: specifier,
      };
    }

    // 2. Try relative import
    if (specifier.startsWith('.')) {
      const resolved = this.resolveRelative(specifier, fromDir);
      if (resolved) {
        return resolved;
      }
    }

    // 3. Try path alias
    const aliasResolved = this.resolvePathAlias(specifier);
    if (aliasResolved) {
      return aliasResolved;
    }

    // 4. Try baseUrl import
    if (this.baseUrl) {
      const baseUrlResolved = this.resolveBaseUrl(specifier);
      if (baseUrlResolved) {
        return baseUrlResolved;
      }
    }

    // 5. Unresolved - might be missing file or typo
    return {
      absolute: null,
      isExternal: false,
      isBarrel: false,
      originalSpecifier: specifier,
    };
  }

  /**
   * Resolve a relative import specifier
   */
  private resolveRelative(specifier: string, fromDir: string): ResolvedPath | null {
    const targetPath = path.resolve(fromDir, specifier);
    return this.resolveToFile(targetPath, specifier);
  }

  /**
   * Resolve using baseUrl
   */
  private resolveBaseUrl(specifier: string): ResolvedPath | null {
    if (!this.baseUrl) return null;
    const targetPath = path.join(this.baseUrl, specifier);
    return this.resolveToFile(targetPath, specifier);
  }

  /**
   * Match a specifier against path aliases
   */
  private matchPathAlias(specifier: string): { pattern: string; paths: string[]; suffix: string } | null {
    for (const [pattern, mappings] of Object.entries(this.paths)) {
      // Exact match
      if (pattern === specifier) {
        return { pattern, paths: mappings, suffix: '' };
      }

      // Wildcard match (@app/*)
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        if (specifier.startsWith(prefix + '/')) {
          const suffix = specifier.slice(prefix.length + 1);
          return { pattern, paths: mappings, suffix };
        }
      }
    }
    return null;
  }

  /**
   * Resolve using path aliases
   */
  private resolvePathAlias(specifier: string): ResolvedPath | null {
    const match = this.matchPathAlias(specifier);
    if (!match) return null;

    // Try each mapping
    for (const mapping of match.paths) {
      let targetPath: string;

      if (mapping.endsWith('/*')) {
        // Wildcard mapping - substitute suffix
        const baseMapping = mapping.slice(0, -2);
        targetPath = path.join(this.rootDir, baseMapping, match.suffix);
      } else {
        // Exact mapping
        targetPath = path.join(this.rootDir, mapping);
        if (match.suffix) {
          targetPath = path.join(targetPath, match.suffix);
        }
      }

      const resolved = this.resolveToFile(targetPath, specifier);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  /**
   * Resolve a path to an actual file (trying extensions and barrel files)
   */
  private resolveToFile(targetPath: string, originalSpecifier: string): ResolvedPath | null {
    // Normalize the path
    targetPath = path.normalize(targetPath);

    // 1. Try exact path (already has extension)
    if (this.hasCodeExtension(targetPath)) {
      if (fs.existsSync(targetPath)) {
        return {
          absolute: targetPath,
          isExternal: false,
          isBarrel: false,
          originalSpecifier,
        };
      }
      return null;
    }

    // 2. Try with extensions
    const withExtension = this.tryResolveWithExtensions(targetPath);
    if (withExtension) {
      return {
        absolute: withExtension,
        isExternal: false,
        isBarrel: false,
        originalSpecifier,
      };
    }

    // 3. Try as barrel (directory with index.ts)
    const barrelResolved = this.tryResolveBarrel(targetPath);
    if (barrelResolved) {
      return {
        absolute: barrelResolved,
        isExternal: false,
        isBarrel: true,
        originalSpecifier,
      };
    }

    return null;
  }

  /**
   * Check if path has a real code extension
   */
  private hasCodeExtension(filePath: string): boolean {
    for (const ext of CODE_EXTENSIONS) {
      if (filePath.endsWith(ext)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Try to resolve by adding extensions
   */
  private tryResolveWithExtensions(basePath: string): string | null {
    for (const ext of this.extensions) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    return null;
  }

  /**
   * Try to resolve as a barrel file (directory/index.ts)
   */
  private tryResolveBarrel(dirPath: string): string | null {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return null;
    }

    for (const ext of this.extensions) {
      const indexPath = path.join(dirPath, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  /**
   * Get the root directory for this resolver
   */
  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Get the base URL for this resolver
   */
  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }

  /**
   * Get configured path aliases
   */
  getPathAliases(): Record<string, string[]> {
    return { ...this.paths };
  }
}
