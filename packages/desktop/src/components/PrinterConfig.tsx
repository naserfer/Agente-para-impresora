import { useState, useEffect } from 'react';
import { Save, Printer, Loader, CheckCircle } from 'lucide-react';

interface Printer {
  name: string;
  portName: string;
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

export default function PrinterConfig() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Cargar configuración guardada primero
    loadSavedConfiguration();
    // NO cargar impresoras automáticamente - solo si no hay configuración guardada
  }, []);

  const loadSavedConfiguration = async () => {
    // Intentar cargar desde localStorage primero
    let savedPrinterId = localStorage.getItem('printer_id');
    let savedPrinterName = localStorage.getItem('printer_name');
    const savedBusinessName = localStorage.getItem('business_name');

    // Si no hay en localStorage, intentar cargar desde el archivo guardado en el main process
    if (!savedPrinterName && window.electronAPI?.getEnvConfig) {
      try {
        const envResult = await window.electronAPI.getEnvConfig();
        if (envResult.success && envResult.data) {
          // El PRINTER_ID puede estar en el .env
          if (envResult.data.PRINTER_ID && !savedPrinterId) {
            savedPrinterId = normalizePrinterId(envResult.data.PRINTER_ID);
          }
        }
      } catch (error) {
        console.log('No se pudo cargar configuración desde .env:', error);
      }
    }

    // Establecer printerId
    if (savedPrinterId) {
      setPrinterId(normalizePrinterId(savedPrinterId));
    } else if (savedBusinessName) {
      // Generar printerId por defecto basado en business name
      const defaultId = normalizePrinterId(`${savedBusinessName}-printer-1`);
      setPrinterId(defaultId);
    } else {
      // Fallback al valor por defecto
      setPrinterId('atlas-burger-printer-1');
    }

    // Si hay una impresora guardada, mostrarla aunque no se cargue la lista
    if (savedPrinterName) {
      setSelectedPrinter(savedPrinterName);
      // Agregar la impresora guardada a la lista para que se muestre
      setPrinters([{
        name: savedPrinterName,
        portName: 'USB' // Valor por defecto, se actualizará si se carga la lista
      }]);
      console.log('✅ Impresora guardada cargada:', savedPrinterName);
    }
    // Si NO hay impresora guardada, NO cargar automáticamente - el usuario puede hacer clic en "Actualizar lista"
  };

  const loadPrinters = async () => {
    if (!window.electronAPI) {
      console.warn('window.electronAPI no disponible');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.listPrinters();
      console.log('Resultado de listPrinters:', result);
      if (result.success && Array.isArray(result.data)) {
        setPrinters(result.data);
      } else if (result.success && result.data?.printers) {
        // Formato alternativo
        setPrinters(result.data.printers);
      } else {
        console.warn('No se encontraron impresoras o formato incorrecto:', result);
        setPrinters([]);
      }
    } catch (error) {
      console.error('Error loading printers:', error);
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    if (!window.electronAPI) {
      alert('window.electronAPI no disponible');
      return;
    }

    if (!selectedPrinter || !printerId) {
      alert('Por favor selecciona una impresora e ingresa un ID');
      return;
    }

    setSaving(true);
    try {
      const normalizedPrinterId = normalizePrinterId(printerId);
      const result = await window.electronAPI.configurePrinter({
        printerId: normalizedPrinterId,
        type: 'usb',
        printerName: selectedPrinter,
      });

      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        
        // Guardar también en localStorage para persistencia
        localStorage.setItem('printer_id', normalizedPrinterId);
        localStorage.setItem('printer_name', selectedPrinter);
        
        // Mostrar advertencia si el agente no está disponible pero se guardó localmente
        if (result.warning) {
          console.warn('Advertencia:', result.warning);
          // No mostrar alerta molesta, solo log
        }
      } else {
        alert(`Error: ${result.error || 'No se pudo configurar la impresora'}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const testPrint = async () => {
    if (!window.electronAPI) {
      alert('window.electronAPI no disponible');
      return;
    }

    if (!printerId) {
      alert('Por favor ingresa un Printer ID primero');
      return;
    }

    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await window.electronAPI.testPrint(normalizePrinterId(printerId));
      
      if (result.success) {
        setTestResult({ success: true, message: result.message || 'Impresión de prueba enviada correctamente' });
        setTimeout(() => setTestResult(null), 5000);
      } else {
        setTestResult({ success: false, message: result.error || 'Error al imprimir' });
        setTimeout(() => setTestResult(null), 5000);
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Error desconocido' });
      setTimeout(() => setTestResult(null), 5000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden py-2">
      <div className="card max-w-2xl w-full mx-auto overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Configuración de impresora</h2>
        <button onClick={loadPrinters} disabled={loading} className="btn btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5">
          {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {loading ? 'Buscando...' : 'Actualizar'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Impresora del sistema (Windows)</label>
          {loading ? (
            <div className="h-10 border border-slate-200 rounded-md flex items-center justify-center text-sm text-slate-500">
              <Loader className="h-4 w-4 animate-spin mr-2" /> Cargando...
            </div>
          ) : (
            <select className="input text-sm" value={selectedPrinter} onChange={(e) => setSelectedPrinter(e.target.value)}>
              <option value="">Selecciona una impresora</option>
              {printers.map((printer, index) => (
                <option key={index} value={printer.name}>
                  {printer.name} ({printer.portName})
                </option>
              ))}
            </select>
          )}
          {printers.length === 0 && !loading && (
            <p className="mt-2 text-xs text-amber-700">No se detectaron impresoras instaladas en Windows.</p>
          )}
        </div>

        <div>
          <label className="label">Identificador de impresora (Printer ID)</label>
          <input type="text" className="input text-sm" placeholder="Ej: mi-negocio-caja-1" value={printerId} onChange={(e) => setPrinterId(normalizePrinterId(e.target.value))} />
          <p className="mt-2 text-xs text-slate-500">Debe coincidir exactamente con el valor configurado en tu base de datos.</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={saveConfiguration} disabled={saving || !selectedPrinter || !printerId} className="btn btn-primary text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? 'Guardado' : 'Guardar configuración'}
        </button>

        <button onClick={testPrint} disabled={testing || !printerId} className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
          {testing ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {testing ? 'Enviando prueba...' : 'Enviar prueba'}
        </button>
      </div>

      {testResult && (
        <div className={`mt-3 p-2.5 rounded-md text-sm ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {testResult.success ? '✅ ' : '❌ '}
          {testResult.message}
        </div>
      )}
      </div>
    </div>
  );
}

