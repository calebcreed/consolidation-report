/**
 * Dependency Graph Tests
 */

import * as path from 'path';
import { GraphBuilder, DependencyGraph } from '../deps/graph';
import { PathResolver } from '../deps/resolver';

const MODEL_PATH = '/Users/calebcreed/Downloads/webpos-model';
const RESTAURANT_APP = path.join(MODEL_PATH, 'apps/restaurant');
const TSCONFIG_PATH = path.join(RESTAURANT_APP, 'tsconfig.app.json');

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeAll(async () => {
    const builder = GraphBuilder.fromTsconfig(TSCONFIG_PATH);
    graph = await builder.build(path.join(RESTAURANT_APP, 'src'), {
      include: ['**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', '**/node_modules/**'],
    });
  }, 30000);  // Allow 30s for graph building

  describe('Graph construction', () => {
    it('should find TypeScript files', () => {
      const files = graph.getFiles();
      expect(files.length).toBeGreaterThan(0);
    });

    it('should build file analyses', () => {
      const files = graph.getFiles();
      for (const file of files.slice(0, 5)) {
        const analysis = graph.getAnalysis(file);
        expect(analysis).toBeDefined();
        expect(analysis?.path).toBe(file);
      }
    });
  });

  describe('Dependency queries', () => {
    it('should get dependencies for a file', () => {
      const files = graph.getFiles();
      const fileWithDeps = files.find(f => {
        const deps = graph.getDependencies(f);
        return deps.length > 0;
      });

      expect(fileWithDeps).toBeDefined();
      const deps = graph.getDependencies(fileWithDeps!);
      expect(deps.length).toBeGreaterThan(0);
    });

    it('should get dependents for a file', () => {
      // Find a file that is imported by others
      const files = graph.getFiles();

      for (const file of files) {
        const dependents = graph.getDependents(file);
        if (dependents.length > 0) {
          expect(dependents.length).toBeGreaterThan(0);
          // Each dependent should have this file as target
          for (const dep of dependents) {
            expect(dep.target).toBe(file);
          }
          break;
        }
      }
    });

    it('should get transitive dependencies', () => {
      const files = graph.getFiles();
      const fileWithDeps = files.find(f => {
        const deps = graph.getDependencies(f);
        return deps.length > 0;
      });

      if (fileWithDeps) {
        const transitive = graph.getTransitiveDependencies(fileWithDeps);
        expect(transitive.size).toBeGreaterThan(0);
        expect(transitive.has(fileWithDeps)).toBe(true);  // Includes self
      }
    });
  });

  describe('Graph statistics', () => {
    it('should compute graph stats', () => {
      const stats = graph.getStats();

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.totalEdges).toBeGreaterThan(0);
      expect(stats.externalDeps).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      const json = graph.toJSON();

      expect(json.version).toBe('2.0');
      expect(json.nodes.length).toBeGreaterThan(0);
      expect(json.edges.length).toBeGreaterThan(0);
    });

    it('should deserialize from JSON', () => {
      const json = graph.toJSON();
      const restored = DependencyGraph.fromJSON(json);

      expect(restored.getFiles().length).toBe(graph.getFiles().length);
    });
  });
});
