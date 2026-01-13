import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Printer, 
  RefreshCw, 
  Clock, 
  TrendingUp,
  Calendar,
  Activity,
  TestTube
} from 'lucide-react';

interface ClientDashboardProps {
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

export default function ClientDashboard({ agentStatus }: ClientDashboardProps) {
  const { running, health } = agentStatus;
  const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [printerName, setPrinterName] = useState('');

  // Determinar si el agente está realmente corriendo
  const isActuallyRunning = running || (health && health.status === 'ok');
  const isRealtimeConnected = isActuallyRunning && health && health.printersCount !== undefined;

  // Cargar nombre del negocio y configuración de impresora
  useEffect(() => {
    const name = localStorage.getItem('business_name') || 'Mi Negocio';
    setBusinessName(name);
    
    // Cargar printerId desde localStorage
    const savedPrinterId = localStorage.getItem('printer_id');
    const savedPrinterName = localStorage.getItem('printer_name');
    
    if (savedPrinterId) {
      setPrinterId(savedPrinterId);
    } else if (name) {
      // Generar printerId por defecto basado en business name
      const defaultId = `${name.toLowerCase().replace(/\s+/g, '-')}-printer-1`;
      setPrinterId(defaultId);
    } else {
      setPrinterId('atlas-burger-printer-1');
    }
    
    if (savedPrinterName) {
      setPrinterName(savedPrinterName);
    }
    
    // Intentar cargar desde .env si no hay en localStorage
    if (!savedPrinterId && window.electronAPI?.getEnvConfig) {
      window.electronAPI.getEnvConfig().then((result) => {
        if (result.success && result.data?.PRINTER_ID) {
          setPrinterId(result.data.PRINTER_ID);
        }
      }).catch(() => {
        // Ignorar errores
      });
    }
  }, []);

  // Cargar datos
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
    const interval = setInterval(fetchData, 15000); // Actualizar cada 15 segundos

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

  const handleTestPrint = async () => {
    if (!window.electronAPI) {
      alert('Sistema no disponible');
      return;
    }
    
    if (!printerId) {
      alert('No hay impresora configurada. Por favor, configura una impresora primero.');
      return;
    }
    
    if (!isActuallyRunning) {
      alert('El agente no está corriendo. Por favor, espera a que el sistema esté activo.');
      return;
    }
    
    setTestingPrint(true);
    try {
      const result = await window.electronAPI.testPrint(printerId);
      if (result.success) {
        alert('✅ Test de impresión enviado correctamente');
      } else {
        alert(`❌ Error: ${result.error || 'No se pudo realizar el test'}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setTestingPrint(false);
    }
  };

  // Calcular estadísticas
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayPrints = printHistory.filter(entry => {
    const printDate = new Date(entry.printedAt);
    return printDate >= today;
  });

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay()); // Domingo de esta semana
  
  const weekPrints = printHistory.filter(entry => {
    const printDate = new Date(entry.printedAt);
    return printDate >= weekStart;
  });

  const totalToday = todayPrints.reduce((sum, entry) => sum + (entry.total || 0), 0);
  const totalWeek = weekPrints.reduce((sum, entry) => sum + (entry.total || 0), 0);

  // Formatear tiempo transcurrido
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace menos de un minuto';
    if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PY', {
      style: 'currency',
      currency: 'PYG',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const displayPrinterName = printerName || (printers.length > 0 
    ? (printers[0].printerName || printers[0].name || 'Impresora Principal')
    : 'No configurada');

  return (
    <div className="space-y-6">
      {/* Header con nombre del negocio */}
      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{businessName}</h1>
            <p className="text-gray-600">Panel de Control - Sistema de Impresión</p>
          </div>
          <button
            onClick={refreshData}
            disabled={loading}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Estado del Sistema */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Estado del Agente */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isActuallyRunning ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="text-sm text-gray-500">Estado del Sistema</p>
                <p className="text-lg font-semibold">
                  {isActuallyRunning ? 'En Línea' : 'Fuera de Línea'}
                </p>
              </div>
            </div>
          </div>
          {isActuallyRunning && health?.uptime && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Activo desde: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
              </p>
            </div>
          )}
        </div>

        {/* Estado de la Impresora */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {printers.length > 0 ? (
                <Printer className="h-8 w-8 text-blue-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="text-sm text-gray-500">Impresora</p>
                <p className="text-lg font-semibold">
                  {printers.length > 0 ? 'Conectada' : 'No configurada'}
                </p>
                {displayPrinterName !== 'No configurada' && (
                  <p className="text-xs text-gray-400 mt-1">{displayPrinterName}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Estado de Realtime */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isRealtimeConnected ? (
                <Activity className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-yellow-500" />
              )}
              <div>
                <p className="text-sm text-gray-500">Impresión Automática</p>
                <p className="text-lg font-semibold">
                  {isRealtimeConnected ? 'Activa' : 'Desconectada'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Pedidos Hoy</p>
              <p className="text-3xl font-bold text-gray-900">{todayPrints.length}</p>
              {totalToday > 0 && (
                <p className="text-sm text-gray-500 mt-1">{formatCurrency(totalToday)}</p>
              )}
            </div>
            <Calendar className="h-8 w-8 text-green-600 opacity-50" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Esta Semana</p>
              <p className="text-3xl font-bold text-gray-900">{weekPrints.length}</p>
              {totalWeek > 0 && (
                <p className="text-sm text-gray-500 mt-1">{formatCurrency(totalWeek)}</p>
              )}
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600 opacity-50" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Histórico</p>
              <p className="text-3xl font-bold text-gray-900">{printHistory.length}</p>
              <p className="text-xs text-gray-500 mt-1">Últimos 100 registros</p>
            </div>
            <Clock className="h-8 w-8 text-purple-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Test de Impresión */}
      {printerId && (
        <div className="card bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Test de Impresión</h3>
              <p className="text-sm text-gray-600">
                Prueba que la impresora funcione correctamente
              </p>
            </div>
            <button
              onClick={handleTestPrint}
              disabled={testingPrint || !isActuallyRunning}
              className="btn bg-yellow-600 text-white hover:bg-yellow-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TestTube className="h-4 w-4" />
              <span>{testingPrint ? 'Enviando...' : 'Probar Impresión'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Últimos Pedidos Impresos */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Últimos Pedidos Impresos</h2>
          {printHistory.length > 0 && (
            <span className="text-sm text-gray-500">
              Mostrando {Math.min(printHistory.length, 10)} más recientes
            </span>
          )}
        </div>

        {!isActuallyRunning ? (
          <div className="text-center py-12">
            <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">El sistema está fuera de línea</p>
            <p className="text-sm text-gray-400 mt-2">
              Los pedidos aparecerán aquí cuando el sistema esté activo
            </p>
          </div>
        ) : printHistory.length === 0 ? (
          <div className="text-center py-12">
            <Printer className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No hay pedidos impresos aún</p>
            <p className="text-sm text-gray-400 mt-2">
              Los pedidos confirmados aparecerán aquí automáticamente
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {printHistory.slice(0, 10).map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Printer className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      Pedido #{entry.orderNumber || entry.orderId}
                    </p>
                    <div className="flex items-center space-x-4 mt-1">
                      <p className="text-sm text-gray-500">
                        {entry.itemsCount} item{entry.itemsCount !== 1 ? 's' : ''}
                      </p>
                      {entry.total > 0 && (
                        <p className="text-sm font-medium text-gray-700">
                          {formatCurrency(entry.total)}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {formatTimeAgo(entry.printedAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Información Adicional */}
      {!isRealtimeConnected && isActuallyRunning && (
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-start space-x-3">
            <Clock className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1">
                Impresión Automática Desconectada
              </h3>
              <p className="text-sm text-yellow-800">
                El sistema está funcionando, pero no está conectado a Supabase Realtime.
                Los pedidos no se imprimirán automáticamente hasta que se restaure la conexión.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

