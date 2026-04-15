// =============================================================
// ALL JavaScript/TypeScript Import Patterns
// =============================================================

// -------------------------------------------------------------
// NAMED IMPORTS
// -------------------------------------------------------------

// Basic named import
import { CONSTANT_A } from './export-patterns';

// Multiple named imports
import { CONSTANT_A as A, CONSTANT_B, namedFunction } from './export-patterns';

// Named import with rename (alias)
import { NamedClass as RenamedClass } from './export-patterns';


// -------------------------------------------------------------
// DEFAULT IMPORTS
// -------------------------------------------------------------

// Default import (name can be anything)
import defaultExport from './export-patterns';
import myDefault from './export-patterns';  // same thing, different name


// -------------------------------------------------------------
// NAMESPACE IMPORTS
// -------------------------------------------------------------

// Import everything as namespace
import * as ExportPatterns from './export-patterns';
// Usage: ExportPatterns.CONSTANT_A, ExportPatterns.namedFunction()


// -------------------------------------------------------------
// MIXED IMPORTS
// -------------------------------------------------------------

// Default + named imports together
import defaultVal, { CONSTANT_A as CA, namedFunction as fn } from './export-patterns';


// -------------------------------------------------------------
// SIDE-EFFECT IMPORTS (S9)
// -------------------------------------------------------------

// Import for side effects only (no bindings)
import './side-effects-only';
// Common for: polyfills, CSS-in-JS, global registrations


// -------------------------------------------------------------
// TYPE-ONLY IMPORTS (S11) - TypeScript specific
// -------------------------------------------------------------

// Import only the type (erased at runtime)
import type { NamedInterface, NamedType } from './export-patterns';

// Type-only with rename
import type { NamedInterface as IInterface } from './export-patterns';

// Inline type import (TypeScript 4.5+)
// import { type NamedInterface, CONSTANT_A } from './export-patterns';


// -------------------------------------------------------------
// DYNAMIC IMPORTS (S10)
// -------------------------------------------------------------

// Dynamic import - returns Promise
async function loadModule() {
  // Basic dynamic import
  const module = await import('./export-patterns');

  // With destructuring
  const { CONSTANT_A, namedFunction } = await import('./export-patterns');

  // Dynamic path (useful for lazy loading)
  const moduleName = 'export-patterns';
  const dynamicModule = await import(`./${moduleName}`);

  return module;
}


// -------------------------------------------------------------
// COMMONJS (O3) - Legacy, but still seen in some codebases
// -------------------------------------------------------------

// require() - CommonJS import
// const legacy = require('./legacy-module');

// module.exports / exports - CommonJS export (in other files)
// module.exports = { ... };
// exports.foo = bar;


// -------------------------------------------------------------
// JSON IMPORTS (O4)
// -------------------------------------------------------------

// Requires "resolveJsonModule": true in tsconfig
// import config from '../config/printer-defaults.json';
// import * as configData from '../config/printer-defaults.json';


// Make this file a module
export {};
