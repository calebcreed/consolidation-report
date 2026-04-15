// D15: Restaurant has feature that was REMOVED in retail

export function baseFunction(): string {
  return 'base functionality';
}

// This feature exists in restaurant but was removed in retail
export function deprecatedFeature(): string {
  return 'deprecated - removed in retail';
}

export const LEGACY_FLAG = true;
