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
exports.GraphBuilder = void 0;
const path = __importStar(require("path"));
class GraphBuilder {
    constructor(config) {
        this.nodes = new Map();
        this.edges = [];
        // Lookup maps for resolving references
        this.filesByPath = new Map(); // absolute path -> node id
        this.filesByClass = new Map(); // class name -> node id
        this.filesBySelector = new Map(); // selector -> node id
        this.filesByAction = new Map(); // action name/identifier -> node id
        this.filesBySelector2 = new Map(); // NgRx selector name -> node id
        this.config = config;
    }
    build(retailFiles, restaurantFiles, matchings, retailOnly, restaurantOnly, diffResults) {
        // Create nodes for matched files
        for (const match of matchings) {
            const retailFile = retailFiles.find(f => f.filePath === match.retailFile);
            const restaurantFile = restaurantFiles.find(f => f.filePath === match.restaurantFile);
            const nodeId = this.createNodeId(match.retailFile, this.config.retailPath);
            const diffResult = diffResults.get(match.retailFile);
            const node = {
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
            const node = {
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
            const node = {
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
            if (!nodeId)
                continue;
            this.addDependencyEdges(nodeId, file);
        }
        // Also process restaurant files for any additional edges
        for (const file of restaurantFiles) {
            const nodeId = this.findNodeIdForFile(file.filePath);
            if (!nodeId)
                continue;
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
    createNodeId(filePath, basePath) {
        return path.relative(basePath, filePath).replace(/\\/g, '/');
    }
    indexNode(node, retailFile, restaurantFile) {
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
        // Index NgRx patterns
        const file = retailFile || restaurantFile;
        if (file?.ngrx) {
            // Index action names (e.g., '[Cart] Add Item')
            for (const actionName of file.ngrx.actionNames) {
                this.filesByAction.set(actionName, node.id);
            }
            // Index action identifiers (e.g., 'addItem', 'LoadProducts')
            for (const actionId of file.ngrx.actionIdentifiers) {
                this.filesByAction.set(actionId, node.id);
            }
            // Index selector names
            for (const selectorName of file.ngrx.selectorNames) {
                this.filesBySelector2.set(selectorName, node.id);
            }
        }
    }
    findNodeIdForFile(filePath) {
        return this.filesByPath.get(filePath) || null;
    }
    extractAngularMetadata(retail, restaurant) {
        const file = retail || restaurant;
        if (!file)
            return undefined;
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
    addDependencyEdges(nodeId, file) {
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
            let targetId;
            if (ref.type === 'component' || ref.type === 'directive') {
                targetId = this.filesBySelector.get(ref.name);
            }
            else if (ref.type === 'pipe') {
                targetId = this.filesBySelector.get(ref.name);
            }
            if (targetId && targetId !== nodeId) {
                this.addEdge(nodeId, targetId, ref.type === 'pipe' ? 'template-pipe' : 'template-selector');
            }
        }
        // NgRx action references (from reducers/effects to action files)
        if (file.ngrx) {
            for (const actionRef of file.ngrx.referencedActions) {
                const targetId = this.filesByAction.get(actionRef);
                if (targetId && targetId !== nodeId) {
                    this.addEdge(nodeId, targetId, 'ngrx-action');
                }
            }
            // NgRx selector references (from components/effects to selector files)
            for (const selectorRef of file.ngrx.referencedSelectors) {
                const targetId = this.filesBySelector2.get(selectorRef);
                if (targetId && targetId !== nodeId) {
                    this.addEdge(nodeId, targetId, 'ngrx-selector');
                }
            }
        }
    }
    addEdge(from, to, type) {
        // Avoid duplicates
        const exists = this.edges.some(e => e.from === from && e.to === to && e.type === type);
        if (!exists) {
            this.edges.push({ from, to, type });
        }
    }
    calculateDepths() {
        // Find root nodes (no dependents)
        const roots = Array.from(this.nodes.values()).filter(n => n.dependents.length === 0);
        // BFS from roots
        const visited = new Set();
        const queue = [];
        for (const root of roots) {
            queue.push({ nodeId: root.id, depth: 0 });
        }
        while (queue.length > 0) {
            const { nodeId, depth } = queue.shift();
            if (visited.has(nodeId))
                continue;
            visited.add(nodeId);
            const node = this.nodes.get(nodeId);
            if (!node)
                continue;
            node.depth = Math.max(node.depth, depth);
            for (const depId of node.dependencies) {
                if (!visited.has(depId)) {
                    queue.push({ nodeId: depId, depth: depth + 1 });
                }
            }
        }
    }
}
exports.GraphBuilder = GraphBuilder;
