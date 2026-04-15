// Uses barrel imports
import { ItemA, ItemB, ITEM_A_VALUE, AllB } from './barrel';

export function useBarrel(): string {
  const a = new ItemA();
  const b = new ItemB();
  return a.name + b.name + ITEM_A_VALUE + AllB.ITEM_B_VALUE;
}
