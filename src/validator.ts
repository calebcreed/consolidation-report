import { execSync } from 'child_process';
import * as path from 'path';

export interface ValidationResult {
  findCount: number;
  parserCount: number;
  difference: number;
  missingFiles: string[];
  extraFiles: string[];
  sampleMissing: string[];
  sampleExtra: string[];
}

export class Validator {
  /**
   * Use shell `find` to get all files matching extensions in a directory
   */
  findFilesViaShell(dirPath: string, extensions: string[]): string[] {
    const extPatterns = extensions.map(ext => `-name "*${ext}"`).join(' -o ');
    const cmd = `find "${dirPath}" -type f \\( ${extPatterns} \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" 2>/dev/null`;

    try {
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      return output.trim().split('\n').filter(line => line.length > 0);
    } catch (err) {
      console.error('Error running find command:', err);
      return [];
    }
  }

  /**
   * Compare files found by parser vs shell find
   */
  validate(
    dirPath: string,
    parsedFiles: string[],
    extensions: string[] = ['.ts', '.tsx', '.scss', '.html']
  ): ValidationResult {
    const shellFiles = this.findFilesViaShell(dirPath, extensions);

    // Normalize paths for comparison
    const shellSet = new Set(shellFiles.map(f => path.resolve(f)));
    const parsedSet = new Set(parsedFiles.map(f => path.resolve(f)));

    // Find differences
    const missingFiles: string[] = [];
    const extraFiles: string[] = [];

    for (const file of shellSet) {
      if (!parsedSet.has(file)) {
        missingFiles.push(file);
      }
    }

    for (const file of parsedSet) {
      if (!shellSet.has(file)) {
        extraFiles.push(file);
      }
    }

    // Get samples (up to 10 each)
    const sampleMissing = missingFiles.slice(0, 10).map(f => path.relative(dirPath, f));
    const sampleExtra = extraFiles.slice(0, 10).map(f => path.relative(dirPath, f));

    return {
      findCount: shellFiles.length,
      parserCount: parsedFiles.length,
      difference: shellFiles.length - parsedFiles.length,
      missingFiles,
      extraFiles,
      sampleMissing,
      sampleExtra,
    };
  }

  /**
   * Print validation report
   */
  printReport(label: string, result: ValidationResult): void {
    console.log(`\n${label}`);
    console.log('='.repeat(label.length));
    console.log(`  Shell find count:  ${result.findCount}`);
    console.log(`  Parser count:      ${result.parserCount}`);
    console.log(`  Difference:        ${result.difference > 0 ? '+' : ''}${result.difference}`);

    if (result.difference === 0) {
      console.log('  Status:            MATCH');
    } else {
      console.log(`  Status:            MISMATCH`);

      if (result.sampleMissing.length > 0) {
        console.log(`\n  Missing from parser (${result.missingFiles.length} total, showing ${result.sampleMissing.length}):`);
        for (const file of result.sampleMissing) {
          console.log(`    - ${file}`);
        }
      }

      if (result.sampleExtra.length > 0) {
        console.log(`\n  Extra in parser (${result.extraFiles.length} total, showing ${result.sampleExtra.length}):`);
        for (const file of result.sampleExtra) {
          console.log(`    - ${file}`);
        }
      }
    }
  }

  /**
   * Categorize missing files by pattern
   */
  analyzeMissingPatterns(missingFiles: string[], basePath: string): Record<string, number> {
    const patterns: Record<string, number> = {};

    for (const file of missingFiles) {
      const rel = path.relative(basePath, file);

      // Check various patterns
      if (rel.includes('.spec.')) {
        patterns['*.spec.*'] = (patterns['*.spec.*'] || 0) + 1;
      } else if (rel.includes('.test.')) {
        patterns['*.test.*'] = (patterns['*.test.*'] || 0) + 1;
      } else if (rel.includes('__tests__')) {
        patterns['__tests__/*'] = (patterns['__tests__/*'] || 0) + 1;
      } else if (rel.includes('.d.ts')) {
        patterns['*.d.ts'] = (patterns['*.d.ts'] || 0) + 1;
      } else if (rel.endsWith('.scss')) {
        patterns['*.scss'] = (patterns['*.scss'] || 0) + 1;
      } else if (rel.endsWith('.html')) {
        patterns['*.html'] = (patterns['*.html'] || 0) + 1;
      } else if (rel.endsWith('.tsx')) {
        patterns['*.tsx'] = (patterns['*.tsx'] || 0) + 1;
      } else if (rel.includes('/e2e/')) {
        patterns['e2e/*'] = (patterns['e2e/*'] || 0) + 1;
      } else if (rel.includes('/test/') || rel.includes('/tests/')) {
        patterns['test(s)/*'] = (patterns['test(s)/*'] || 0) + 1;
      } else {
        const ext = path.extname(file);
        patterns[`other ${ext}`] = (patterns[`other ${ext}`] || 0) + 1;
      }
    }

    return patterns;
  }
}
