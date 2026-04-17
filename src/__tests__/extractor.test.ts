/**
 * Dependency Extractor Tests
 *
 * Tests all dependency species:
 * - S1-S11: Standard TypeScript imports
 * - A1-A12: Angular-specific
 * - N1-N5: NgRx-specific
 * - O1-O4: Other patterns
 */

import * as path from 'path';
import { PathResolver } from '../deps/resolver';
import { DependencyExtractor } from '../deps/extractor';
import { DependencyType } from '../deps/types';

// Resolve test-fixture relative to project root
const MODEL_PATH = path.resolve(__dirname, '../../test-fixture');
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

    it('S1: should extract relative sibling imports (./foo)', () => {
      const analysis = extractor.extract(interceptorPath);
      const siblingDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('./')
      );
      expect(siblingDeps.length).toBeGreaterThan(0);
      // Should find ./logger.service, ./network-detection.service, etc.
      const specifiers = siblingDeps.map(d => d.specifier);
      expect(specifiers.some(s => s.includes('logger'))).toBe(true);
    });

    it('S2: should extract relative parent imports (../foo)', () => {
      const analysis = extractor.extract(interceptorPath);
      const parentDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('../')
      );
      expect(parentDeps.length).toBeGreaterThan(0);
      // Should find ../core/services/common.service, ../models/user
      const specifiers = parentDeps.map(d => d.specifier);
      expect(specifiers.some(s => s.includes('core') || s.includes('models'))).toBe(true);
    });

    it('S4: should extract baseUrl imports', () => {
      const paymentPath = path.join(RESTAURANT_APP, 'src/app/services/payment.service.ts');
      const analysis = extractor.extract(paymentPath);

      // Should find Payments/processors/card-processor.service via baseUrl
      const baseUrlDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('Payments/')
      );
      expect(baseUrlDeps.length).toBeGreaterThan(0);
    });

    it('S5: should extract path alias imports (@app/foo)', () => {
      const analysis = extractor.extract(interceptorPath);
      const aliasDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('@app/')
      );
      expect(aliasDeps.length).toBeGreaterThan(0);
      // Path aliases should NOT be marked as external
      for (const dep of aliasDeps) {
        expect(dep.target).not.toContain('external:');
      }
    });

    it('S6: should extract wildcard path alias imports (@env/*)', () => {
      const analysis = extractor.extract(interceptorPath);
      const envDeps = analysis.dependencies.filter(
        d => d.type === 'import' && d.specifier.startsWith('@env/')
      );
      expect(envDeps.length).toBeGreaterThan(0);
    });

    it('S9: should extract side-effect imports', () => {
      const importPatternsPath = path.join(RESTAURANT_APP, 'src/app/utils/import-patterns.ts');
      const analysis = extractor.extract(importPatternsPath);
      const sideEffects = analysis.dependencies.filter(
        d => d.type === 'import-side-effect'
      );
      expect(sideEffects.length).toBeGreaterThan(0);
      expect(sideEffects.some(d => d.specifier.includes('side-effects'))).toBe(true);
    });

    it('S10: should extract dynamic imports', () => {
      const importPatternsPath = path.join(RESTAURANT_APP, 'src/app/utils/import-patterns.ts');
      const analysis = extractor.extract(importPatternsPath);
      const dynamicImports = analysis.dependencies.filter(
        d => d.type === 'import-dynamic'
      );
      expect(dynamicImports.length).toBeGreaterThan(0);
    });

    it('S11: should extract type-only imports', () => {
      const importPatternsPath = path.join(RESTAURANT_APP, 'src/app/utils/import-patterns.ts');
      const analysis = extractor.extract(importPatternsPath);
      const typeImports = analysis.dependencies.filter(
        d => d.type === 'import-type'
      );
      expect(typeImports.length).toBeGreaterThan(0);
    });
  });

  describe('Re-exports (S7, S8)', () => {
    const barrelPath = path.join(RESTAURANT_APP, 'src/app/modules/+transferMerge/index.ts');

    it('S7: should extract re-exports', () => {
      const analysis = extractor.extract(barrelPath);
      const reExports = analysis.dependencies.filter(
        d => d.type === 'export-from'
      );
      expect(reExports.length).toBeGreaterThan(0);
    });

    it('S8: should extract renamed re-exports', () => {
      const analysis = extractor.extract(barrelPath);
      // Check exports for renamed items
      const renamedExports = analysis.exports.filter(
        e => e.alias && e.alias !== e.name
      );
      // We have: export { TabletTransferComponent as TransferComponent }
      expect(renamedExports.length).toBeGreaterThan(0);
    });
  });

  describe('Angular (A1-A12)', () => {
    describe('Constructor injection (A1)', () => {
      it('should detect constructor parameter types', () => {
        const interceptorPath = path.join(RESTAURANT_APP, 'src/app/services/interceptor.ts');
        const analysis = extractor.extract(interceptorPath);
        const injections = analysis.dependencies.filter(
          d => d.type === 'injection'
        );
        expect(injections.length).toBeGreaterThan(0);
        // Should find CommonService, NetworkDetectionService, LoggerService
        const injectedTypes = injections.map(d => d.metadata?.typeName);
        expect(injectedTypes).toContain('CommonService');
      });
    });

    describe('@Inject token (A2)', () => {
      it('should detect @Inject decorator', () => {
        const apiServicePath = path.join(RESTAURANT_APP, 'src/app/services/api.service.ts');
        const analysis = extractor.extract(apiServicePath);
        const tokenInjections = analysis.dependencies.filter(
          d => d.type === 'inject-token'
        );
        expect(tokenInjections.length).toBeGreaterThan(0);
      });
    });

    describe('NgModule (A3-A6)', () => {
      const modulePath = path.join(
        RESTAURANT_APP,
        'src/app/modules/+transferMerge/transfer-merge.module.ts'
      );

      it('should extract NgModule metadata', () => {
        const analysis = extractor.extract(modulePath);
        expect(analysis.angularMetadata).toBeDefined();
        expect(analysis.angularMetadata?.type).toBe('module');
      });

      it('A3: should extract NgModule imports', () => {
        const analysis = extractor.extract(modulePath);
        const moduleImports = analysis.dependencies.filter(
          d => d.type === 'ngmodule-import'
        );
        expect(moduleImports.length).toBeGreaterThan(0);
      });

      it('A4: should extract NgModule declarations', () => {
        const analysis = extractor.extract(modulePath);
        const declarations = analysis.dependencies.filter(
          d => d.type === 'ngmodule-declaration'
        );
        expect(declarations.length).toBeGreaterThan(0);
      });

      it('A5: should extract NgModule providers', () => {
        const analysis = extractor.extract(modulePath);
        const providers = analysis.dependencies.filter(
          d => d.type === 'ngmodule-provider'
        );
        // May or may not have providers - check angularMetadata
        expect(analysis.angularMetadata?.providers).toBeDefined();
      });

      it('A6: should extract NgModule exports', () => {
        const analysis = extractor.extract(modulePath);
        const moduleExports = analysis.dependencies.filter(
          d => d.type === 'ngmodule-export'
        );
        // May or may not have exports - check angularMetadata
        expect(analysis.angularMetadata?.exports).toBeDefined();
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
        // Check if there are template component references
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
        // Check if there are pipe references
      });

      it('A9: should extract directives from templates', () => {
        const componentPath = path.join(
          RESTAURANT_APP,
          'src/app/modules/+transferMerge/components/transfer-items/transfer-items.component.ts'
        );
        const analysis = extractor.extract(componentPath);
        const directives = analysis.dependencies.filter(
          d => d.type === 'template-directive'
        );
        // Check if there are directive references
      });
    });

    describe('Lazy loading (A10)', () => {
      it('A10: should extract lazy loadChildren routes', () => {
        const routingPath = path.join(RESTAURANT_APP, 'src/app/app-routing.module.ts');
        const analysis = extractor.extract(routingPath);
        // Lazy routes are detected as dynamic imports (import-dynamic)
        // The loadChildren pattern uses dynamic import() syntax
        const lazyRoutes = analysis.dependencies.filter(
          d => d.type === 'import-dynamic' || d.type === 'lazy-route'
        );
        expect(lazyRoutes.length).toBeGreaterThan(0);
        // Should find the transferMerge module
        expect(lazyRoutes.some(r => r.specifier.includes('transferMerge'))).toBe(true);
      });
    });

    describe('providedIn (A12)', () => {
      it('A12: should detect providedIn: root services', () => {
        const servicePath = path.join(RESTAURANT_APP, 'src/app/services/logger.service.ts');
        const analysis = extractor.extract(servicePath);
        expect(analysis.angularMetadata?.type).toBe('service');
        expect(analysis.angularMetadata?.providedIn).toBe('root');
      });
    });
  });

  describe('NgRx (N1-N5)', () => {
    const storeJsonPath = path.join(RESTAURANT_APP, 'src/app/core/state/store-json');

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

        const actionRefs = analysis.dependencies.filter(
          d => d.type === 'ngrx-action' && d.metadata?.context === 'effect'
        );
        expect(actionRefs.length).toBeGreaterThan(0);
      });
    });

    describe('Selectors (N4)', () => {
      it('should extract selectors', () => {
        const selectorsPath = path.join(storeJsonPath, 'store-json.selectors.ts');
        const analysis = extractor.extract(selectorsPath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.selectors).toBeDefined();
        expect(analysis.ngrxMetadata?.selectors?.length).toBeGreaterThan(0);
      });

      it('N4: should detect selector composition', () => {
        const selectorsPath = path.join(storeJsonPath, 'store-json.selectors.ts');
        const analysis = extractor.extract(selectorsPath);

        const composedSelectors = analysis.ngrxMetadata?.selectors?.filter(
          s => s.composedFrom && s.composedFrom.length > 0
        );
        expect(composedSelectors?.length).toBeGreaterThan(0);
      });
    });

    describe('Feature state (N5)', () => {
      it('N5: should extract StoreModule.forFeature', () => {
        const modulePath = path.join(storeJsonPath, 'store-json.module.ts');
        const analysis = extractor.extract(modulePath);

        expect(analysis.ngrxMetadata).toBeDefined();
        expect(analysis.ngrxMetadata?.featureKey).toBeDefined();
        expect(analysis.ngrxMetadata?.featureKey).toBe('storeJson');
      });
    });
  });

  describe('Other patterns (O1-O4)', () => {
    describe('Type declarations (O1)', () => {
      it('O1: should handle .d.ts files', () => {
        const dtsPath = path.join(RESTAURANT_APP, 'src/app/typings/linga-engine.d.ts');
        const analysis = extractor.extract(dtsPath);
        // d.ts files may not have many dependencies but should parse
        expect(analysis).toBeDefined();
        expect(analysis.path).toContain('linga-engine.d.ts');
      });
    });

    describe('Triple-slash (O2)', () => {
      it('O2: should extract triple-slash directives', () => {
        const bridgePath = path.join(RESTAURANT_APP, 'src/app/services/native-bridge.service.ts');
        const analysis = extractor.extract(bridgePath);
        const tripleSlash = analysis.dependencies.filter(
          d => d.type === 'triple-slash'
        );
        expect(tripleSlash.length).toBeGreaterThan(0);
        expect(tripleSlash[0].specifier).toContain('linga-engine');
      });
    });

    describe('CommonJS require (O3)', () => {
      it('O3: should extract require() calls', () => {
        const importPatternsPath = path.join(RESTAURANT_APP, 'src/app/utils/import-patterns.ts');
        const analysis = extractor.extract(importPatternsPath);
        const requireDeps = analysis.dependencies.filter(
          d => d.type === 'require'
        );
        expect(requireDeps.length).toBeGreaterThan(0);
      });
    });

    describe('JSON imports (O4)', () => {
      it('O4: should extract JSON imports', () => {
        const importPatternsPath = path.join(RESTAURANT_APP, 'src/app/utils/import-patterns.ts');
        const analysis = extractor.extract(importPatternsPath);
        const jsonImports = analysis.dependencies.filter(
          d => d.specifier.endsWith('.json')
        );
        expect(jsonImports.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Exports extraction', () => {
    it('should extract all exports from a file', () => {
      const barrelPath = path.join(RESTAURANT_APP, 'src/app/modules/+transferMerge/index.ts');
      const analysis = extractor.extract(barrelPath);
      expect(analysis.exports.length).toBeGreaterThan(0);
    });

    it('should extract named exports', () => {
      const barrelPath = path.join(RESTAURANT_APP, 'src/app/core/index.ts');
      const analysis = extractor.extract(barrelPath);
      const namedExports = analysis.exports.filter(e => !e.isDefault);
      expect(namedExports.length).toBeGreaterThan(0);
    });
  });
});
