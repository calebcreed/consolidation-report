// All export patterns in one file

// Named exports
export const CONSTANT_A = 'a';
export const CONSTANT_B = 'b';

export function namedFunction() {
  return 'named';
}

export class NamedClass {
  value = 'named class';
}

export interface NamedInterface {
  prop: string;
}

export type NamedType = string | number;

// Default export (only one per file)
const defaultExport = {
  name: 'default',
  getValue: () => 'default value'
};
export default defaultExport;

// Export list (batch export)
const internalA = 1;
const internalB = 2;
export { internalA, internalB };

// Export with rename
const originalName = 'original';
export { originalName as renamedExport };
