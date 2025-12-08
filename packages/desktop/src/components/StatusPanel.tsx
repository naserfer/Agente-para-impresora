import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Printer, RefreshCw } from 'lucide-react';

interface StatusPanelProps {
  agentStatus: {
    running: boolean;
    health: any;
  };
}

interface PrintHistoryEntry {
  orderId: string;
  orderNumber?: string;
  printerId: string;
  itemsCount: number;
  total: number;
  printedAt: string;
}

export default function StatusPanel({ agentStatus }: StatusPanelProps) {
  const { running, health } = agentStatus;
  const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Determinar si el agente está realmente corriendo basado en health
  const isActuallyRunning = running || (health && health.status === 'ok');
  const isRealtimeConnected = isActuallyRunning && health && health.printersCount !== undefined;

  useEffect(() => {
    if (!isActuallyRunning || !window.electronAPI) return;

    const fetchData = async () => {
      try {
        const [historyResult, printersResult] = await Promise.all([
          window.electronAPI.getPrintHistory(),
          window.electronAPI.getPrintersList(),
        ]);

        if (historyResult.success) {
          setPrintHistory(historyResult.data || []);
        }

        if (printersResult.success) {
          setPrinters(printersResult.data || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Actualizar cada 10 segundos

    return () => clearInterval(interval);
  }, [isActuallyRunning]);

  const refreshData = async () => {
    if (!window.electronAPI || !isActuallyRunning) return;
    setLoading(true);
    try {
      const [historyResult, printersResult] = await Promise.all([
        window.electronAPI.getPrintHistory(),
        window.electronAPI.getPrintersList(),
      ]);

      if (historyResult.success) {
        setPrintHistory(historyResult.data || []);
      }

      if (printersResult.success) {
        setPrinters(printersResult.data || []);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Estado del Sistema</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Estado del Agente */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {isActuallyRunning ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <p className="font-medium">Agente</p>
                <p className="text-sm text-gray-500">
                  {isActuallyRunning ? 'Corriendo' : 'Detenido'}
                </p>
              </div>
            </div>
          </div>

          {/* Estado de Realtime */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {isRealtimeConnected ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <p className="font-medium">Supabase Realtime</p>
                <p className="text-sm text-gray-500">
                  {isRealtimeConnected ? 'Conectado' : 'Desconectado'}
                </p>
              </div>
            </div>
          </div>

          {/* Uptime */}
          {health && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Clock className="h-6 w-6 text-blue-500" />
                <div>
                  <p className="font-medium">Tiempo Activo</p>
                  <p className="text-sm text-gray-500">
                    {Math.floor(health.uptime / 60)} minutos
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Impresoras */}
          {health && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Printer className="h-6 w-6 text-purple-500" />
                <div>
                  <p className="font-medium">Impresoras</p>
                  <p className="text-sm text-gray-500">
                    {health.printersCount || 0} configurada(s)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Impresoras Configuradas */}
      {(printers.length > 0 || (health?.printers && health.printers.length > 0)) && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Impresoras Configuradas</h2>
          <div className="space-y-2">
            {(printers.length > 0 ? printers : health.printers || []).map((printer: any, index: number) => {
              const printerName = typeof printer === 'string' ? printer : (printer.name || printer.id);
              const printerId = typeof printer === 'string' ? printer : printer.id;
              return (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Printer className="h-5 w-5 text-gray-400" />
                    <div>
                      <span className="font-medium">{printerName}</span>
                      {printerId && printerId !== printerName && (
                        <p className="text-xs text-gray-500">{printerId}</p>
                      )}
                    </div>
                  </div>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                    Activa
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimos Pedidos */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Últimos Pedidos Impresos</h2>
          <button
            onClick={refreshData}
            disabled={loading || !running}
            className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
        
        {!isActuallyRunning ? (
          <div className="text-center py-8 text-gray-500">
            <p>El agente debe estar activo para ver el historial</p>
          </div>
        ) : printHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No hay pedidos impresos aún</p>
            <p className="text-sm mt-2">Los pedidos aparecerán aquí cuando se impriman</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {printHistory.map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <Printer className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">
                      Pedido #{entry.orderNumber || entry.orderId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {entry.itemsCount} item(s) • ${entry.total.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(entry.printedAt).toLocaleString('es-ES')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{entry.printerId}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

