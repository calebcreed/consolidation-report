// O2: Triple-slash directive
/// <reference path="../typings/linga-engine.d.ts" />

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NativeBridgeService {
  private initialized = false;

  async initPrinter(config: LingaEngine.PrinterConfig): Promise<void> {
    await LingaEngine.initializePrinter(config);
    this.initialized = true;
  }

  async print(content: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Printer not initialized');
    }

    const job: LingaEngine.PrintJob = {
      id: crypto.randomUUID(),
      content,
      config: { printerName: 'default', paperWidth: 80, dpi: 203 }
    };

    return LingaEngine.print(job);
  }

  getStatus(): string {
    return LingaEngine.getPrinterStatus();
  }
}
