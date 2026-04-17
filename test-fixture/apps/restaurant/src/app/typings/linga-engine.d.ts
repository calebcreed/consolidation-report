// O1: Type declaration file (.d.ts)
declare namespace LingaEngine {
  interface PrinterConfig {
    printerName: string;
    paperWidth: number;
    dpi: number;
  }

  interface PrintJob {
    id: string;
    content: string;
    config: PrinterConfig;
  }

  function initializePrinter(config: PrinterConfig): Promise<void>;
  function print(job: PrintJob): Promise<boolean>;
  function getPrinterStatus(): 'ready' | 'busy' | 'error' | 'offline';
}

declare module 'linga-engine' {
  export = LingaEngine;
}
