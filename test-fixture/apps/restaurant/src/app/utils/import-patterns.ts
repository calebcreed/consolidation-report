// Comprehensive import patterns for testing
// Copy of retail version with O3 and O4 uncommented

// S1: Sibling relative
import { LocalStorageUtils } from './local-storage.utils';

// S9: Side-effect import
import './side-effects-only';

// S11: Type-only import
import type { User } from '../models/user';

// S10: Dynamic import
async function loadModule() {
  const module = await import('./local-storage.utils');
  return module;
}

// O3: CommonJS require (legacy pattern)
// Note: This requires allowSyntheticDefaultImports or esModuleInterop
const legacyModule = require('./local-storage.utils');

// O4: JSON import (requires resolveJsonModule: true)
import printerConfig from '../config/printer-defaults.json';

// Use the imports to avoid unused warnings
export function useImports() {
  LocalStorageUtils.get('key');
  console.log(printerConfig);
  console.log(legacyModule);
  return loadModule();
}

export type { User };
