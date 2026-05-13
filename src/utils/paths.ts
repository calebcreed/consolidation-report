/**
 * Path Normalization Utilities (Fix 2.1)
 *
 * Centralized path handling to ensure consistent path representations
 * across the entire codebase. All paths should go through these utilities.
 */

import * as path from 'path';

/**
 * Normalize an absolute file path to a relative path within the app.
 *
 * @param absolutePath - The absolute path to normalize
 * @param projectPath - The root project path (contains apps/)
 * @returns Relative path from app root (e.g., "src/app/foo.ts")
 *
 * Examples:
 *   /project/apps/restaurant/src/app/foo.ts -> src/app/foo.ts
 *   /project/apps/retail/src/services/bar.ts -> src/services/bar.ts
 */
export function normalizePath(absolutePath: string, projectPath: string): string {
  // Normalize both paths to handle trailing slashes, etc.
  const normalizedAbsolute = path.normalize(absolutePath);
  const normalizedProject = path.normalize(projectPath);

  // Try to extract relative path from known app directories
  const appPatterns = [
    '/apps/restaurant/',
    '/apps/retail/',
    '\\apps\\restaurant\\',  // Windows
    '\\apps\\retail\\',
  ];

  for (const pattern of appPatterns) {
    const idx = normalizedAbsolute.indexOf(pattern);
    if (idx !== -1) {
      return normalizedAbsolute.slice(idx + pattern.length);
    }
  }

  // Fallback: try to make relative to project path
  if (normalizedAbsolute.startsWith(normalizedProject)) {
    return normalizedAbsolute.slice(normalizedProject.length).replace(/^[/\\]/, '');
  }

  // Last resort: return the path as-is (should be investigated)
  return absolutePath;
}

/**
 * Extract the app name from an absolute path.
 *
 * @param absolutePath - The absolute path
 * @returns 'restaurant' | 'retail' | null
 */
export function getAppFromPath(absolutePath: string): 'restaurant' | 'retail' | null {
  if (absolutePath.includes('/apps/restaurant/') || absolutePath.includes('\\apps\\restaurant\\')) {
    return 'restaurant';
  }
  if (absolutePath.includes('/apps/retail/') || absolutePath.includes('\\apps\\retail\\')) {
    return 'retail';
  }
  return null;
}

/**
 * Check if two paths refer to the same file (handles different normalizations).
 *
 * @param path1 - First path (can be absolute or relative)
 * @param path2 - Second path (can be absolute or relative)
 * @param projectPath - Optional project root for normalization
 * @returns true if paths refer to the same file
 */
export function pathsMatch(path1: string, path2: string, projectPath?: string): boolean {
  // Direct match
  if (path1 === path2) return true;

  // Normalize and compare
  const norm1 = path.normalize(path1);
  const norm2 = path.normalize(path2);
  if (norm1 === norm2) return true;

  // If project path provided, normalize both and compare
  if (projectPath) {
    const rel1 = normalizePath(path1, projectPath);
    const rel2 = normalizePath(path2, projectPath);
    if (rel1 === rel2) return true;
  }

  // Check if one ends with the other (handles absolute vs relative)
  const shorter = path1.length < path2.length ? path1 : path2;
  const longer = path1.length < path2.length ? path2 : path1;

  // Must match from a path separator
  if (longer.endsWith('/' + shorter) || longer.endsWith('\\' + shorter)) {
    return true;
  }

  return false;
}

/**
 * Get canonical key for a file path (for use in Maps/Sets).
 * This ensures the same file always gets the same key regardless of how the path was constructed.
 *
 * @param absolutePath - The absolute path
 * @param projectPath - The project root
 * @returns Canonical key string
 */
export function getPathKey(absolutePath: string, projectPath: string): string {
  const relativePath = normalizePath(absolutePath, projectPath);
  // Normalize separators to forward slashes for consistency
  return relativePath.replace(/\\/g, '/');
}

/**
 * Check if a file is a barrel file (index.ts that re-exports).
 *
 * @param filePath - The file path to check
 * @returns true if the file is named index.ts/index.js
 */
export function isBarrelFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return basename === 'index.ts' || basename === 'index.js' || basename === 'index.tsx';
}
