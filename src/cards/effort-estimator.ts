/**
 * Effort Estimator - Calculate effort estimates for work cards
 */

import { CardFile, EffortEstimate, ComplexityFactors } from './types';

/**
 * Size thresholds based on file count and lines changed
 */
const SIZE_THRESHOLDS = {
  XS: { maxFiles: 2, maxLines: 50 },
  S: { maxFiles: 5, maxLines: 150 },
  M: { maxFiles: 10, maxLines: 400 },
  L: { maxFiles: 15, maxLines: 800 },
  // XL is anything above L
};

/**
 * Estimate effort for a set of files
 */
export function estimateEffort(files: CardFile[]): EffortEstimate {
  const fileCount = files.length;
  const totalLinesChanged = files.reduce((sum, f) => sum + (f.linesChanged || 0), 0);
  const complexity = detectComplexity(files);
  const size = getSizeLabel(fileCount, totalLinesChanged);

  return {
    fileCount,
    totalLinesChanged,
    size,
    complexity,
  };
}

/**
 * Get T-shirt size label based on metrics
 */
export function getSizeLabel(
  fileCount: number,
  linesChanged: number
): 'XS' | 'S' | 'M' | 'L' | 'XL' {
  // Use the larger of the two signals
  if (fileCount <= SIZE_THRESHOLDS.XS.maxFiles && linesChanged <= SIZE_THRESHOLDS.XS.maxLines) {
    return 'XS';
  }
  if (fileCount <= SIZE_THRESHOLDS.S.maxFiles && linesChanged <= SIZE_THRESHOLDS.S.maxLines) {
    return 'S';
  }
  if (fileCount <= SIZE_THRESHOLDS.M.maxFiles && linesChanged <= SIZE_THRESHOLDS.M.maxLines) {
    return 'M';
  }
  if (fileCount <= SIZE_THRESHOLDS.L.maxFiles && linesChanged <= SIZE_THRESHOLDS.L.maxLines) {
    return 'L';
  }
  return 'XL';
}

/**
 * Detect complexity factors from files
 */
export function detectComplexity(files: CardFile[]): ComplexityFactors {
  const hasExternalDeps = files.some(f => f.externalDeps.length > 0);
  const hasCyclicDeps = detectCyclicDeps(files);
  const hasTemplateChanges = files.some(f =>
    f.relativePath.includes('.component.') ||
    f.relativePath.endsWith('.html')
  );
  const hasServiceChanges = files.some(f =>
    f.relativePath.includes('.service.')
  );
  const hasModuleChanges = files.some(f =>
    f.relativePath.includes('.module.')
  );

  return {
    hasExternalDeps,
    hasCyclicDeps,
    hasTemplateChanges,
    hasServiceChanges,
    hasModuleChanges,
  };
}

/**
 * Detect if there are cyclic dependencies within the file set
 */
function detectCyclicDeps(files: CardFile[]): boolean {
  const fileSet = new Set(files.map(f => f.relativePath));

  for (const file of files) {
    for (const dep of file.internalDeps) {
      // Check if any internal dep also depends on this file
      const depFile = files.find(f => f.relativePath === dep);
      if (depFile && depFile.internalDeps.includes(file.relativePath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get effort description string
 */
export function getEffortDescription(effort: EffortEstimate): string {
  const parts = [`${effort.size}`];

  if (effort.fileCount > 0) {
    parts.push(`${effort.fileCount} file${effort.fileCount > 1 ? 's' : ''}`);
  }

  if (effort.totalLinesChanged > 0) {
    parts.push(`~${effort.totalLinesChanged} lines`);
  }

  return parts.join(', ');
}
