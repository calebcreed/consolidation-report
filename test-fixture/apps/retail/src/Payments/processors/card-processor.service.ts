import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CardProcessorService {
  processPayment(amount: number): boolean {
    console.log('Processing card payment:', amount);
    return true;
  }
}
