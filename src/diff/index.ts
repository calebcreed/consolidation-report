import { execSync } from 'child_process';
import * as path from 'path';
import * as Diff from 'diff';
import { DivergenceInfo, DivergenceType } from '../config';

export interface ThreeWayDiffResult {
  baseContent: string | null;
  retailContent: string | null;
  restaurantContent: string | null;
  divergence: DivergenceInfo;
}

export class GitDiffer {
  private repoRoot: string;
  private baseCommit: string | null;

  constructor(repoRoot: string, baseCommit: string | null) {
    this.repoRoot = repoRoot;
    this.baseCommit = baseCommit;
  }

  getFileAtCommit(filePath: string, commit: string): string | null {
    const relativePath = path.relative(this.repoRoot, filePath);

    try {
      const result = execSync(
        `git show ${commit}:"${relativePath}"`,
        {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      return result;
    } catch {
      return null;
    }
  }

  getCurrentContent(filePath: string): string | null {
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  getLastCommitInfo(filePath: string): { hash: string; date: string; author: string } | undefined {
    const relativePath = path.relative(this.repoRoot, filePath);

    try {
      const result = execSync(
        `git log -1 --format="%H|%aI|%an" -- "${relativePath}"`,
        {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();

      if (!result) return undefined;

      const [hash, date, author] = result.split('|');
      return { hash, date, author };
    } catch {
      return undefined;
    }
  }

  computeThreeWayDiff(
    retailPath: string | null,
    restaurantPath: string | null,
    baseRetailPath?: string,
    baseRestaurantPath?: string
  ): ThreeWayDiffResult {
    // Get base content (only if baseCommit is provided)
    let baseContent: string | null = null;
    if (this.baseCommit) {
      if (baseRetailPath) {
        baseContent = this.getFileAtCommit(baseRetailPath, this.baseCommit);
      }
      if (!baseContent && baseRestaurantPath) {
        baseContent = this.getFileAtCommit(baseRestaurantPath, this.baseCommit);
      }
      // Try current paths if base paths don't work
      if (!baseContent && retailPath) {
        baseContent = this.getFileAtCommit(retailPath, this.baseCommit);
      }
      if (!baseContent && restaurantPath) {
        baseContent = this.getFileAtCommit(restaurantPath, this.baseCommit);
      }
    }

    const retailContent = retailPath ? this.getCurrentContent(retailPath) : null;
    const restaurantContent = restaurantPath ? this.getCurrentContent(restaurantPath) : null;

    const divergence = this.analyzeDivergence(baseContent, retailContent, restaurantContent);

    // Get last commit info
    if (retailPath) {
      divergence.lastRetailCommit = this.getLastCommitInfo(retailPath);
    }
    if (restaurantPath) {
      divergence.lastRestaurantCommit = this.getLastCommitInfo(restaurantPath);
    }

    return {
      baseContent,
      retailContent,
      restaurantContent,
      divergence,
    };
  }

  private analyzeDivergence(
    base: string | null,
    retail: string | null,
    restaurant: string | null
  ): DivergenceInfo {
    const result: DivergenceInfo = {
      type: 'CLEAN',
      retailChanges: { additions: 0, deletions: 0 },
      restaurantChanges: { additions: 0, deletions: 0 },
      conflictRegions: [],
      autoMergeable: true,
    };

    // Normalize content for comparison
    const normalizedBase = this.normalizeContent(base);
    const normalizedRetail = this.normalizeContent(retail);
    const normalizedRestaurant = this.normalizeContent(restaurant);

    // No base means file was added after split OR two-way diff mode
    if (!normalizedBase) {
      if (normalizedRetail && normalizedRestaurant) {
        if (normalizedRetail === normalizedRestaurant) {
          result.type = 'CLEAN'; // Identical in both branches
        } else {
          result.type = 'CONFLICT';
          result.autoMergeable = false;
          // In two-way mode, show the diff between retail and restaurant
          result.retailChanges = this.countChanges(normalizedRestaurant, normalizedRetail);
          result.restaurantChanges = this.countChanges(normalizedRetail, normalizedRestaurant);
          result.conflictRegions = this.findConflictRegions(normalizedRetail, normalizedRestaurant, normalizedRetail);
        }
      } else if (normalizedRetail) {
        result.type = 'RETAIL_ONLY';
        result.retailChanges = this.countChanges('', normalizedRetail);
      } else if (normalizedRestaurant) {
        result.type = 'RESTAURANT_ONLY';
        result.restaurantChanges = this.countChanges('', normalizedRestaurant);
      }
      return result;
    }

    // Compare with base
    const retailSameAsBase = normalizedRetail === normalizedBase;
    const restaurantSameAsBase = normalizedRestaurant === normalizedBase;
    const retailSameAsRestaurant = normalizedRetail === normalizedRestaurant;

    if (retailSameAsBase && restaurantSameAsBase) {
      result.type = 'CLEAN';
    } else if (retailSameAsRestaurant) {
      // Both changed but to the same thing
      result.type = 'SAME_CHANGE';
      result.retailChanges = this.countChanges(normalizedBase, normalizedRetail || '');
      result.restaurantChanges = result.retailChanges;
    } else if (retailSameAsBase && !restaurantSameAsBase) {
      result.type = 'RESTAURANT_ONLY';
      result.restaurantChanges = this.countChanges(normalizedBase, normalizedRestaurant || '');
    } else if (!retailSameAsBase && restaurantSameAsBase) {
      result.type = 'RETAIL_ONLY';
      result.retailChanges = this.countChanges(normalizedBase, normalizedRetail || '');
    } else {
      // Both changed differently
      result.type = 'CONFLICT';
      result.retailChanges = this.countChanges(normalizedBase, normalizedRetail || '');
      result.restaurantChanges = this.countChanges(normalizedBase, normalizedRestaurant || '');
      result.conflictRegions = this.findConflictRegions(normalizedBase, normalizedRetail || '', normalizedRestaurant || '');
      result.autoMergeable = result.conflictRegions.length === 0;
    }

    return result;
  }

  private normalizeContent(content: string | null): string {
    if (!content) return '';
    // Normalize line endings and trim
    return content.replace(/\r\n/g, '\n').trim();
  }

  private countChanges(before: string, after: string): { additions: number; deletions: number } {
    const diff = Diff.diffLines(before, after);
    let additions = 0;
    let deletions = 0;

    for (const part of diff) {
      const lines = part.value.split('\n').filter(l => l.length > 0).length;
      if (part.added) {
        additions += lines;
      } else if (part.removed) {
        deletions += lines;
      }
    }

    return { additions, deletions };
  }

  private findConflictRegions(
    base: string,
    retail: string,
    restaurant: string
  ): Array<{ startLine: number; endLine: number }> {
    const regions: Array<{ startLine: number; endLine: number }> = [];

    const baseLines = base.split('\n');
    const retailDiff = Diff.diffArrays(baseLines, retail.split('\n'));
    const restaurantDiff = Diff.diffArrays(baseLines, restaurant.split('\n'));

    // Find lines that were changed in both
    const retailChangedLines = new Set<number>();
    const restaurantChangedLines = new Set<number>();

    let lineNum = 0;
    for (const part of retailDiff) {
      if (part.removed) {
        for (let i = 0; i < part.count!; i++) {
          retailChangedLines.add(lineNum + i);
        }
      }
      if (!part.added) {
        lineNum += part.count || 0;
      }
    }

    lineNum = 0;
    for (const part of restaurantDiff) {
      if (part.removed) {
        for (let i = 0; i < part.count!; i++) {
          restaurantChangedLines.add(lineNum + i);
        }
      }
      if (!part.added) {
        lineNum += part.count || 0;
      }
    }

    // Find overlapping changed regions
    let currentRegionStart: number | null = null;
    let currentRegionEnd: number | null = null;

    for (let i = 0; i < baseLines.length; i++) {
      const isConflict = retailChangedLines.has(i) && restaurantChangedLines.has(i);

      if (isConflict) {
        if (currentRegionStart === null) {
          currentRegionStart = i;
        }
        currentRegionEnd = i;
      } else if (currentRegionStart !== null) {
        regions.push({ startLine: currentRegionStart + 1, endLine: currentRegionEnd! + 1 });
        currentRegionStart = null;
        currentRegionEnd = null;
      }
    }

    if (currentRegionStart !== null) {
      regions.push({ startLine: currentRegionStart + 1, endLine: currentRegionEnd! + 1 });
    }

    return regions;
  }

  generateUnifiedDiff(
    base: string | null,
    retail: string | null,
    restaurant: string | null,
    filename: string
  ): { retailDiff: string; restaurantDiff: string } {
    const baseContent = base || '';

    const retailDiff = Diff.createTwoFilesPatch(
      `base/${filename}`,
      `retail/${filename}`,
      baseContent,
      retail || '',
      'base',
      'retail'
    );

    const restaurantDiff = Diff.createTwoFilesPatch(
      `base/${filename}`,
      `restaurant/${filename}`,
      baseContent,
      restaurant || '',
      'base',
      'restaurant'
    );

    return { retailDiff, restaurantDiff };
  }
}
