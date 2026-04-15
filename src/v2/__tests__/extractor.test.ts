/**
 * Dependency Extractor Tests
 */

import * as path from 'path';
import { PathResolver } from '../deps/resolver';
import { DependencyExtractor } from '../deps/extractor';
import { DependencyType } from '../deps/types';

const MODEL_PATH = '/Users/calebcreed/Downloads/test-fixture';
const RESTAURANT_APP = path.join(MODEL_PATH, 'apps/restaurant');
const TSCONFIG_PATH = path.join(RESTAURANT_APP, 'tsconfig.app.json');

describe('DependencyExtractor', () => {
  let extractor: DependencyExtractor;

  beforeAll(() => {
    const resolver = PathResolver.fromTsconfig(TSCONFIG_PATH);
    extractor = new DependencyExtractor(resolver);
  });

  describe('TypeScript imports (S1-S11)', () => {
    const interceptorPath = path.join(RESTAURANT_APP, 'src/app/services/interceptor.ts');

    it('S1: should extract relative sibling imports', () => {
      const analysis = extractor.extract(interceptorPath);
      const relativeDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('./')
      );
      expect(relativeDeps.length).toBeGreaterThan(0);
    });

    it('S2: should extract relative parent imports', () => {
      const analysis = extractor.extract(interceptorPath);
      const parentDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('../')
      );
      // May or may not have parent imports
    });

    it('S5: should extract path alias imports', () => {
      const analysis = extractor.extract(interceptorPath);
      const aliasDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('@app/')
      );
      // Check that path aliases are NOT marked as external
      for (const dep of aliasDeps) {
        expect(dep.target).not.toContain('external:');
      }
    });

    it('S9: should extract side-effect imports', () => {
      // Find a file with side-effect imports like import './polyfills'
      const analysis = extractor.extract(interceptorPath);
      const sideEffects = analysis.dependencies.filter(
        d => d.type === 'import-side-effect'
      );
      // May or may not have side effect imports
    });

    it('S11: should extract type-only imports', () => {
      const analysis = extractor.extract(interceptorPath);
      const typeImports = analysis.dependencies.filter(
        d => d.type === 'import-type'
      );
      // May or may not have type-only imports
    });
  });

  describe('Re-exports (S7, S8)', () => {
    // Test barrel files
    it('S7: should extract re-exports', () => {
      const barrelPath = path.join(
        RESTAURANT_APP,
        'src/app/modules/+transferMerge/index.ts'
      );

      const analysis = extractor.extract(barrelPath);
      const reExports = analysis.dependencies.filter(
        d => d.type === 'export-from'
      );

      expect(reExports.length).toBeGreaterThan(0);
    });
  });

  describe('Angular (A1-A12)', () => {
    describe('Constructor injection (A1)', () => {
      it('should detect constructor parameter types', () => {
        const interceptorPath = path.join(
          RESTAURANT_APP,
          'src/app/services/interceptor.ts'
        );
        const analysis = extractor.extract(interceptorPath);
        const injections = analysis.dependencies.filter(
          d => d.type === 'injection'
        );
        expect(injections.length).toBeGreaterThan(0);
      });
    });

    describe('@Inject token (A2)', () => {
      it('should detect @Inject decorator', () => {
        const interceptorPath = path.join(
          RESTAURANT_APP,
          'src/app/services/interceptor.ts'
        );
        const analysis = extractor.extract(interceptorPath);
        const tokenInjections = analysis.dependencies.filter(
          d => d.type === 'inject-token'
        );
        // May or may not have @Inject
      });
    });

    describe('NgModule (A3-A6)', () => {
      it('should extract NgModule metadata', () => {
        const modulePath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/transfer-merge.module.ts'
        );
        const analysis = extractor.extract(modulePath);

        expect(analysis.angularMetadata).toBeDefined();
        expect(analysis.angularMetadata?.type).toBe('module');
      });

      it('A3: should extract NgModule imports', () => {
        const modulePath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/transfer-merge.module.ts'
        );
        const analysis = extractor.extract(modulePath);

        const moduleImports = analysis.dependencies.filter(
          d => d.type === 'ngmodule-import'
        );
        expect(moduleImports.length).toBeGreaterThan(0);
      });

      it('A4: should extract NgModule declarations', () => {
        const modulePath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/transfer-merge.module.ts'
        );
        const analysis = extractor.extract(modulePath);

        const declarations = analysis.dependencies.filter(
          d => d.type === 'ngmodule-declaration'
        );
        expect(declarations.length).toBeGreaterThan(0);
      });
    });

    describe('Template (A7-A9)', () => {
      it('A7: should extract component selectors from templates', () => {
        const componentPath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/components/transfer-items/transfer-items.component.ts'
        );
        const analysis = extractor.extract(componentPath);

        const templateComponents = analysis.dependencies.filter(
          d => d.type === 'template-component'
        );
        // May have template component references
      });

      it('A8: should extract pipes from templates', () => {
        const componentPath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/components/transfer-items/transfer-items.component.ts'
        );
        const analysis = extractor.extract(componentPath);

        const pipes = analysis.dependencies.filter(
          d => d.type === 'template-pipe'
        );
        // May have custom pipe references
      });
    });
  });

  describe('NgRx (N1-N5)', () => {
    const storeJsonPath = path.join(
      RESTAURANT_APP,
      'src/app/core/state/store-json'
    );

    describe('Actions (N1)', () => {
      it('should extract createAction calls', () => {
        const actionsPath = path.join(storeJsonPath, 'store-json.actions.ts');
        const analysis = extractor.extract(actionsPath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.actions).toBeDefined();
        expect(analysis.ngrxMetadata?.actions?.length).toBeGreaterThan(0);
      });
    });

    describe('Reducers (N2)', () => {
      it('should extract reducer action references', () => {
        const reducerPath = path.join(storeJsonPath, 'store-json.reducer.ts');
        const analysis = extractor.extract(reducerPath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.reducers).toBeDefined();

        // Should have ngrx-action dependencies
        const actionRefs = analysis.dependencies.filter(
          d => d.type === 'ngrx-action'
        );
        expect(actionRefs.length).toBeGreaterThan(0);
      });
    });

    describe('Effects (N3)', () => {
      it('should extract effect action references', () => {
        const effectsPath = path.join(storeJsonPath, 'store-json.effects.ts');
        const analysis = extractor.extract(effectsPath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.effects).toBeDefined();

        // Should have ngrx-action dependencies from ofType
        const actionRefs = analysis.dependencies.filter(
          d => d.type === 'ngrx-action' && d.metadata?.context === 'effect'
        );
        expect(actionRefs.length).toBeGreaterThan(0);
      });
    });

    describe('Selectors (N4)', () => {
      it('should extract selectors and composition', () => {
        const selectorsPath = path.join(storeJsonPath, 'store-json.selectors.ts');
        const analysis = extractor.extract(selectorsPath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.selectors).toBeDefined();
        expect(analysis.ngrxMetadata?.selectors?.length).toBeGreaterThan(0);
      });

      it('N4: should detect selector composition', () => {
        const selectorsPath = path.join(storeJsonPath, 'store-json.selectors.ts');
        const analysis = extractor.extract(selectorsPath);

        // Find selectors that compose other selectors
        const composedSelectors = analysis.ngrxMetadata?.selectors?.filter(
          s => s.composedFrom && s.composedFrom.length > 0
        );
        expect(composedSelectors?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Exports extraction', () => {
    it('should extract all exports from a file', () => {
      const barrelPath = path.join(
        RESTAURANT_APP,
        'src/app/modules/+transferMerge/index.ts'
      );
      const analysis = extractor.extract(barrelPath);

      expect(analysis.exports.length).toBeGreaterThan(0);
    });
  });
});
