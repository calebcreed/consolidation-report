// D13: VARIABLE NAMES differ but semantically equivalent

export function processItems(items: string[]): string[] {
  const result = items.map(item => item.toUpperCase());
  return result;
}
