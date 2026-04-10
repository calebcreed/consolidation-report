/**
 * Core types for dependency detection
 */

// All dependency types we detect
export type DependencyType =
  // TypeScript (S1-S11)
  | 'import'              // Named/default/namespace import
  | 'import-type'         // import type { X }
  | 'import-side-effect'  // import './polyfills'
  | 'import-dynamic'      // await import('./lazy')
  | 'require'             // require('./legacy')
  | 'export-from'         // export { X } from './foo'
  | 'triple-slash'        // /// <reference path="..." />
  // Angular (A1-A12)
  | 'injection'           // Constructor injection
  | 'inject-token'        // @Inject(TOKEN)
  | 'ngmodule-import'     // NgModule imports array
  | 'ngmodule-declaration'
  | 'ngmodule-provider'
  | 'ngmodule-export'
  | 'template-component'  // <app-foo>
  | 'template-pipe'       // {{ x | pipeName }}
  | 'template-directive'  // [appDirective]
  | 'lazy-route'          // loadChildren dynamic import
  // NgRx (N1-N5)
  | 'ngrx-action'         // Action reference in reducer/effect
  | 'ngrx-selector'       // Selector usage
  | 'ngrx-feature';       // StoreModule.forFeature

export interface Dependency {
  type: DependencyType;
  source: string;          // Absolute path of file with dependency
  target: string;          // Resolved absolute path (or 'external:package')
  specifier: string;       // Original import specifier as written
  line: number;
  column: number;
  metadata?: Record<string, unknown>;
}

export interface Export {
  name: string;
  alias?: string;
  isDefault: boolean;
  isType: boolean;
  line: number;
}

export interface AngularMetadata {
  type: 'component' | 'directive' | 'pipe' | 'module' | 'service' | 'guard' | 'interceptor';
  selector?: string;
  templateUrl?: string;
  template?: string;
  styleUrls?: string[];
  providers?: string[];
  declarations?: string[];
  imports?: string[];
  exports?: string[];
  providedIn?: string;
}

export interface NgRxMetadata {
  actions?: NgRxAction[];
  reducers?: NgRxReducer[];
  effects?: NgRxEffect[];
  selectors?: NgRxSelector[];
  featureKey?: string;
}

export interface NgRxAction {
  name: string;
  type: string;  // The action type string
  props?: string[];
  line: number;
}

export interface NgRxReducer {
  name: string;
  actions: string[];  // Actions handled by this reducer
  line: number;
}

export interface NgRxEffect {
  name: string;
  actions: string[];  // Actions this effect listens to
  dispatches?: string[];  // Actions this effect dispatches
  line: number;
}

export interface NgRxSelector {
  name: string;
  featureKey?: string;
  composedFrom?: string[];  // Other selectors this one uses
  line: number;
}

export interface FileAnalysis {
  path: string;
  relativePath: string;
  dependencies: Dependency[];
  exports: Export[];
  angularMetadata?: AngularMetadata;
  ngrxMetadata?: NgRxMetadata;
}

export interface SerializedGraph {
  version: string;
  nodes: Array<{
    path: string;
    analysis: FileAnalysis;
  }>;
  edges: Dependency[];
}

export interface ResolvedPath {
  absolute: string | null;  // null if unresolved
  isExternal: boolean;
  isBarrel: boolean;
  originalSpecifier: string;
}

export interface PathResolverConfig {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  extensions?: string[];
  rootDir: string;
}

export interface GraphBuildOptions {
  include?: string[];  // Glob patterns
  exclude?: string[];
}

export interface InjectedDependency {
  name: string;
  type: string;
  token?: string;  // For @Inject(TOKEN)
  line: number;
}
