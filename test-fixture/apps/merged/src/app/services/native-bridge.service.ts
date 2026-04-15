// O2: Triple-slash directive - references type declaration file
/// <reference path="../typings/native-engine.d.ts" />

import { Injectable } from '@angular/core';

// O4: JSON import (requires resolveJsonModule in tsconfig)
// import config from '../config/printer-defaults.json';

// O3: require() - CommonJS style (sometimes used for dynamic/conditional loading)
// const legacyModule = require('../legacy/old-printer');

@Injectable({ providedIn: 'root' })
export class NativeBridgeService {

  // Using types from the .d.ts file
  private printerConfig: NativeEngine.PrinterConfig = {
    ip: '192.168.1.100',
    port: 9100,
    paperWidth: 80
  };

  async initPrinter(): Promise<void> {
    // O1: Using declared namespace from .d.ts
    await NativeEngine.initializePrinter(this.printerConfig);
  }

  async processPayment(amount: number): Promise<NativeEngine.PaymentResult> {
    return NativeEngine.processPayment(amount);
  }

  getDeviceInfo() {
    return NativeEngine.getDeviceInfo();
  }
}
