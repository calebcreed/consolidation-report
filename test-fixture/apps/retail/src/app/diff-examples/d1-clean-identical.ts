// D1: This file is IDENTICAL in both restaurant and retail
// It should be detected as CLEAN and safe to migrate

export const SHARED_CONSTANT = 'same in both branches';

export function sharedFunction(x: number): number {
  return x * 2;
}

export class SharedClass {
  getValue(): string {
    return 'identical';
  }
}
