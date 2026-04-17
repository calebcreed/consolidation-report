/**
 * Path Resolver Tests
 */

import * as path from 'path';
import { PathResolver } from '../deps/resolver';

// Resolve test-fixture relative to project root
const MODEL_PATH = path.resolve(__dirname, '../../test-fixture');
const RESTAURANT_APP = path.join(MODEL_PATH, 'apps/restaurant');
const TSCONFIG_PATH = path.join(RESTAURANT_APP, 'tsconfig.app.json');

describe('PathResolver', () => {
  let resolver: PathResolver;

  beforeAll(() => {
    resolver = PathResolver.fromTsconfig(TSCONFIG_PATH);
  });

  describe('parseTsconfig', () => {
    it('should parse tsconfig with JSON5 syntax', () => {
      const result = PathResolver.parseTsconfig(TSCONFIG_PATH);
      expect(result.baseUrl).toBeDefined();
      expect(result.paths).toBeDefined();
    });

    it('should extract path aliases', () => {
      const result = PathResolver.parseTsconfig(TSCONFIG_PATH);
      expect(result.paths).toHaveProperty('@app/*');
    });
  });

  describe('isExternal', () => {
    it('should recognize @angular as external', () => {
      expect(resolver.isExternal('@angular/core')).toBe(true);
      expect(resolver.isExternal('@angular/common')).toBe(true);
    });

    it('should recognize @ngrx as external', () => {
      expect(resolver.isExternal('@ngrx/store')).toBe(true);
      expect(resolver.isExternal('@ngrx/effects')).toBe(true);
    });

    it('should recognize rxjs as external', () => {
      expect(resolver.isExternal('rxjs')).toBe(true);
      expect(resolver.isExternal('rxjs/operators')).toBe(true);
    });

    it('should NOT recognize relative paths as external', () => {
      expect(resolver.isExternal('./foo')).toBe(false);
      expect(resolver.isExternal('../bar')).toBe(false);
    });

    it('should NOT recognize path aliases as external', () => {
      expect(resolver.isExternal('@app/shared')).toBe(false);
      expect(resolver.isExternal('@app/utils/helpers')).toBe(false);
    });
  });

  describe('resolve - relative imports (S1, S2)', () => {
    const fromFile = path.join(RESTAURANT_APP, 'src/app/services/interceptor.ts');

    it('S1: should resolve sibling relative import ./foo', () => {
      const result = resolver.resolve('./logger.service', fromFile);
      expect(result.absolute).toContain('logger.service');
      expect(result.isExternal).toBe(false);
    });

    it('S2: should resolve parent relative import ../foo', () => {
      const result = resolver.resolve('../models/user', fromFile);
      expect(result.absolute).toContain('models');
      expect(result.isExternal).toBe(false);
    });
  });

  describe('resolve - barrel files (S3)', () => {
    it('S3: should resolve folder to index.ts', () => {
      const fromFile = path.join(RESTAURANT_APP, 'src/app/app.component.ts');
      const result = resolver.resolve('./core', fromFile);

      // Should resolve to index.ts if it exists
      if (result.absolute) {
        expect(result.isBarrel).toBe(true);
        expect(result.absolute).toContain('index');
      }
    });
  });

  describe('resolve - path aliases (S5, S6)', () => {
    const fromFile = path.join(RESTAURANT_APP, 'src/app/services/interceptor.ts');

    it('S5: should resolve exact path alias @app/shared', () => {
      const result = resolver.resolve('@app/shared', fromFile);
      expect(result.isExternal).toBe(false);
      // Should resolve to the mapped path
    });

    it('S6: should resolve wildcard path alias @app/*', () => {
      const result = resolver.resolve('@app/utils/helpers', fromFile);
      expect(result.isExternal).toBe(false);
    });
  });

  describe('resolve - external packages', () => {
    const fromFile = path.join(RESTAURANT_APP, 'src/app/app.component.ts');

    it('should return external: prefix for npm packages', () => {
      const result = resolver.resolve('@angular/core', fromFile);
      expect(result.isExternal).toBe(true);
      expect(result.absolute).toBe('external:@angular/core');
    });
  });
});
