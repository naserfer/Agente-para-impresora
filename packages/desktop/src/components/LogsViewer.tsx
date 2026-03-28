import { useState, useEffect, useRef } from 'react';
import { Trash2, Download } from 'lucide-react';

function isNoisyHealthLog(line: string): boolean {
  return line.includes('"message":"GET /health"') ||
         line.includes('"message":"GET /api/history"') ||
         line.includes('"message":"GET /api/printers"');
}

export default function LogsViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [fileLogs, setFileLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI) {
      console.warn('window.electronAPI no disponible en LogsViewer');
      return;
    }

    // Escuchar logs del agente
    const handleLog = (data: string) => {
      if (isNoisyHealthLog(data)) return;
      setLogs((prev) => [...prev, `[AGENT] ${data}`]);
    };

    const handleStatus = (data: any) => {
      setLogs((prev) => [...prev, `[STATUS] ${JSON.stringify(data)}`]);
    };

    const handleMainLog = (data: any) => {
      const prefix = data.level === 'error' ? '❌ [MAIN]' : data.level === 'warn' ? '⚠️ [MAIN]' : 'ℹ️ [MAIN]';
      setLogs((prev) => [...prev, `${prefix} ${data.message}`]);
    };

    if (!window.electronAPI) {
      setLogs(['[ERROR] window.electronAPI no está disponible']);
      return;
    }
    
    // Agregar log inicial
    setLogs(['[SYSTEM] LogsViewer inicializado - Esperando logs del agente...']);
    
    // Configurar listeners
    try {
      window.electronAPI.onAgentLog(handleLog);
      window.electronAPI.onAgentStatus(handleStatus);
      if (window.electronAPI.onMainProcessLog) {
        window.electronAPI.onMainProcessLog(handleMainLog);
      }
      setLogs((prev) => [...prev, '[SYSTEM] Listeners configurados correctamente']);
      
      // Enviar un mensaje de prueba al proceso principal
      setTimeout(() => {
        setLogs((prev) => [...prev, '[SYSTEM] Enviando solicitud de prueba al proceso principal...']);
        // Intentar obtener el estado del agente como prueba
        window.electronAPI.getAgentStatus().then((status) => {
          setLogs((prev) => [...prev, `[SYSTEM] ✅ Comunicación IPC funcionando - Estado: ${JSON.stringify(status)}`]);
        }).catch((err) => {
          setLogs((prev) => [...prev, `[SYSTEM] ❌ Error en comunicación IPC: ${err.message}`]);
        });
      }, 1000);
    } catch (error: any) {
      setLogs((prev) => [...prev, `[ERROR] Error configurando listeners: ${error.message}`]);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('agent-log');
        window.electronAPI.removeAllListeners('agent-status');
        if (window.electronAPI.removeAllListeners) {
          window.electronAPI.removeAllListeners('main-process-log');
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.getAgentLogTail) return;

    let active = true;
    const poll = async () => {
      try {
        const result = await window.electronAPI.getAgentLogTail(140);
        if (!active) return;
        if (result?.success && Array.isArray(result.data)) {
          setFileLogs(
            result.data
              .filter((line) => !isNoisyHealthLog(line))
              .map((line) => `[AGENT] ${line}`)
          );
        }
      } catch {
        // Silent: el stream IPC sigue siendo la fuente principal.
      }
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, fileLogs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
    setFileLogs([]);
  };

  const downloadLogs = () => {
    const content = [...logs, ...fileLogs].join('\n');
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
        {[...logs, ...fileLogs].length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No hay logs aún. Los logs aparecerán aquí cuando el agente esté corriendo.
            <br />
            <span className="text-xs mt-2 block">Revisa la pestaña "Estado" y haz clic en "Info de Debug" para más información.</span>
          </div>
        ) : (
          [...logs, ...fileLogs].map((log, index) => {
            const isError = log.includes('❌') || log.includes('[MAIN]') && log.includes('ERROR');
            const isWarning = log.includes('⚠️') || log.includes('[MAIN]') && log.includes('WARN');
            return (
              <div 
                key={index} 
                className={`mb-1 ${isError ? 'text-red-400' : isWarning ? 'text-yellow-400' : ''}`}
              >
                {log}
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

