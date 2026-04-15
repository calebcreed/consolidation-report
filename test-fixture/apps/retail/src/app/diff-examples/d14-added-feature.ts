// D14: Retail has ADDED FEATURE not in restaurant

export function baseFunction(): string {
  return 'base functionality';
}

// This feature was added in retail only
export function newRetailFeature(): string {
  return 'new retail-only feature';
}

export const RETAIL_FLAG = true;
