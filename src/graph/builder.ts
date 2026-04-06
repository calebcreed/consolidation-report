import * as path from 'path';
import { FileNode, DependencyEdge, Config } from '../config';
import { ParsedFile } from '../parser';
import { FileMapping } from '../config';
import { ThreeWayDiffResult } from '../diff';

export class GraphBuilder {
  private config: Config;
  private nodes: Map<string, FileNode> = new Map();
  private edges: DependencyEdge[] = [];

  // Lookup maps for resolving references
  private filesByPath: Map<string, string> = new Map();       // absolute path -> node id
  private filesByClass: Map<string, string> = new Map();      // class name -> node id
  private filesBySelector: Map<string, string> = new Map();   // selector -> node id

  constructor(config: Config) {
    this.config = config;
  }

  build(
    retailFiles: ParsedFile[],
    restaurantFiles: ParsedFile[],
    matchings: FileMapping[],
    retailOnly: string[],
    restaurantOnly: string[],
    diffResults: Map<string, ThreeWayDiffResult>
  ): { nodes: Map<string, FileNode>; edges: DependencyEdge[] } {
    // Create nodes for matched files
    for (const match of matchings) {
      const retailFile = retailFiles.find(f => f.filePath === match.retailFile);
      const restaurantFile = restaurantFiles.find(f => f.filePath === match.restaurantFile);

      const nodeId = this.createNodeId(match.retailFile, this.config.retailPath);
      const diffResult = diffResults.get(match.retailFile);

      const node: FileNode = {
        id: nodeId,
        relativePath: path.relative(this.config.retailPath, match.retailFile),
        retailPath: match.retailFile,
        restaurantPath: match.restaurantFile,
        type: retailFile?.type || restaurantFile?.type || 'unknown',
        angularMetadata: this.extractAngularMetadata(retailFile, restaurantFile),
        divergence: diffResult?.divergence || null,
        dependencies: [],
        dependents: [],
        isCleanSubtree: false,
        depth: 0,
      };

      this.nodes.set(nodeId, node);
      this.indexNode(node, retailFile, restaurantFile);
    }

    // Create nodes for retail-only files
    for (const filePath of retailOnly) {
      const file = retailFiles.find(f => f.filePath === filePath);
      const nodeId = this.createNodeId(filePath, this.config.retailPath);
      const diffResult = diffResults.get(filePath);

      const node: FileNode = {
        id: nodeId,
        relativePath: path.relative(this.config.retailPath, filePath),
        retailPath: filePath,
        restaurantPath: null,
        type: file?.type || 'unknown',
        angularMetadata: file ? this.extractAngularMetadata(file, null) : undefined,
        divergence: diffResult?.divergence || {
          type: 'RETAIL_ONLY',
          retailChanges: { additions: 0, deletions: 0 },
          restaurantChanges: { additions: 0, deletions: 0 },
          conflictRegions: [],
          autoMergeable: true,
        },
        dependencies: [],
        dependents: [],
        isCleanSubtree: false,
        depth: 0,
      };

      this.nodes.set(nodeId, node);
      this.indexNode(node, file, null);
    }

    // Create nodes for restaurant-only files
    for (const filePath of restaurantOnly) {
      const file = restaurantFiles.find(f => f.filePath === filePath);
      const nodeId = this.createNodeId(filePath, this.config.restaurantPath);
      const diffResult = diffResults.get(filePath);

      const node: FileNode = {
        id: nodeId,
        relativePath: path.relative(this.config.restaurantPath, filePath),
        retailPath: null,
        restaurantPath: filePath,
        type: file?.type || 'unknown',
        angularMetadata: file ? this.extractAngularMetadata(null, file) : undefined,
        divergence: diffResult?.divergence || {
          type: 'RESTAURANT_ONLY',
          retailChanges: { additions: 0, deletions: 0 },
          restaurantChanges: { additions: 0, deletions: 0 },
          conflictRegions: [],
          autoMergeable: true,
        },
        dependencies: [],
        dependents: [],
        isCleanSubtree: false,
        depth: 0,
      };

      this.nodes.set(nodeId, node);
      this.indexNode(node, null, file);
    }

    // Build edges from retail files (primary source of dependency info)
    for (const file of retailFiles) {
      const nodeId = this.findNodeIdForFile(file.filePath);
      if (!nodeId) continue;

      this.addDependencyEdges(nodeId, file);
    }

    // Also process restaurant files for any additional edges
    for (const file of restaurantFiles) {
      const nodeId = this.findNodeIdForFile(file.filePath);
      if (!nodeId) continue;

      this.addDependencyEdges(nodeId, file);
    }

    // Populate dependents (reverse of dependencies)
    for (const edge of this.edges) {
      const fromNode = this.nodes.get(edge.from);
      const toNode = this.nodes.get(edge.to);

      if (fromNode && !fromNode.dependencies.includes(edge.to)) {
        fromNode.dependencies.push(edge.to);
      }
      if (toNode && !toNode.dependents.includes(edge.from)) {
        toNode.dependents.push(edge.from);
      }
    }

    // Calculate depths
    this.calculateDepths();

    return { nodes: this.nodes, edges: this.edges };
  }

  private createNodeId(filePath: string, basePath: string): string {
    return path.relative(basePath, filePath).replace(/\\/g, '/');
  }

  private indexNode(node: FileNode, retailFile: ParsedFile | null | undefined, restaurantFile: ParsedFile | null | undefined): void {
    if (node.retailPath) {
      this.filesByPath.set(node.retailPath, node.id);
    }
    if (node.restaurantPath) {
      this.filesByPath.set(node.restaurantPath, node.id);
    }

    const metadata = node.angularMetadata;
    if (metadata?.className) {
      this.filesByClass.set(metadata.className, node.id);
    }
    if (metadata?.selector) {
      this.filesBySelector.set(metadata.selector, node.id);
    }
  }

  private findNodeIdForFile(filePath: string): string | null {
    return this.filesByPath.get(filePath) || null;
  }

  private extractAngularMetadata(retail: ParsedFile | null | undefined, restaurant: ParsedFile | null | undefined): FileNode['angularMetadata'] {
    const file = retail || restaurant;
    if (!file) return undefined;

    return {
      selector: file.selector,
      className: file.className,
      providedIn: file.providedIn,
      declarations: file.ngModuleDeclarations.length > 0 ? file.ngModuleDeclarations : undefined,
      imports: file.ngModuleImports.length > 0 ? file.ngModuleImports : undefined,
      exports: file.ngModuleExports.length > 0 ? file.ngModuleExports : undefined,
      providers: file.ngModuleProviders.length > 0 ? file.ngModuleProviders : undefined,
    };
  }

  private addDependencyEdges(nodeId: string, file: ParsedFile): void {
    // ES imports
    for (const importPath of file.imports) {
      const targetId = this.filesByPath.get(importPath);
      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, 'import');
      }
    }

    // Constructor injections
    for (const injection of file.constructorInjections) {
      const targetId = this.filesByClass.get(injection);
      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, 'injection');
      }
    }

    // NgModule imports
    for (const moduleName of file.ngModuleImports) {
      const targetId = this.filesByClass.get(moduleName);
      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, 'ngmodule-import');
      }
    }

    // NgModule declarations
    for (const declName of file.ngModuleDeclarations) {
      const targetId = this.filesByClass.get(declName);
      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, 'ngmodule-declaration');
      }
    }

    // Providers
    for (const providerName of [...file.ngModuleProviders, ...file.componentProviders]) {
      const targetId = this.filesByClass.get(providerName);
      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, 'provider');
      }
    }

    // Template references
    for (const ref of file.templateRefs) {
      let targetId: string | undefined;

      if (ref.type === 'component' || ref.type === 'directive') {
        targetId = this.filesBySelector.get(ref.name);
      } else if (ref.type === 'pipe') {
        targetId = this.filesBySelector.get(ref.name);
      }

      if (targetId && targetId !== nodeId) {
        this.addEdge(nodeId, targetId, ref.type === 'pipe' ? 'template-pipe' : 'template-selector');
      }
    }
  }

  private addEdge(from: string, to: string, type: DependencyEdge['type']): void {
    // Avoid duplicates
    const exists = this.edges.some(e => e.from === from && e.to === to && e.type === type);
    if (!exists) {
      this.edges.push({ from, to, type });
    }
  }

  private calculateDepths(): void {
    // Find root nodes (no dependents)
    const roots = Array.from(this.nodes.values()).filter(n => n.dependents.length === 0);

    // BFS from roots
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [];

    for (const root of roots) {
      queue.push({ nodeId: root.id, depth: 0 });
    }

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      node.depth = Math.max(node.depth, depth);

      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          queue.push({ nodeId: depId, depth: depth + 1 });
        }
      }
    }
  }
}
