import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Printer, RefreshCw, Clock, Activity, TestTube } from 'lucide-react';

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

function normalizePrinterId(value: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/burguer/g, 'burger')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
      setPrinterId(normalizePrinterId(savedPrinterId));
    } else if (name) {
      // Generar printerId por defecto basado en business name
      const defaultId = normalizePrinterId(`${name}-printer-1`);
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
          setPrinterId(normalizePrinterId(result.data.PRINTER_ID));
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
      const result = await window.electronAPI.testPrint(normalizePrinterId(printerId));
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

  // Calcular estadísticas compactas
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayPrints = printHistory.filter(entry => {
    const printDate = new Date(entry.printedAt);
    return printDate >= today;
  });

  const totalToday = todayPrints.reduce((sum, entry) => sum + (entry.total || 0), 0);

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
    <div className="grid grid-cols-3 gap-3 h-full">
      <section className="card col-span-2 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{businessName}</h1>
            <p className="text-xs text-slate-500">Estado operativo del agente</p>
          </div>
          <button onClick={refreshData} disabled={loading} className="btn btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Sistema</p>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              {isActuallyRunning ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
              <span>{isActuallyRunning ? 'Activo' : 'Inactivo'}</span>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Impresora</p>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              <Printer className="h-4 w-4 text-slate-600" />
              <span className="truncate">{displayPrinterName}</span>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Automática</p>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              {isRealtimeConnected ? <Activity className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
              <span>{isRealtimeConnected ? 'Conectada' : 'Polling'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-slate-500">Pedidos hoy</p>
            <p className="text-2xl font-semibold">{todayPrints.length}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-slate-500">Total hoy</p>
            <p className="text-lg font-semibold truncate">{formatCurrency(totalToday)}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-slate-500">Histórico</p>
            <p className="text-2xl font-semibold">{printHistory.length}</p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 overflow-hidden flex-1">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-sm font-medium">Últimas impresiones</div>
          <div className="divide-y divide-slate-100">
            {printHistory.slice(0, 4).map((entry, index) => (
              <div key={index} className="px-3 py-2 text-sm flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">Pedido #{entry.orderNumber || entry.orderId}</p>
                  <p className="text-xs text-slate-500">{entry.itemsCount} item(s) · {formatTimeAgo(entry.printedAt)}</p>
                </div>
                <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              </div>
            ))}
            {printHistory.length === 0 && (
              <div className="px-3 py-4 text-sm text-slate-500">Sin actividad reciente.</div>
            )}
          </div>
        </div>
      </section>

      <aside className="card flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Acciones rápidas</p>
          <p className="text-xs text-slate-500">Operación diaria</p>
        </div>
        <button
          onClick={handleTestPrint}
          disabled={testingPrint || !isActuallyRunning || !printerId}
          className="btn btn-primary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <TestTube className="h-4 w-4" />
          {testingPrint ? 'Enviando...' : 'Test impresión'}
        </button>
        <div className="rounded-md border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
          <p><span className="font-medium">Printer ID:</span> {printerId || '—'}</p>
          <p className="truncate"><span className="font-medium">Impresora:</span> {displayPrinterName}</p>
        </div>
        {!isRealtimeConnected && isActuallyRunning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Realtime no disponible. Operando con polling.
          </div>
        )}
      </aside>
    </div>
  );
}

