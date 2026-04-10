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
