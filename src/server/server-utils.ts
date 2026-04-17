/**
 * Server Utilities - file comparison and directory scanning
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';
import { SemanticComparator } from '../diff/comparator';
import { DiffResult } from '../diff/types';
import { FileStatus } from '../report';

// Singleton comparator instance
const semanticComparator = new SemanticComparator();

export interface CompareResult {
  status: FileStatus;
  diff: DiffResult;
  unifiedDiff: string;
  linesChanged: number;
}

/**
 * Count changed lines in a unified diff (lines starting with + or -)
 */
export function countChangedLines(unifiedDiff: string): number {
  let count = 0;
  const lines = unifiedDiff.split('\n');
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      continue;
    }
    if (line.startsWith('+') || line.startsWith('-')) {
      count++;
    }
  }
  return count;
}

/**
 * Compare two files using AST-based semantic comparison
 */
export function compareFiles(
  retailPath: string | null,
  restaurantPath: string | null,
  relativePath: string
): CompareResult {
  // Restaurant-only case
  if (!retailPath || !fs.existsSync(retailPath)) {
    const restaurantContent = fs.readFileSync(restaurantPath!, 'utf-8');
    const unifiedDiff = createTwoFilesPatch(
      `retail/${relativePath}`,
      `restaurant/${relativePath}`,
      '',
      restaurantContent,
      'does not exist',
      ''
    );
    return {
      status: 'restaurant-only',
      diff: { status: 'dirty', changes: [] },
      unifiedDiff,
      linesChanged: restaurantContent.split('\n').length
    };
  }

  // Retail-only case
  if (!restaurantPath || !fs.existsSync(restaurantPath)) {
    const retailContent = fs.readFileSync(retailPath, 'utf-8');
    const unifiedDiff = createTwoFilesPatch(
      `retail/${relativePath}`,
      `restaurant/${relativePath}`,
      retailContent,
      '',
      '',
      'does not exist'
    );
    return {
      status: 'retail-only',
      diff: { status: 'dirty', changes: [] },
      unifiedDiff,
      linesChanged: retailContent.split('\n').length
    };
  }

  // Both exist - use semantic comparison
  const diffResult = semanticComparator.compare(retailPath, restaurantPath);

  const retailContent = fs.readFileSync(retailPath, 'utf-8');
  const restaurantContent = fs.readFileSync(restaurantPath, 'utf-8');
  const unifiedDiff = createTwoFilesPatch(
    `retail/${relativePath}`,
    `restaurant/${relativePath}`,
    retailContent,
    restaurantContent,
    '',
    ''
  );

  const linesChanged = countChangedLines(unifiedDiff);

  // Map diff result to file status
  let status: FileStatus;
  switch (diffResult.status) {
    case 'identical':
    case 'clean':
      status = 'clean';
      break;
    case 'dirty':
    case 'structural':
    default:
      status = 'conflict';
  }

  return { status, diff: diffResult, unifiedDiff, linesChanged };
}

/**
 * Scan a directory recursively for TypeScript files
 * Returns paths relative to appDir
 */
export function scanDirectory(srcDir: string, appDir: string): Map<string, string> {
  const files = new Map<string, string>();

  function scan(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        const relativePath = path.relative(appDir, fullPath);
        files.set(relativePath, fullPath);
      }
    }
  }

  scan(srcDir);
  return files;
}

/**
 * Scan directory for file type discovery
 */
export function discoverFileTypes(basePath: string): {
  totalFiles: number;
  extensions: Array<{ extension: string; count: number; samples: string[] }>;
} {
  const extensionMap = new Map<string, { count: number; samples: string[] }>();
  let totalFiles = 0;

  function scanDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.cache', '.nx'].includes(entry.name)) {
            scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          totalFiles++;
          const ext = path.extname(entry.name).toLowerCase() || '(no extension)';
          const relativePath = path.relative(basePath, fullPath);

          if (!extensionMap.has(ext)) {
            extensionMap.set(ext, { count: 0, samples: [] });
          }
          const data = extensionMap.get(ext)!;
          data.count++;
          if (data.samples.length < 5) {
            data.samples.push(relativePath);
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }

  scanDir(basePath);

  const extensions = Array.from(extensionMap.entries()).map(([ext, data]) => ({
    extension: ext,
    count: data.count,
    samples: data.samples,
  }));

  return { totalFiles, extensions };
}
