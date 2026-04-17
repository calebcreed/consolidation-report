/**
 * Dependency Graph - Build and query the dependency graph
 */

import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import {
  Dependency,
  FileAnalysis,
  SerializedGraph,
  GraphBuildOptions,
} from './types';
import { PathResolver } from './resolver';
import { DependencyExtractor } from './extractor';

export class DependencyGraph {
  private nodes: Map<string, FileAnalysis>;
  private edges: Dependency[];

  // Indexes for fast querying
  private dependenciesBySource: Map<string, Dependency[]> = new Map();
  private dependentsByTarget: Map<string, Dependency[]> = new Map();

  constructor(nodes: Map<string, FileAnalysis>, edges: Dependency[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.buildIndexes();
  }

  private buildIndexes(): void {
    this.dependenciesBySource = new Map();
    this.dependentsByTarget = new Map();

    for (const edge of this.edges) {
      // Index by source
      if (!this.dependenciesBySource.has(edge.source)) {
        this.dependenciesBySource.set(edge.source, []);
      }
      this.dependenciesBySource.get(edge.source)!.push(edge);

      // Index by target
      if (!this.dependentsByTarget.has(edge.target)) {
        this.dependentsByTarget.set(edge.target, []);
      }
      this.dependentsByTarget.get(edge.target)!.push(edge);
    }
  }

  /**
   * Get all files in the graph
   */
  getFiles(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get the analysis for a specific file
   */
  getAnalysis(filePath: string): FileAnalysis | undefined {
    // Try exact match first
    if (this.nodes.has(filePath)) {
      return this.nodes.get(filePath);
    }

    // Try normalized path
    const normalized = path.normalize(filePath);
    if (this.nodes.has(normalized)) {
      return this.nodes.get(normalized);
    }

    return undefined;
  }

  /**
   * Get all dependencies of a file (files this file imports)
   */
  getDependencies(filePath: string): Dependency[] {
    const normalized = path.normalize(filePath);
    return this.dependenciesBySource.get(normalized) || [];
  }

  /**
   * Get all dependents of a file (files that import this file)
   */
  getDependents(filePath: string): Dependency[] {
    const normalized = path.normalize(filePath);
    return this.dependentsByTarget.get(normalized) || [];
  }

  /**
   * Get all transitive dependencies of a file
   */
  getTransitiveDependencies(filePath: string, visited: Set<string> = new Set()): Set<string> {
    const normalized = path.normalize(filePath);

    if (visited.has(normalized)) {
      return visited;
    }
    visited.add(normalized);

    const deps = this.getDependencies(normalized);
    for (const dep of deps) {
      if (!dep.target.startsWith('external:') &&
          !dep.target.startsWith('unresolved:') &&
          !dep.target.startsWith('symbol:') &&
          !dep.target.startsWith('selector:') &&
          !dep.target.startsWith('pipe:') &&
          !dep.target.startsWith('directive:') &&
          !dep.target.startsWith('ngrx-')) {
        this.getTransitiveDependencies(dep.target, visited);
      }
    }

    return visited;
  }

  /**
   * Get all transitive dependents of a file
   */
  getTransitiveDependents(filePath: string, visited: Set<string> = new Set()): Set<string> {
    const normalized = path.normalize(filePath);

    if (visited.has(normalized)) {
      return visited;
    }
    visited.add(normalized);

    const dependents = this.getDependents(normalized);
    for (const dep of dependents) {
      this.getTransitiveDependents(dep.source, visited);
    }

    return visited;
  }

  /**
   * Check if changing fileA would affect fileB
   */
  wouldAffect(fileA: string, fileB: string): boolean {
    const dependents = this.getTransitiveDependents(fileA);
    return dependents.has(path.normalize(fileB));
  }

  /**
   * Get all internal (non-external) dependencies
   */
  getInternalDependencies(filePath: string): Dependency[] {
    return this.getDependencies(filePath).filter(
      dep => !dep.target.startsWith('external:') &&
             !dep.target.startsWith('unresolved:') &&
             !dep.target.startsWith('symbol:')
    );
  }

  /**
   * Get statistics about the graph
   */
  getStats(): GraphStats {
    const totalFiles = this.nodes.size;
    const totalEdges = this.edges.length;

    let externalDeps = 0;
    let unresolvedDeps = 0;
    let symbolRefs = 0;

    for (const edge of this.edges) {
      if (edge.target.startsWith('external:')) externalDeps++;
      else if (edge.target.startsWith('unresolved:')) unresolvedDeps++;
      else if (edge.target.startsWith('symbol:') ||
               edge.target.startsWith('selector:') ||
               edge.target.startsWith('pipe:') ||
               edge.target.startsWith('directive:') ||
               edge.target.startsWith('ngrx-')) symbolRefs++;
    }

    // Find files with most dependencies
    const depCounts = Array.from(this.dependenciesBySource.entries())
      .map(([file, deps]) => ({ file, count: deps.length }))
      .sort((a, b) => b.count - a.count);

    // Find most depended-upon files
    const dependentCounts = Array.from(this.dependentsByTarget.entries())
      .filter(([file]) => !file.startsWith('external:'))
      .map(([file, deps]) => ({ file, count: deps.length }))
      .sort((a, b) => b.count - a.count);

    return {
      totalFiles,
      totalEdges,
      externalDeps,
      unresolvedDeps,
      symbolRefs,
      internalDeps: totalEdges - externalDeps - unresolvedDeps - symbolRefs,
      topImporters: depCounts.slice(0, 10),
      topImported: dependentCounts.slice(0, 10),
    };
  }

  /**
   * Serialize the graph to JSON
   */
  toJSON(): SerializedGraph {
    return {
      version: '2.0',
      nodes: Array.from(this.nodes.entries()).map(([path, analysis]) => ({
        path,
        analysis,
      })),
      edges: this.edges,
    };
  }

  /**
   * Deserialize a graph from JSON
   */
  static fromJSON(json: SerializedGraph): DependencyGraph {
    const nodes = new Map<string, FileAnalysis>();
    for (const { path: filePath, analysis } of json.nodes) {
      nodes.set(filePath, analysis);
    }
    return new DependencyGraph(nodes, json.edges);
  }
}

export interface GraphStats {
  totalFiles: number;
  totalEdges: number;
  externalDeps: number;
  unresolvedDeps: number;
  symbolRefs: number;
  internalDeps: number;
  topImporters: Array<{ file: string; count: number }>;
  topImported: Array<{ file: string; count: number }>;
}

export class GraphBuilder {
  private resolver: PathResolver;
  private extractor: DependencyExtractor;

  constructor(resolver: PathResolver) {
    this.resolver = resolver;
    this.extractor = new DependencyExtractor(resolver);
  }

  /**
   * Build a dependency graph from a directory
   */
  async build(rootDir: string, options: GraphBuildOptions = {}): Promise<DependencyGraph> {
    const include = options.include || ['**/*.ts', '**/*.tsx'];
    const exclude = options.exclude || ['**/node_modules/**', '**/dist/**', '**/*.spec.ts', '**/*.test.ts'];

    // Find all matching files
    const files: string[] = [];
    for (const pattern of include) {
      const matches = await glob(pattern, {
        cwd: rootDir,
        absolute: true,
        ignore: exclude,
      });
      files.push(...matches);
    }

    return this.buildFromFiles(files);
  }

  /**
   * Build a dependency graph from a list of files
   */
  buildFromFiles(files: string[]): DependencyGraph {
    const nodes = new Map<string, FileAnalysis>();
    const allEdges: Dependency[] = [];

    // Extract dependencies from each file
    for (const file of files) {
      const analysis = this.extractor.extract(file);
      nodes.set(analysis.path, analysis);
      allEdges.push(...analysis.dependencies);
    }

    return new DependencyGraph(nodes, allEdges);
  }

  /**
   * Create a GraphBuilder from a tsconfig path
   */
  static fromTsconfig(tsconfigPath: string): GraphBuilder {
    const resolver = PathResolver.fromTsconfig(tsconfigPath);
    return new GraphBuilder(resolver);
  }
}
