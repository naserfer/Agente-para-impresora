import { useState, useEffect, useRef } from 'react';
import { Trash2, Download } from 'lucide-react';

export default function LogsViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI) {
      console.warn('window.electronAPI no disponible en LogsViewer');
      return;
    }

    // Escuchar logs del agente
    const handleLog = (data: string) => {
      setLogs((prev) => [...prev, data]);
    };

    const handleStatus = (data: any) => {
      setLogs((prev) => [...prev, `[STATUS] ${JSON.stringify(data)}`]);
    };

    window.electronAPI.onAgentLog(handleLog);
    window.electronAPI.onAgentStatus(handleStatus);

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('agent-log');
        window.electronAPI.removeAllListeners('agent-status');
      }
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Logs del Agente</h2>
        <div className="flex space-x-2">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            <span>Auto-scroll</span>
          </label>
          <button
            onClick={clearLogs}
            className="btn btn-secondary flex items-center space-x-2 text-sm"
          >
            <Trash2 className="h-4 w-4" />
            <span>Limpiar</span>
          </button>
          <button
            onClick={downloadLogs}
            className="btn btn-secondary flex items-center space-x-2 text-sm"
          >
            <Download className="h-4 w-4" />
            <span>Descargar</span>
          </button>
        </div>
      </div>

      <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No hay logs aún. Los logs aparecerán aquí cuando el agente esté corriendo.
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              {log}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

