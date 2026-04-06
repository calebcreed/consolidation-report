import * as path from 'path';
import * as fs from 'fs';
import { FileMapping, FileMappingConfig } from '../config';
import { ParsedFile } from '../parser';

export interface MatchResult {
  matched: FileMapping[];
  retailOnly: string[];
  restaurantOnly: string[];
}

export class FileMatcher {
  private retailBase: string;
  private restaurantBase: string;

  constructor(retailBase: string, restaurantBase: string) {
    this.retailBase = retailBase;
    this.restaurantBase = restaurantBase;
  }

  match(
    retailFiles: ParsedFile[],
    restaurantFiles: ParsedFile[],
    manualOverrides?: Record<string, string>
  ): MatchResult {
    const matched: FileMapping[] = [];
    const matchedRetail = new Set<string>();
    const matchedRestaurant = new Set<string>();

    // Build lookup maps
    const restaurantByPath = new Map<string, ParsedFile>();
    const restaurantByClass = new Map<string, ParsedFile>();
    const restaurantBySelector = new Map<string, ParsedFile>();

    for (const file of restaurantFiles) {
      // Normalize path relative to restaurant base
      const relPath = this.normalizeRelativePath(file.filePath, this.restaurantBase);
      restaurantByPath.set(relPath, file);

      if (file.className) {
        restaurantByClass.set(file.className, file);
      }
      if (file.selector) {
        restaurantBySelector.set(file.selector, file);
      }
    }

    // Apply manual overrides first
    if (manualOverrides) {
      for (const [retailPath, restaurantPath] of Object.entries(manualOverrides)) {
        const retailFile = retailFiles.find(f =>
          this.normalizeRelativePath(f.filePath, this.retailBase) === retailPath
        );
        const restaurantFile = restaurantFiles.find(f =>
          this.normalizeRelativePath(f.filePath, this.restaurantBase) === restaurantPath
        );

        if (retailFile) {
          matched.push({
            retailFile: retailFile.filePath,
            restaurantFile: restaurantFile?.filePath || null,
            matchMethod: 'manual',
          });
          matchedRetail.add(retailFile.filePath);
          if (restaurantFile) {
            matchedRestaurant.add(restaurantFile.filePath);
          }
        }
      }
    }

    // Match by relative path
    for (const retailFile of retailFiles) {
      if (matchedRetail.has(retailFile.filePath)) continue;

      const relPath = this.normalizeRelativePath(retailFile.filePath, this.retailBase);
      const restaurantFile = restaurantByPath.get(relPath);

      if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
        matched.push({
          retailFile: retailFile.filePath,
          restaurantFile: restaurantFile.filePath,
          matchMethod: 'path',
        });
        matchedRetail.add(retailFile.filePath);
        matchedRestaurant.add(restaurantFile.filePath);
      }
    }

    // Match by class name (for files that moved)
    for (const retailFile of retailFiles) {
      if (matchedRetail.has(retailFile.filePath)) continue;
      if (!retailFile.className) continue;

      const restaurantFile = restaurantByClass.get(retailFile.className);
      if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
        matched.push({
          retailFile: retailFile.filePath,
          restaurantFile: restaurantFile.filePath,
          matchMethod: 'classname',
        });
        matchedRetail.add(retailFile.filePath);
        matchedRestaurant.add(restaurantFile.filePath);
      }
    }

    // Match by selector (for renamed components)
    for (const retailFile of retailFiles) {
      if (matchedRetail.has(retailFile.filePath)) continue;
      if (!retailFile.selector) continue;

      const restaurantFile = restaurantBySelector.get(retailFile.selector);
      if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
        matched.push({
          retailFile: retailFile.filePath,
          restaurantFile: restaurantFile.filePath,
          matchMethod: 'selector',
        });
        matchedRetail.add(retailFile.filePath);
        matchedRestaurant.add(restaurantFile.filePath);
      }
    }

    // Mark unmatched as retail-only
    for (const retailFile of retailFiles) {
      if (!matchedRetail.has(retailFile.filePath)) {
        matched.push({
          retailFile: retailFile.filePath,
          restaurantFile: null,
          matchMethod: 'unmatched',
        });
      }
    }

    // Collect restaurant-only files
    const restaurantOnly: string[] = [];
    for (const restaurantFile of restaurantFiles) {
      if (!matchedRestaurant.has(restaurantFile.filePath)) {
        restaurantOnly.push(restaurantFile.filePath);
      }
    }

    const retailOnly = matched
      .filter(m => m.restaurantFile === null)
      .map(m => m.retailFile);

    return {
      matched: matched.filter(m => m.restaurantFile !== null),
      retailOnly,
      restaurantOnly,
    };
  }

  private normalizeRelativePath(filePath: string, basePath: string): string {
    let rel = path.relative(basePath, filePath);
    // Normalize separators
    rel = rel.replace(/\\/g, '/');
    return rel;
  }

  saveMappingFile(result: MatchResult, outputPath: string): void {
    const config: FileMappingConfig = {
      mappings: result.matched,
      retailOnly: result.retailOnly,
      restaurantOnly: result.restaurantOnly,
      manualOverrides: {},
    };

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  }

  loadMappingFile(inputPath: string): FileMappingConfig | null {
    if (!fs.existsSync(inputPath)) return null;

    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
