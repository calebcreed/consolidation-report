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
exports.Validator = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
class Validator {
    /**
     * Use shell `find` to get all files matching extensions in a directory
     */
    findFilesViaShell(dirPath, extensions) {
        const extPatterns = extensions.map(ext => `-name "*${ext}"`).join(' -o ');
        const cmd = `find "${dirPath}" -type f \\( ${extPatterns} \\) ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" 2>/dev/null`;
        try {
            const output = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
            return output.trim().split('\n').filter(line => line.length > 0);
        }
        catch (err) {
            console.error('Error running find command:', err);
            return [];
        }
    }
    /**
     * Compare files found by parser vs shell find
     */
    validate(dirPath, parsedFiles, extensions = ['.ts', '.tsx', '.scss', '.html']) {
        const shellFiles = this.findFilesViaShell(dirPath, extensions);
        // Normalize paths for comparison
        const shellSet = new Set(shellFiles.map(f => path.resolve(f)));
        const parsedSet = new Set(parsedFiles.map(f => path.resolve(f)));
        // Find differences
        const missingFiles = [];
        const extraFiles = [];
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
    printReport(label, result) {
        console.log(`\n${label}`);
        console.log('='.repeat(label.length));
        console.log(`  Shell find count:  ${result.findCount}`);
        console.log(`  Parser count:      ${result.parserCount}`);
        console.log(`  Difference:        ${result.difference > 0 ? '+' : ''}${result.difference}`);
        if (result.difference === 0) {
            console.log('  Status:            MATCH');
        }
        else {
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
    analyzeMissingPatterns(missingFiles, basePath) {
        const patterns = {};
        for (const file of missingFiles) {
            const rel = path.relative(basePath, file);
            // Check various patterns
            if (rel.includes('.spec.')) {
                patterns['*.spec.*'] = (patterns['*.spec.*'] || 0) + 1;
            }
            else if (rel.includes('.test.')) {
                patterns['*.test.*'] = (patterns['*.test.*'] || 0) + 1;
            }
            else if (rel.includes('__tests__')) {
                patterns['__tests__/*'] = (patterns['__tests__/*'] || 0) + 1;
            }
            else if (rel.includes('.d.ts')) {
                patterns['*.d.ts'] = (patterns['*.d.ts'] || 0) + 1;
            }
            else if (rel.endsWith('.scss')) {
                patterns['*.scss'] = (patterns['*.scss'] || 0) + 1;
            }
            else if (rel.endsWith('.html')) {
                patterns['*.html'] = (patterns['*.html'] || 0) + 1;
            }
            else if (rel.endsWith('.tsx')) {
                patterns['*.tsx'] = (patterns['*.tsx'] || 0) + 1;
            }
            else if (rel.includes('/e2e/')) {
                patterns['e2e/*'] = (patterns['e2e/*'] || 0) + 1;
            }
            else if (rel.includes('/test/') || rel.includes('/tests/')) {
                patterns['test(s)/*'] = (patterns['test(s)/*'] || 0) + 1;
            }
            else {
                const ext = path.extname(file);
                patterns[`other ${ext}`] = (patterns[`other ${ext}`] || 0) + 1;
            }
        }
        return patterns;
    }
}
exports.Validator = Validator;
