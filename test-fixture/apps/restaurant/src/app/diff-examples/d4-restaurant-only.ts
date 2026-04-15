// D4: This file EXISTS ONLY IN RESTAURANT
// No corresponding file in retail

export const RESTAURANT_SPECIFIC = true;

export function sendToKitchen(orderId: string): void {
  console.log('Sending to kitchen:', orderId);
}

export class TableManager {
  assignTable(partySize: number): number {
    return Math.floor(Math.random() * 20) + 1;
  }
}
