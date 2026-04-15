// D3: This file EXISTS ONLY IN RETAIL
// No corresponding file in restaurant

export const RETAIL_SPECIFIC = true;

export function scanBarcode(code: string): boolean {
  console.log('Scanning:', code);
  return true;
}

export class InventoryManager {
  checkStock(sku: string): number {
    return 100;
  }
}
