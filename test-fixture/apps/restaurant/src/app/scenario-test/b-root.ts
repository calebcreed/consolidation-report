// SCENARIO 1: Root node B (depends on C and D)
// When this subtree migrates, B, C, D should all move together atomically
import { C_VALUE, cHelper } from './c-leaf';
import { D_VALUE, dHelper } from './d-leaf';

export function bCombined(): string {
  return cHelper() + dHelper() + C_VALUE + D_VALUE;
}
