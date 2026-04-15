// O1: Type declaration file (.d.ts)
// These provide types for external/native code without implementation

declare namespace NativeEngine {
  interface PrinterConfig {
    ip: string;
    port: number;
    paperWidth: number;
  }

  interface PaymentResult {
    success: boolean;
    transactionId: string;
    error?: string;
  }

  function initializePrinter(config: PrinterConfig): Promise<void>;
  function processPayment(amount: number): Promise<PaymentResult>;
  function getDeviceInfo(): { model: string; serial: string };
}

declare module 'native-bridge' {
  export = NativeEngine;
}
