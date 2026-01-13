const { contextBridge, ipcRenderer } = require('electron');

console.log('🔧 Preload script cargando...');

// Exponer APIs seguras al renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Agent control
  getAgentStatus: () => ipcRenderer.invoke('get-agent-status'),
  startAgent: () => ipcRenderer.invoke('start-agent'),
  stopAgent: () => ipcRenderer.invoke('stop-agent'),
  getAgentHealth: () => ipcRenderer.invoke('get-agent-health'),
  getAgentDebugInfo: () => ipcRenderer.invoke('get-agent-debug-info'),
  getPrintHistory: () => ipcRenderer.invoke('get-print-history'),
  getPrintersList: () => ipcRenderer.invoke('get-printers-list'),

  // Printer configuration
  configurePrinter: (config) => ipcRenderer.invoke('configure-printer', config),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  testPrint: (printerId) => ipcRenderer.invoke('test-print', printerId),

  // Configuration
  saveEnvConfig: (config) => ipcRenderer.invoke('save-env-config', config),
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  resetConfig: () => ipcRenderer.invoke('reset-config'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),

  // Listeners
  onAgentLog: (callback) => {
    ipcRenderer.on('agent-log', (event, data) => callback(data));
  },
  onAgentStatus: (callback) => {
    ipcRenderer.on('agent-status', (event, data) => callback(data));
  },
  onMainProcessLog: (callback) => {
    ipcRenderer.on('main-process-log', (event, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

console.log('✅ Preload script cargado - electronAPI expuesto');
