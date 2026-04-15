// =============================================================
// ALL Re-export Patterns (for barrel files, etc.)
// =============================================================

// -------------------------------------------------------------
// NAMED RE-EXPORTS
// -------------------------------------------------------------

// Re-export specific named exports
export { CONSTANT_A, namedFunction } from './export-patterns';

// Re-export with rename
export { CONSTANT_B as RENAMED_CONSTANT } from './export-patterns';

// Re-export class/interface/type
export { NamedClass, NamedInterface, NamedType } from './export-patterns';


// -------------------------------------------------------------
// WILDCARD RE-EXPORTS
// -------------------------------------------------------------

// Re-export everything (except default)
export * from './export-patterns';

// Re-export everything under a namespace (ES2020+)
export * as Patterns from './export-patterns';


// -------------------------------------------------------------
// DEFAULT RE-EXPORTS
// -------------------------------------------------------------

// Re-export default as named
export { default as exportPatternsDefault } from './export-patterns';

// Re-export default as default (less common)
// export { default } from './export-patterns';


// -------------------------------------------------------------
// MIXED RE-EXPORTS
// -------------------------------------------------------------

// Combine multiple sources in one barrel
// export * from './module-a';
// export * from './module-b';
// export { specificThing } from './module-c';
// export { default as ModuleD } from './module-d';
