export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export type PaymentMethod = 'card' | 'cash' | 'gift';
