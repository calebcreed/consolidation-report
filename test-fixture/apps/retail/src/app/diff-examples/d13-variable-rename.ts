// D13: VARIABLE NAMES differ but semantically equivalent

export function processItems(items: string[]): string[] {
  const output = items.map(x => x.toUpperCase());
  return output;
}
