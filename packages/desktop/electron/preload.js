const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Agente
  startAgent: () => ipcRenderer.invoke('agent:start'),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  getAgentStatus: () => ipcRenderer.invoke('agent:status'),
  testPrint: (data) => ipcRenderer.invoke('agent:test-print', data),
  getLogs: () => ipcRenderer.invoke('agent:get-logs'),

  // Eventos
  onAgentLog: (callback) => ipcRenderer.on('agent:log', (event, data) => callback(data)),
  onAgentError: (callback) => ipcRenderer.on('agent:error', (event, data) => callback(data)),
  onAgentStopped: (callback) => ipcRenderer.on('agent:stopped', (event, code) => callback(code)),
});

