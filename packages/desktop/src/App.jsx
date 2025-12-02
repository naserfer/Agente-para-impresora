import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [agentStatus, setAgentStatus] = useState({ running: false });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    
    // Escuchar logs en tiempo real
    window.electronAPI?.onAgentLog((data) => {
      setLogs(prev => [...prev.slice(-99), data]);
    });

    window.electronAPI?.onAgentError((data) => {
      setLogs(prev => [...prev.slice(-99), `ERROR: ${data}`]);
    });

    window.electronAPI?.onAgentStopped(() => {
      setAgentStatus({ running: false });
      setLogs(prev => [...prev, 'Agente detenido']);
    });

    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    if (window.electronAPI) {
      const status = await window.electronAPI.getAgentStatus();
      setAgentStatus(status);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    if (window.electronAPI) {
      const result = await window.electronAPI.startAgent();
      if (result.success) {
        setLogs(prev => [...prev, '✅ Agente iniciado']);
      } else {
        setLogs(prev => [...prev, `❌ Error: ${result.message}`]);
      }
    }
    setLoading(false);
    checkStatus();
  };

  const handleStop = async () => {
    setLoading(true);
    if (window.electronAPI) {
      const result = await window.electronAPI.stopAgent();
      if (result.success) {
        setLogs(prev => [...prev, '⏹️ Agente detenido']);
      } else {
        setLogs(prev => [...prev, `❌ Error: ${result.message}`]);
      }
    }
    setLoading(false);
    checkStatus();
  };

  const handleTestPrint = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.testPrint({
        printerId: 'atlas-burger-printer-1',
        tipo: 'cocina',
        data: {
          numeroPedido: 36,
          tipoPedido: 'local',
          lomiteriaNombre: 'Atlas Burger',
          items: [
            {
              nombre: 'Big Atlas',
              cantidad: 1,
              personalizaciones: null,
              notasItem: null
            }
          ],
          cliente: null,
          fecha: new Date().toISOString(),
          notas: null
        }
      });

      if (result.success) {
        setLogs(prev => [...prev, '🖨️ Test de impresión enviado']);
      } else {
        setLogs(prev => [...prev, `❌ Error: ${result.message}`]);
      }
    }
  };

  const loadLogs = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.getLogs();
      if (result.success) {
        setLogs(result.logs);
      }
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🖨️ Print Agent - Control de Impresora</h1>
        <div className="status">
          <span className={`status-indicator ${agentStatus.running ? 'running' : 'stopped'}`}>
            {agentStatus.running ? '🟢 En ejecución' : '🔴 Detenido'}
          </span>
        </div>
      </header>

      <main className="main">
        <div className="controls">
          <button 
            onClick={handleStart} 
            disabled={agentStatus.running || loading}
            className="btn btn-start"
          >
            ▶️ Iniciar Agente
          </button>
          <button 
            onClick={handleStop} 
            disabled={!agentStatus.running || loading}
            className="btn btn-stop"
          >
            ⏹️ Detener Agente
          </button>
          <button 
            onClick={handleTestPrint} 
            disabled={!agentStatus.running || loading}
            className="btn btn-test"
          >
            🖨️ Test de Impresión
          </button>
          <button 
            onClick={loadLogs} 
            className="btn btn-logs"
          >
            📋 Cargar Logs
          </button>
        </div>

        <div className="logs-container">
          <h2>Logs del Agente</h2>
          <div className="logs">
            {logs.length === 0 ? (
              <p className="no-logs">No hay logs disponibles</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-line">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

