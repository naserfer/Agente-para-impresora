import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Printer, Database, Settings } from 'lucide-react';

interface SetupWizardProps {
  onComplete: (config: any) => void;
}

type Step = 'welcome' | 'supabase' | 'printer' | 'complete';

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [config, setConfig] = useState({
    supabaseUrl: '',
    supabaseKey: '',
    printerId: '',
    printerName: '',
    businessName: ''
  });
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const steps = {
    welcome: { title: '¡Bienvenido!', icon: Settings },
    supabase: { title: 'Conexión a Supabase', icon: Database },
    printer: { title: 'Configurar Impresora', icon: Printer },
    complete: { title: 'Listo', icon: Check }
  };

  const loadPrinters = async () => {
    if (!window.electronAPI?.listPrinters) {
      console.error('listPrinters no disponible');
      return;
    }

    // DETECCIÓN DIRECTA: Ya no necesita el agente corriendo
    // La detección ahora funciona directamente desde Electron usando PowerShell
    console.log('🔍 Buscando impresoras directamente (sin agente)...');
    setLoadingPrinters(true);

    try {
      const result = await window.electronAPI.listPrinters();
      console.log('Resultado de listPrinters:', result);
      
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        setAvailablePrinters(result.data);
        console.log(`✅ ${result.data.length} impresora(s) encontrada(s)`);
      } else {
        console.warn('No se encontraron impresoras o formato incorrecto:', result);
        if (result.error) {
          console.error('Error al listar impresoras:', result.error);
        }
        setAvailablePrinters([]);
        // Si no hay impresoras, puede ser que realmente no haya ninguna instalada
        // No es un error crítico, solo mostrar lista vacía
      }
    } catch (error) {
      console.error('Error loading printers:', error);
      setAvailablePrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  const testSupabaseConnection = async () => {
    if (!config.supabaseUrl || !config.supabaseKey) {
      setTestResult({ success: false, message: 'Por favor completa todos los campos' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Importar Supabase client dinámicamente
      const { createClient } = await import('@supabase/supabase-js');

      const supabase = createClient(config.supabaseUrl, config.supabaseKey);

      // Probar conexión simple
      const { error } = await supabase.from('tenants').select('count').limit(1);

      if (error) {
        setTestResult({
          success: false,
          message: `Error: ${error.message}`
        });
        return false;
      } else {
        setTestResult({
          success: true,
          message: '✅ Conexión exitosa'
        });
        return true;
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Error: ${error.message}`
      });
      return false;
    } finally {
      setTesting(false);
    }
  };

  // Cargar configuración existente del .env embebido
  useEffect(() => {
    const checkEmbeddedConfig = async () => {
      if (!window.electronAPI?.getEnvConfig) return;

      try {
        const result = await window.electronAPI.getEnvConfig();
        if (result.success && result.data) {
          const envConfig = result.data;

          console.log('Configuración encontrada:', envConfig);

          // Cargar también desde localStorage como fallback
          const savedPrinterName = localStorage.getItem('printer_name') || '';
          const savedPrinterId = localStorage.getItem('printer_id') || '';

          // Pre-llenar datos
          setConfig(prev => ({
            ...prev,
            supabaseUrl: envConfig.SUPABASE_URL || '',
            supabaseKey: envConfig.SUPABASE_ANON_KEY || '',
            printerId: envConfig.PRINTER_ID || savedPrinterId || '',
            printerName: savedPrinterName || '', // Cargar nombre de impresora guardado
            businessName: envConfig.CLIENT_NAME || '', // Leer CLIENT_NAME si existe
          }));

          // IMPORTANTE: Solo saltar pasos si TODOS los datos están completos
          // Si falta el nombre del negocio, SIEMPRE mostrar el paso 'welcome' primero
          if (envConfig.CLIENT_NAME && envConfig.SUPABASE_URL && envConfig.SUPABASE_ANON_KEY) {
            // Si TODO está completo (nombre, supabase), saltar hasta impresora
            setTimeout(async () => {
              setCurrentStep('printer');
              // NO llamar loadPrinters aquí - el useEffect lo hará automáticamente
            }, 1000);
          } else if (envConfig.CLIENT_NAME && (!envConfig.SUPABASE_URL || !envConfig.SUPABASE_ANON_KEY)) {
            // Si hay nombre pero falta Supabase, ir a paso de Supabase
            setTimeout(async () => {
              setCurrentStep('supabase');
            }, 1000);
          }
          // Si NO hay CLIENT_NAME, quedarse en 'welcome' (paso inicial) para que el usuario lo ingrese
        }
      } catch (error) {
        console.error('Error cargando configuración embebida:', error);
      }
    };

    checkEmbeddedConfig();
  }, []);

  // Cargar impresoras automáticamente cuando se llega al paso de impresora
  useEffect(() => {
    if (currentStep === 'printer') {
      // Si ya hay una impresora guardada, no cargar automáticamente
      // Solo cargar si no hay impresora seleccionada
      if (!config.printerName) {
        // Esperar un momento para asegurar que el componente esté listo
        const timer = setTimeout(() => {
          console.log('🔍 Cargando impresoras desde useEffect...');
          loadPrinters();
        }, 300);
        
        return () => clearTimeout(timer);
      } else {
        // Si ya hay impresora guardada, cargar la lista para mostrarla
        // pero mantener la selección
        const timer = setTimeout(() => {
          console.log('🔍 Cargando lista de impresoras (impresora ya seleccionada)...');
          loadPrinters();
        }, 300);
        
        return () => clearTimeout(timer);
      }
    }
  }, [currentStep]);

  const handleNext = async () => {
    if (currentStep === 'welcome') {
      setCurrentStep('supabase');
    } else if (currentStep === 'supabase') {
      // Validar Supabase antes de continuar
      if (!config.supabaseUrl || !config.supabaseKey) {
        setTestResult({ success: false, message: 'Por favor completa todos los campos' });
        return;
      }
      // Cargar impresoras al avanzar al paso de impresora
      setCurrentStep('printer');
      // NO llamar loadPrinters aquí - el useEffect lo hará automáticamente
    } else if (currentStep === 'printer') {
      setCurrentStep('complete');
    } else if (currentStep === 'complete') {
      setFinishing(true);
      try {
        // Guardar configuración y registrar la impresora en el agente de una vez
        await saveConfiguration();
        if (window.electronAPI?.configurePrinter && config.printerId && config.printerName) {
          try {
            await window.electronAPI.configurePrinter({
              printerId: config.printerId,
              type: 'usb',
              printerName: config.printerName,
            });
          } catch (e) {
            console.warn('No se pudo configurar la impresora en el agente (¿está iniciado?):', e);
          }
        }
        onComplete(config);
      } finally {
        setFinishing(false);
      }
    }
  };

  const handleBack = () => {
    if (currentStep === 'supabase') {
      setCurrentStep('welcome');
    } else if (currentStep === 'printer') {
      setCurrentStep('supabase');
    } else if (currentStep === 'complete') {
      setCurrentStep('printer');
    }
  };

  const saveConfiguration = async () => {
    if (!window.electronAPI?.saveEnvConfig) return;

    const envConfig = {
      SUPABASE_URL: config.supabaseUrl,
      SUPABASE_ANON_KEY: config.supabaseKey,
      CLIENT_NAME: config.businessName, // Guardar nombre del negocio
      PRINTER_ID: config.printerId, // Guardar ID de impresora
      ENABLE_SUPABASE_LISTENER: 'true',
      PORT: '3001',
      LOG_LEVEL: 'info'
    };

    try {
      await window.electronAPI.saveEnvConfig(envConfig);
      // Guardar también en localStorage para acceso rápido
      localStorage.setItem('setup_completed', 'true');
      localStorage.setItem('business_name', config.businessName);
      localStorage.setItem('printer_id', config.printerId);
      localStorage.setItem('printer_name', config.printerName);
      localStorage.setItem('supabase_url', config.supabaseUrl);
      console.log('✅ Configuración guardada correctamente');
    } catch (error) {
      console.error('Error saving configuration:', error);
    }
  };

  const canProceed = () => {
    // En el paso de bienvenida, requiere nombre de negocio
    if (currentStep === 'welcome') {
      return config.businessName && config.businessName.trim().length > 0;
    }
    if (currentStep === 'supabase') {
      return config.supabaseUrl && config.supabaseKey && testResult?.success;
    }
    if (currentStep === 'printer') {
      // Permitir avanzar si hay nombre de impresora (el ID se genera automáticamente si no se ingresa)
      const printerId = config.printerId || `${config.businessName?.toLowerCase().replace(/\s+/g, '-') || 'printer'}-printer-1`;
      return config.printerName && printerId;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
        {/* Progress Bar */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            {Object.entries(steps).map(([key, step], index) => {
              const Icon = step.icon;
              const isActive = currentStep === key;
              const isPast = Object.keys(steps).indexOf(currentStep) > index;

              return (
                <div key={key} className="flex items-center">
                  <div className={`rounded-full p-3 ${isActive ? 'bg-white text-blue-600' :
                    isPast ? 'bg-blue-400' : 'bg-blue-700'
                    }`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {index < Object.keys(steps).length - 1 && (
                    <div className={`h-1 w-16 mx-2 ${isPast ? 'bg-blue-400' : 'bg-blue-700'
                      }`} />
                  )}
                </div>
              );
            })}
          </div>
          <h2 className="text-2xl font-bold">{steps[currentStep].title}</h2>
        </div>

        {/* Content */}
        <div className="p-8">
          {currentStep === 'welcome' && (
            <div className="space-y-6">
              <div className="text-center">
                <Printer className="h-24 w-24 text-blue-600 mx-auto mb-4" />
                <h3 className="text-3xl font-bold text-gray-900 mb-4">
                  Configuración Inicial
                </h3>
                <p className="text-lg text-gray-600 mb-6">
                  Te ayudaremos a configurar tu agente de impresión en solo 3 pasos.
                </p>
              </div>

              <div className="space-y-4">
                <label className="label">
                  Nombre de tu negocio <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`input text-lg text-white bg-gray-700 placeholder-gray-400 ${
                    !config.businessName || config.businessName.trim().length === 0 
                      ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                      : 'border-gray-600'
                  }`}
                  placeholder="Ej: Atlas Burger"
                  value={config.businessName}
                  onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                  required
                />
                <p className="text-sm text-gray-500">
                  Este nombre aparecerá en los tickets impresos
                </p>
                {(!config.businessName || config.businessName.trim().length === 0) && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Por favor ingresa el nombre de tu negocio para continuar</span>
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">¿Qué necesitas tener listo?</h4>
                <ul className="space-y-2 text-blue-800">
                  <li className="flex items-center">
                    <Check className="h-5 w-5 mr-2" />
                    URL de Supabase y clave de acceso
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 mr-2" />
                    Impresora térmica conectada (Epson recomendada)
                  </li>
                  <li className="flex items-center">
                    <Check className="h-5 w-5 mr-2" />
                    5 minutos de tu tiempo
                  </li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 'supabase' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="label">URL de Supabase</label>
                  <input
                    type="text"
                    className="input text-white bg-gray-700 placeholder-gray-400 border-gray-600"
                    placeholder="https://tu-proyecto.supabase.co"
                    value={config.supabaseUrl}
                    onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Clave Anon (anon/public)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="input font-mono text-sm text-white bg-gray-700 placeholder-gray-400 border-gray-600"
                    placeholder="••••••••••••••••••••••••••••••••"
                    value={config.supabaseKey}
                    onChange={(e) => setConfig({ ...config, supabaseKey: e.target.value })}
                  />
                </div>

                <button
                  onClick={testSupabaseConnection}
                  disabled={testing || !config.supabaseUrl || !config.supabaseKey}
                  className="btn-primary w-full"
                >
                  {testing ? 'Probando conexión...' : 'Probar Conexión'}
                </button>

                {testResult && (
                  <div className={`p-4 rounded-lg ${testResult.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'printer' && (
            <div className="space-y-6">
              {loadingPrinters ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-600">Buscando impresoras...</p>
                  <p className="text-sm text-gray-500 mt-2">Revisa la consola (F12) para ver logs detallados</p>
                </div>
              ) : availablePrinters.length === 0 ? (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <Printer className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">No se detectaron impresoras</p>
                    <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                      Asegúrate de que la impresora esté conectada por USB, encendida y con los <b>drivers instalados</b> en Windows.
                    </p>
                  </div>
                  
                  {/* Opción para ingresar manualmente */}
                  <div className="border-t pt-6">
                    <p className="text-sm text-gray-600 mb-4 text-center">
                      O ingresa manualmente el nombre de tu impresora:
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nombre de la impresora
                        </label>
                        <input
                          type="text"
                          value={config.printerName}
                          onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
                          placeholder="Ej: Epson TM-T20"
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white bg-gray-700 placeholder-gray-400"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {availablePrinters.map((printer, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        const newPrinterName = printer.name || printer;
                        setConfig({
                          ...config,
                          printerName: newPrinterName,
                          printerId: config.printerId || `${config.businessName?.toLowerCase().replace(/\s+/g, '-')}-printer-1`
                        });
                        // Guardar inmediatamente en localStorage
                        localStorage.setItem('printer_name', newPrinterName);
                        localStorage.setItem('printer_id', config.printerId || `${config.businessName?.toLowerCase().replace(/\s+/g, '-')}-printer-1`);
                      }}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${config.printerName === (printer.name || printer)
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-blue-300'
                        }`}
                    >
                      <div className="flex items-center">
                        <Printer className={`h-6 w-6 mr-3 ${config.printerName === (printer.name || printer) ? 'text-blue-600' : 'text-gray-600'}`} />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {printer.name || printer}
                          </div>
                          {printer.displayName && (
                            <div className="text-sm text-gray-500">
                              {printer.displayName}
                            </div>
                          )}
                        </div>
                        {config.printerName === (printer.name || printer) && (
                          <Check className="h-6 w-6 text-blue-600 ml-auto" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {config.printerName && (
                <div className="space-y-4 mt-6">
                  <div>
                    <label className="label">ID de impresora (para Supabase)</label>
                    <input
                      type="text"
                      className="input text-white bg-gray-700 placeholder-gray-400 border-gray-600"
                      placeholder="mi-negocio-printer-1"
                      value={config.printerId}
                      onChange={(e) => {
                        setConfig({ ...config, printerId: e.target.value });
                        localStorage.setItem('printer_id', e.target.value);
                      }}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Este ID debe coincidir con el configurado en Supabase
                    </p>
                  </div>
                </div>
              )}

              {/* Botón de actualizar lista al final */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => loadPrinters()}
                  disabled={loadingPrinters}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPrinters ? 'Buscando...' : 'Actualizar lista'}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="space-y-6 text-center">
              <div className="bg-green-50 rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center">
                <Check className="h-12 w-12 text-green-600" />
              </div>

              <h3 className="text-2xl font-bold text-gray-900">
                ¡Todo listo!
              </h3>

              <p className="text-lg text-gray-600">
                Tu agente de impresión está configurado y listo para usar
              </p>

              <div className="bg-gray-50 rounded-lg p-6 text-left space-y-3">
                <h4 className="font-semibold text-gray-900 mb-3">Resumen de configuración:</h4>
                <div className="flex justify-between">
                  <span className="text-gray-600">Negocio:</span>
                  <span className="font-semibold">{config.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Supabase:</span>
                  <span className="font-semibold text-green-600">Conectado</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Impresora:</span>
                  <span className="font-semibold">{config.printerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Printer ID:</span>
                  <span className="font-mono text-sm">{config.printerId}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <h4 className="font-semibold text-blue-900 mb-2">Al hacer clic en Finalizar:</h4>
                <ul className="space-y-1 text-blue-800 text-sm">
                  <li>• Se guarda la configuración y la impresora queda registrada en el agente</li>
                  <li>• Si el agente está iniciado, ya podés imprimir. Si no, iniciá el agente y listo</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="bg-gray-50 px-8 py-6 flex justify-between items-center border-t border-gray-200">
          {currentStep !== 'welcome' ? (
            <button
              onClick={handleBack}
              className="group flex items-center gap-2 px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl font-semibold text-base transition-all duration-200 hover:bg-gray-50 hover:border-gray-400 hover:shadow-md active:scale-95"
            >
              <ChevronLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              <span>Atrás</span>
            </button>
          ) : <div />}

          <button
            onClick={handleNext}
            disabled={!canProceed() || finishing}
            className="group flex items-center gap-2 px-8 py-3 text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-semibold text-base shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
          >
            <span>{finishing ? 'Guardando...' : currentStep === 'complete' ? 'Finalizar' : 'Siguiente'}</span>
            <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

