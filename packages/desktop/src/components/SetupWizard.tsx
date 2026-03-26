import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Printer, Settings } from 'lucide-react';

interface SetupWizardProps {
  onComplete: (config: any) => void;
}

type Step = 'welcome' | 'printer' | 'complete';

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

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [config, setConfig] = useState({
    printerId: '',
    printerName: '',
    businessName: ''
  });
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const steps = {
    welcome: { title: '¡Bienvenido!', icon: Settings },
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

  // Cargar configuración existente del .env embebido + local
  useEffect(() => {
    const checkEmbeddedConfig = async () => {
      if (!window.electronAPI?.getEnvConfig) return;

      try {
        const result = await window.electronAPI.getEnvConfig();
        if (result.success && result.data) {
          const envConfig = result.data;

          console.log('Configuración encontrada:', envConfig);

          // Cargar desde localStorage como fuente principal de configuración local
          const savedBusinessName = localStorage.getItem('business_name') || '';
          const savedPrinterName = localStorage.getItem('printer_name') || '';
          const savedPrinterId = localStorage.getItem('printer_id') || '';

          // Pre-llenar datos
          setConfig(prev => ({
            ...prev,
            printerId: normalizePrinterId(envConfig.PRINTER_ID || savedPrinterId || ''),
            printerName: savedPrinterName || '', // Cargar nombre de impresora guardado
            businessName: savedBusinessName || envConfig.CLIENT_NAME || '', // Priorizar dato local editable
          }));

          // No auto-saltar pasos por valores embebidos del build.
          // El usuario siempre debe confirmar configuración local en esta instalación.
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
      setCurrentStep('printer');
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
              printerId: normalizePrinterId(config.printerId),
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
    if (currentStep === 'printer') {
      setCurrentStep('welcome');
    } else if (currentStep === 'complete') {
      setCurrentStep('printer');
    }
  };

  const saveConfiguration = async () => {
    if (!window.electronAPI?.saveEnvConfig) return;

    const envConfig = {
      CLIENT_NAME: config.businessName, // Guardar nombre del negocio
      PRINTER_ID: normalizePrinterId(config.printerId), // Guardar ID de impresora
    };

    try {
      await window.electronAPI.saveEnvConfig(envConfig);
      // Guardar también en localStorage para acceso rápido
      localStorage.setItem('setup_completed', 'true');
      localStorage.setItem('business_name', config.businessName);
      localStorage.setItem('printer_id', normalizePrinterId(config.printerId));
      localStorage.setItem('printer_name', config.printerName);
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
    if (currentStep === 'printer') {
      // Permitir avanzar si hay nombre de impresora (el ID se genera automáticamente si no se ingresa)
      const printerId = normalizePrinterId(config.printerId || `${config.businessName || 'printer'}-printer-1`);
      return config.printerName && printerId;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm max-w-2xl w-full overflow-hidden">
        {/* Progress Bar */}
        <div className="bg-slate-900 p-4 text-white">
          <div className="flex items-center justify-between mb-4">
            {Object.entries(steps).map(([key, step], index) => {
              const Icon = step.icon;
              const isActive = currentStep === key;
              const isPast = Object.keys(steps).indexOf(currentStep) > index;

              return (
                <div key={key} className="flex items-center">
                  <div className={`rounded-full p-2.5 ${isActive ? 'bg-white text-slate-900' :
                    isPast ? 'bg-slate-500' : 'bg-slate-700'
                    }`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {index < Object.keys(steps).length - 1 && (
                    <div className={`h-1 w-10 mx-2 ${isPast ? 'bg-slate-500' : 'bg-slate-700'
                      }`} />
                  )}
                </div>
              );
            })}
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{steps[currentStep].title}</h2>
        </div>

        {/* Content */}
        <div className="p-5">
          {currentStep === 'welcome' && (
            <div className="space-y-6">
              <div className="text-center">
                <Printer className="h-14 w-14 text-slate-700 mx-auto mb-3" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  Configuración Inicial
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Te ayudaremos a configurar tu agente de impresión en solo 2 pasos.
                </p>
              </div>

              <div className="space-y-4">
                <label className="label">
                  Nombre de tu negocio <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`input text-sm ${
                    !config.businessName || config.businessName.trim().length === 0 
                      ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-400' 
                      : ''
                  }`}
                  placeholder="Ej: Mi Negocio - Sucursal 1"
                  value={config.businessName}
                  onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                  required
                />
                <p className="text-sm text-slate-500">
                  Este nombre aparecerá en los tickets impresos
                </p>
                {(!config.businessName || config.businessName.trim().length === 0) && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Por favor ingresa el nombre de tu negocio para continuar</span>
                  </p>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <h4 className="font-semibold text-slate-900 mb-2">¿Qué necesitas tener listo?</h4>
                <ul className="space-y-2 text-slate-700">
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

          {currentStep === 'printer' && (
            <div className="space-y-6">
              {loadingPrinters ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-12 w-12 border-4 border-slate-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-600">Buscando impresoras...</p>
                  <p className="text-sm text-slate-500 mt-2">Revisa la consola (F12) para ver logs detallados</p>
                </div>
              ) : availablePrinters.length === 0 ? (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <Printer className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 mb-2">No se detectaron impresoras</p>
                    <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
                      Asegúrate de que la impresora esté conectada por USB, encendida y con los <b>drivers instalados</b> en Windows.
                    </p>
                  </div>
                  
                  {/* Opción para ingresar manualmente */}
                  <div className="border-t pt-6">
                    <p className="text-sm text-slate-600 mb-4 text-center">
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
                          placeholder="Ej: EPSON TM-T20III Receipt"
                          className="input text-sm"
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
                          printerId: normalizePrinterId(config.printerId || `${config.businessName}-printer-1`)
                        });
                        // Guardar inmediatamente en localStorage
                        localStorage.setItem('printer_name', newPrinterName);
                        localStorage.setItem('printer_id', normalizePrinterId(config.printerId || `${config.businessName}-printer-1`));
                      }}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${config.printerName === (printer.name || printer)
                        ? 'border-slate-700 bg-slate-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-400'
                        }`}
                    >
                      <div className="flex items-center">
                        <Printer className={`h-6 w-6 mr-3 ${config.printerName === (printer.name || printer) ? 'text-slate-700' : 'text-slate-500'}`} />
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">
                            {printer.name || printer}
                          </div>
                          {printer.displayName && (
                            <div className="text-sm text-slate-500">
                              {printer.displayName}
                            </div>
                          )}
                        </div>
                        {config.printerName === (printer.name || printer) && (
                          <Check className="h-6 w-6 text-slate-700 ml-auto" />
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
                    className="input text-sm"
                    placeholder="Ej: mi-negocio-caja-1"
                      value={config.printerId}
                      onChange={(e) => {
                        const normalized = normalizePrinterId(e.target.value);
                        setConfig({ ...config, printerId: normalized });
                        localStorage.setItem('printer_id', normalized);
                      }}
                    />
                    <p className="text-sm text-slate-500 mt-1">
                      Este ID debe coincidir con el configurado en Supabase
                    </p>
                  </div>
                </div>
              )}

              {/* Botón de actualizar lista al final */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <button
                  onClick={() => loadPrinters()}
                  disabled={loadingPrinters}
                  className="btn btn-secondary text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPrinters ? 'Buscando...' : 'Actualizar lista'}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="space-y-6 text-center">
              <div className="bg-emerald-50 rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center border border-emerald-200">
                <Check className="h-12 w-12 text-emerald-600" />
              </div>

              <h3 className="text-xl font-semibold text-slate-900">
                ¡Todo listo!
              </h3>

              <p className="text-base text-slate-600">
                Tu agente de impresión está configurado y listo para usar
              </p>

              <div className="bg-slate-50 rounded-md p-6 text-left space-y-3 border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3">Resumen de configuración:</h4>
                <div className="flex justify-between">
                  <span className="text-slate-600">Negocio:</span>
                  <span className="font-semibold">{config.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Impresora:</span>
                  <span className="font-semibold">{config.printerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Printer ID:</span>
                  <span className="font-mono text-sm">{config.printerId}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 text-left">
                <h4 className="font-semibold text-slate-900 mb-2">Al hacer clic en Finalizar:</h4>
                <ul className="space-y-1 text-slate-700 text-sm">
                  <li>• Se guarda la configuración y la impresora queda registrada en el agente</li>
                  <li>• Si el agente está iniciado, ya podés imprimir. Si no, iniciá el agente y listo</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="bg-slate-50 px-5 py-3 flex justify-between items-center border-t border-slate-200">
          {currentStep !== 'welcome' ? (
            <button
              onClick={handleBack}
              className="btn btn-secondary group flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            >
              <ChevronLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              <span>Atrás</span>
            </button>
          ) : <div />}

          <button
            onClick={handleNext}
            disabled={!canProceed() || finishing}
            className="btn btn-primary group flex items-center gap-2 px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{finishing ? 'Guardando...' : currentStep === 'complete' ? 'Finalizar' : 'Siguiente'}</span>
            <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

