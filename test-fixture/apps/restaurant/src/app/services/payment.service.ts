import { Injectable } from '@angular/core';

// S4: baseUrl import - 'Payments/...' resolves to 'src/Payments/...' via baseUrl: "src"
import { CardProcessorService } from 'Payments/processors/card-processor.service';
import { PaymentResult, PaymentMethod } from 'Payments/payment-types';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private cardProcessor: CardProcessorService) {}

  pay(method: PaymentMethod, amount: number): PaymentResult {
    if (method === 'card') {
      const success = this.cardProcessor.processPayment(amount);
      return { success };
    }
    return { success: true };
  }
}
