import { useState, useEffect } from 'react';
import { Save, Printer, Loader, CheckCircle } from 'lucide-react';

interface Printer {
  name: string;
  portName: string;
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
            savedPrinterId = envResult.data.PRINTER_ID;
          }
        }
      } catch (error) {
        console.log('No se pudo cargar configuración desde .env:', error);
      }
    }

    // Establecer printerId
    if (savedPrinterId) {
      setPrinterId(savedPrinterId);
    } else if (savedBusinessName) {
      // Generar printerId por defecto basado en business name
      const defaultId = `${savedBusinessName.toLowerCase().replace(/\s+/g, '-')}-printer-1`;
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
      const result = await window.electronAPI.configurePrinter({
        printerId,
        type: 'usb',
        printerName: selectedPrinter,
      });

      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        
        // Guardar también en localStorage para persistencia
        localStorage.setItem('printer_id', printerId);
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
      const result = await window.electronAPI.testPrint(printerId);
      
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
    <div className="card max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Configuración de Impresora</h2>

      <div className="space-y-4">
        <div>
          <label className="label">Impresoras Disponibles</label>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="h-6 w-6 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-500">Cargando impresoras...</span>
            </div>
          ) : printers.length === 0 ? (
            <div className="p-4 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
              No se encontraron impresoras. Asegúrate de que la impresora esté instalada en Windows.
            </div>
          ) : (
            <select
              className="input"
              value={selectedPrinter}
              onChange={(e) => setSelectedPrinter(e.target.value)}
            >
              <option value="">Selecciona una impresora</option>
              {printers.map((printer, index) => (
                <option key={index} value={printer.name}>
                  {printer.name} ({printer.portName})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={loadPrinters}
            disabled={loading}
            className="mt-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {loading ? (
              <>
                <Loader className="h-3 w-3 animate-spin" />
                <span>Buscando...</span>
              </>
            ) : (
              <span>Actualizar lista</span>
            )}
          </button>
        </div>

        <div>
          <label className="label">Printer ID</label>
          <input
            type="text"
            className="input"
            placeholder="atlas-burger-printer-1"
            value={printerId}
            onChange={(e) => setPrinterId(e.target.value)}
          />
          <p className="mt-1 text-sm text-gray-500">
            ID único que identifica esta impresora (debe coincidir con el configurado en Supabase)
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={saveConfiguration}
            disabled={saving || !selectedPrinter || !printerId}
            className="btn btn-primary flex items-center space-x-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{saved ? 'Guardado ✓' : 'Guardar Configuración'}</span>
              </>
            )}
          </button>

          <button
            onClick={testPrint}
            disabled={testing || !printerId}
            className="btn btn-secondary flex items-center space-x-2 disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                <span>Imprimiendo...</span>
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                <span>Probar Impresión</span>
              </>
            )}
          </button>
        </div>

        {testResult && (
          <div className={`p-4 rounded-lg ${
            testResult.success 
              ? 'bg-green-50 text-green-800' 
              : 'bg-red-50 text-red-800'
          }`}>
            <p className="text-sm font-medium">
              {testResult.success ? '✅ ' : '❌ '}
              {testResult.message}
            </p>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> El Printer ID debe coincidir exactamente con el configurado en la tabla <code>printer_config</code> de Supabase.
          </p>
        </div>
      </div>
    </div>
  );
}

