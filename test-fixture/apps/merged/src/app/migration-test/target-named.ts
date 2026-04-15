// Target for named imports
export const NAMED_CONST = 'named-value';
export function namedHelper(x: number): number {
  return x * 2;
}
export class NamedClass {
  value = NAMED_CONST;
}
