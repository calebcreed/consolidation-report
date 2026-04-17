/**
 * Semantic Comparator Tests
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SemanticComparator } from '../diff/comparator';
import { ASTNormalizer } from '../diff/normalizer';

describe('SemanticComparator', () => {
  let comparator: SemanticComparator;
  let tempDir: string;

  beforeAll(() => {
    comparator = new SemanticComparator();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-test-'));
  });

  afterAll(() => {
    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTempFile(name: string, content: string): string {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  describe('D1: Identical files', () => {
    it('should return identical for same content', () => {
      const content = `
        import { Component } from '@angular/core';

        @Component({ selector: 'app-test' })
        export class TestComponent {
          doSomething() {
            return 42;
          }
        }
      `;

      const fileA = createTempFile('d1-a.ts', content);
      const fileB = createTempFile('d1-b.ts', content);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('identical');
    });
  });

  describe('D2: Different content', () => {
    it('should return dirty for different implementations', () => {
      const contentA = `
        export function calculate(x: number) {
          return x * 2;
        }
      `;

      const contentB = `
        export function calculate(x: number) {
          return x * 3;  // Different!
        }
      `;

      const fileA = createTempFile('d2-a.ts', contentA);
      const fileB = createTempFile('d2-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('dirty');
    });
  });

  describe('D3: Retail-only file', () => {
    it('should return dirty when file only exists in one branch', () => {
      const content = `
        export function retailOnlyFeature() {
          return 'only in retail';
        }
      `;

      const fileA = createTempFile('d3-retail.ts', content);
      const nonExistentFile = path.join(tempDir, 'd3-restaurant-nonexistent.ts');

      // When comparing existing file to non-existent file
      const result = comparator.compare(fileA, nonExistentFile);
      expect(result.status).toBe('dirty');
      if (result.status === 'dirty') {
        expect(result.changes.some(c => c.type === 'added')).toBe(true);
      }
    });
  });

  describe('D4: Restaurant-only file', () => {
    it('should return dirty when file only exists in one branch', () => {
      const content = `
        export function restaurantOnlyFeature() {
          return 'only in restaurant';
        }
      `;

      const fileB = createTempFile('d4-restaurant.ts', content);
      const nonExistentFile = path.join(tempDir, 'd4-retail-nonexistent.ts');

      // When comparing non-existent file to existing file
      const result = comparator.compare(nonExistentFile, fileB);
      expect(result.status).toBe('dirty');
      if (result.status === 'dirty') {
        expect(result.changes.some(c => c.type === 'removed')).toBe(true);
      }
    });
  });

  describe('D5: Moved file', () => {
    it('should detect file moved to different directory', () => {
      const content = `
        export function movedFunction(): string {
          return 'I am in different locations';
        }
        export const MOVED_CONSTANT = 42;
      `;

      // Create file in original location
      const originalFile = createTempFile('d5-moved-file.ts', content);

      // Create same file in subfolder
      const subfolderPath = path.join(tempDir, 'subfolder');
      fs.mkdirSync(subfolderPath, { recursive: true });
      const movedFile = path.join(subfolderPath, 'd5-moved-file.ts');
      fs.writeFileSync(movedFile, content);

      // findMatch should detect the move
      const match = comparator.findMatch(originalFile, [movedFile]);

      expect(match).not.toBeNull();
      expect(match!.confidence).toBeGreaterThan(0.8);
      expect(match!.structuralChange.kind).toBe('moved');
    });
  });

  describe('D6: Renamed file', () => {
    it('should detect file renamed within same directory', () => {
      const content = `
        export function someFunction(): string {
          return 'same content, different name';
        }
        export const SOME_CONSTANT = 123;
      `;

      const originalFile = createTempFile('d6-original-name.ts', content);
      const renamedFile = createTempFile('d6-new-name.ts', content);

      // findMatch should detect the rename
      const match = comparator.findMatch(originalFile, [renamedFile]);

      expect(match).not.toBeNull();
      expect(match!.confidence).toBeGreaterThan(0.8);
      expect(match!.structuralChange.kind).toBe('renamed');
    });
  });

  describe('D7: Moved folder', () => {
    it('should detect file moved with its folder', () => {
      const contentA = `
        export function fileAFunction() { return 'A'; }
      `;
      const contentB = `
        export function fileBFunction() { return 'B'; }
      `;

      // Create original folder structure
      const originalFolder = path.join(tempDir, 'd7-folder-original');
      fs.mkdirSync(originalFolder, { recursive: true });
      const origFileA = path.join(originalFolder, 'file-a.ts');
      const origFileB = path.join(originalFolder, 'file-b.ts');
      fs.writeFileSync(origFileA, contentA);
      fs.writeFileSync(origFileB, contentB);

      // Create moved folder structure
      const movedFolder = path.join(tempDir, 'moved', 'd7-folder-renamed');
      fs.mkdirSync(movedFolder, { recursive: true });
      const movedFileA = path.join(movedFolder, 'file-a.ts');
      const movedFileB = path.join(movedFolder, 'file-b.ts');
      fs.writeFileSync(movedFileA, contentA);
      fs.writeFileSync(movedFileB, contentB);

      // findMatch should detect folder-moved
      const matchA = comparator.findMatch(origFileA, [movedFileA]);

      expect(matchA).not.toBeNull();
      expect(matchA!.confidence).toBeGreaterThan(0.8);
      // folder-moved when both directory and parent differ
      expect(['moved', 'folder-moved']).toContain(matchA!.structuralChange.kind);
    });
  });

  describe('D8: Split file', () => {
    it('should detect file split into multiple files', () => {
      const originalContent = `
        export const PART_ONE = 'part one data';
        export function partOneFunction() { return 'part one'; }

        export const PART_TWO = 'part two data';
        export function partTwoFunction() { return 'part two'; }
      `;

      const part1Content = `
        export const PART_ONE = 'part one data';
        export function partOneFunction() { return 'part one'; }
      `;

      const part2Content = `
        export const PART_TWO = 'part two data';
        export function partTwoFunction() { return 'part two'; }
      `;

      const originalFile = createTempFile('d8-before-split.ts', originalContent);
      const part1File = createTempFile('d8-split-part1.ts', part1Content);
      const part2File = createTempFile('d8-split-part2.ts', part2Content);

      // detectSplit should identify the split
      const splitMatch = comparator.detectSplit(originalFile, [part1File, part2File]);

      expect(splitMatch).not.toBeNull();
      expect(splitMatch!.structuralChange.kind).toBe('split');
      expect(splitMatch!.structuralChange.parts).toContain(part1File);
      expect(splitMatch!.structuralChange.parts).toContain(part2File);
    });
  });

  describe('D9: Merged files', () => {
    it('should detect multiple files merged into one', () => {
      const source1Content = `
        export const SOURCE_ONE = 'source one';
        export function sourceOneFunction() { return 'from source one'; }
      `;

      const source2Content = `
        export const SOURCE_TWO = 'source two';
        export function sourceTwoFunction() { return 'from source two'; }
      `;

      const mergedContent = `
        export const SOURCE_ONE = 'source one';
        export function sourceOneFunction() { return 'from source one'; }

        export const SOURCE_TWO = 'source two';
        export function sourceTwoFunction() { return 'from source two'; }
      `;

      const source1File = createTempFile('d9-merge-source1.ts', source1Content);
      const source2File = createTempFile('d9-merge-source2.ts', source2Content);
      const mergedFile = createTempFile('d9-merged.ts', mergedContent);

      // detectMerge should identify the merge
      const mergeMatch = comparator.detectMerge(mergedFile, [source1File, source2File]);

      expect(mergeMatch).not.toBeNull();
      expect(mergeMatch!.structuralChange.kind).toBe('merged');
      expect(mergeMatch!.structuralChange.sources).toContain(source1File);
      expect(mergeMatch!.structuralChange.sources).toContain(source2File);
    });
  });

  describe('D10: Whitespace only', () => {
    it('should return clean for whitespace differences', () => {
      const contentA = `export function foo(){return 1;}`;

      const contentB = `
        export function foo() {
          return 1;
        }
      `;

      const fileA = createTempFile('d10-a.ts', contentA);
      const fileB = createTempFile('d10-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('clean');
      if (result.status === 'clean') {
        expect(result.reason).toBe('whitespace-only');
      }
    });
  });

  describe('D11: Comments only', () => {
    it('should return clean for comment differences', () => {
      const contentA = `
        // Old comment
        export function foo() {
          return 1;
        }
      `;

      const contentB = `
        // New comment - completely different
        /* Also a block comment */
        export function foo() {
          return 1;
        }
      `;

      const fileA = createTempFile('d11-a.ts', contentA);
      const fileB = createTempFile('d11-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('clean');
      if (result.status === 'clean') {
        expect(result.reason).toBe('comments-only');
      }
    });
  });

  describe('D12: Import order only', () => {
    it('should return clean for import order differences', () => {
      const contentA = `
        import { A } from './a';
        import { B } from './b';
        import { C } from './c';

        export const result = A + B + C;
      `;

      const contentB = `
        import { C } from './c';
        import { A } from './a';
        import { B } from './b';

        export const result = A + B + C;
      `;

      const fileA = createTempFile('d12-a.ts', contentA);
      const fileB = createTempFile('d12-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('clean');
      if (result.status === 'clean') {
        expect(result.reason).toBe('import-order-only');
      }
    });
  });

  describe('D13: Variable rename', () => {
    it('should return dirty for variable renames', () => {
      const contentA = `
        export function process(items: string[]) {
          const result = items.map(item => item.toUpperCase());
          return result;
        }
      `;

      const contentB = `
        export function process(items: string[]) {
          const output = items.map(item => item.toUpperCase());
          return output;
        }
      `;

      const fileA = createTempFile('d13-a.ts', contentA);
      const fileB = createTempFile('d13-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('dirty');
    });
  });

  describe('D14: Added feature', () => {
    it('should return dirty for added exports', () => {
      const contentA = `
        export function foo() { return 1; }
      `;

      const contentB = `
        export function foo() { return 1; }
        export function bar() { return 2; }
      `;

      const fileA = createTempFile('d14-a.ts', contentA);
      const fileB = createTempFile('d14-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('dirty');
      if (result.status === 'dirty') {
        const addedChanges = result.changes.filter(c => c.type === 'added');
        expect(addedChanges.length).toBeGreaterThan(0);
      }
    });
  });

  describe('D15: Removed feature', () => {
    it('should return dirty for removed exports', () => {
      const contentA = `
        export function foo() { return 1; }
        export function bar() { return 2; }
      `;

      const contentB = `
        export function foo() { return 1; }
      `;

      const fileA = createTempFile('d15-a.ts', contentA);
      const fileB = createTempFile('d15-b.ts', contentB);

      const result = comparator.compare(fileA, fileB);
      expect(result.status).toBe('dirty');
      if (result.status === 'dirty') {
        const removedChanges = result.changes.filter(c => c.type === 'removed');
        expect(removedChanges.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('ASTNormalizer', () => {
  let normalizer: ASTNormalizer;
  let tempDir: string;

  beforeAll(() => {
    normalizer = new ASTNormalizer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'normalizer-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTempFile(name: string, content: string): string {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  it('should produce identical hashes for identical content', () => {
    const content = `export const x = 1;`;

    const fileA = createTempFile('hash-a.ts', content);
    const fileB = createTempFile('hash-b.ts', content);

    const normA = normalizer.normalize(fileA);
    const normB = normalizer.normalize(fileB);

    expect(normA.hash).toBe(normB.hash);
  });

  it('should produce identical hashes ignoring whitespace', () => {
    const contentA = `export const x=1;`;
    const contentB = `export const x = 1;`;

    const fileA = createTempFile('ws-a.ts', contentA);
    const fileB = createTempFile('ws-b.ts', contentB);

    expect(normalizer.areIdentical(fileA, fileB)).toBe(true);
  });

  it('should extract exported names', () => {
    const content = `
      export const FOO = 1;
      export function bar() {}
      export class Baz {}
    `;

    const file = createTempFile('exports.ts', content);
    const normalized = normalizer.normalize(file);

    expect(normalized.exportedNames).toContain('FOO');
    expect(normalized.exportedNames).toContain('bar');
    expect(normalized.exportedNames).toContain('Baz');
  });

  it('should extract function names', () => {
    const content = `
      export function foo() {}
      function bar() {}
    `;

    const file = createTempFile('functions.ts', content);
    const normalized = normalizer.normalize(file);

    expect(normalized.functionNames).toContain('foo');
    expect(normalized.functionNames).toContain('bar');
  });

  it('should extract class names', () => {
    const content = `
      export class Foo {}
      class Bar {}
    `;

    const file = createTempFile('classes.ts', content);
    const normalized = normalizer.normalize(file);

    expect(normalized.classNames).toContain('Foo');
    expect(normalized.classNames).toContain('Bar');
  });
});
