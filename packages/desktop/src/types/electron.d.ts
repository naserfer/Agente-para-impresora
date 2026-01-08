export interface ElectronAPI {
  getAgentStatus: () => Promise<{ running: boolean }>;
  startAgent: () => Promise<{ success: boolean; message?: string }>;
  stopAgent: () => Promise<{ success: boolean; message?: string }>;
  getAgentHealth: () => Promise<{ success: boolean; data?: any; error?: string }>;
  getPrintHistory: () => Promise<{ success: boolean; data?: any[]; count?: number; error?: string }>;
  getPrintersList: () => Promise<{ success: boolean; data?: any[]; count?: number; error?: string }>;
  configurePrinter: (config: {
    printerId: string;
    type: string;
    printerName: string;
  }) => Promise<{ success: boolean; data?: any; error?: string }>;
  listPrinters: () => Promise<{ success: boolean; data?: any; error?: string }>;
  testPrint: (printerId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onAgentLog: (callback: (data: string) => void) => void;
  onAgentStatus: (callback: (data: any) => void) => void;
  onMainProcessLog?: (callback: (data: { message: string; level: string; timestamp: string }) => void) => void;
  removeAllListeners: (channel: string) => void;
  saveEnvConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  getEnvConfig: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

