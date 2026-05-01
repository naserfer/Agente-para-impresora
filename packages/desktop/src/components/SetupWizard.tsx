import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Printer, Settings } from 'lucide-react';

interface SetupWizardProps {
  onComplete: (config: any) => void;
  /** Si el usuario ya tenía config, puede cerrar el asistente sin guardar (volver al panel). */
  onDismiss?: () => void;
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

export default function SetupWizard({ onComplete, onDismiss }: SetupWizardProps) {
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
      }
    } catch (error) {
      console.error('Error loading printers:', error);
      setAvailablePrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    const checkEmbeddedConfig = async () => {
      if (!window.electronAPI?.getEnvConfig) return;

      try {
        const result = await window.electronAPI.getEnvConfig();
        if (result.success && result.data) {
          const envConfig = result.data;

          const savedBusinessName = localStorage.getItem('business_name') || '';
          const savedPrinterName = localStorage.getItem('printer_name') || '';
          const savedPrinterId = localStorage.getItem('printer_id') || '';

          setConfig((prev) => ({
            ...prev,
            printerId: normalizePrinterId(envConfig.PRINTER_ID || savedPrinterId || ''),
            printerName: savedPrinterName || '',
            businessName: savedBusinessName || envConfig.CLIENT_NAME || ''
          }));
        }
      } catch (error) {
        console.error('Error cargando configuración embebida:', error);
      }
    };

    checkEmbeddedConfig();
  }, []);

  useEffect(() => {
    if (currentStep === 'printer') {
      const timer = setTimeout(() => {
        loadPrinters();
      }, 300);

      return () => clearTimeout(timer);
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
        await saveConfiguration();
        if (window.electronAPI?.configurePrinter && config.printerId && config.printerName) {
          try {
            await window.electronAPI.configurePrinter({
              printerId: normalizePrinterId(config.printerId),
              type: 'usb',
              printerName: config.printerName
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
      CLIENT_NAME: config.businessName,
      PRINTER_ID: normalizePrinterId(config.printerId),
      PRINTER_NAME: config.printerName
    };

    try {
      await window.electronAPI.saveEnvConfig(envConfig);
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
    if (currentStep === 'welcome') {
      return config.businessName && config.businessName.trim().length > 0;
    }
    if (currentStep === 'printer') {
      const printerId = normalizePrinterId(config.printerId || `${config.businessName || 'printer'}-printer-1`);
      return config.printerName && printerId;
    }
    return true;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 sm:p-3">
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm max-w-2xl w-full max-h-full min-h-0 flex flex-col overflow-hidden">
        {/* Barra de pasos — compacta */}
        <div className="bg-slate-900 px-3 py-2.5 text-white shrink-0">
          <div className="flex items-center justify-between mb-2">
            {Object.entries(steps).map(([key, step], index) => {
              const Icon = step.icon;
              const isActive = currentStep === key;
              const isPast = Object.keys(steps).indexOf(currentStep) > index;

              return (
                <div key={key} className="flex items-center">
                  <div
                    className={`rounded-full p-1.5 ${
                      isActive ? 'bg-white text-slate-900' : isPast ? 'bg-slate-500' : 'bg-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {index < Object.keys(steps).length - 1 && (
                    <div className={`h-0.5 w-6 mx-1.5 ${isPast ? 'bg-slate-500' : 'bg-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <h2 className="text-sm font-semibold tracking-tight truncate">{steps[currentStep].title}</h2>
        </div>

        {/* Contenido: ocupa el espacio disponible y hace scroll interno si hace falta */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          {currentStep === 'welcome' && (
            <div className="space-y-3">
              <div className="text-center">
                <Printer className="h-10 w-10 text-slate-700 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-slate-900 mb-1">Configuración inicial</h3>
                <p className="text-xs text-slate-600">Dos pasos: negocio e impresora.</p>
              </div>

              <div className="space-y-2">
                <label className="label text-xs mb-0.5">
                  Nombre de tu negocio <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={`input text-sm py-1.5 ${
                    !config.businessName || config.businessName.trim().length === 0
                      ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-400'
                      : ''
                  }`}
                  placeholder="Ej: Mi Negocio - Sucursal 1"
                  value={config.businessName}
                  onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                  required
                />
                <p className="text-xs text-slate-500">Aparecerá en los tickets.</p>
                {(!config.businessName || config.businessName.trim().length === 0) && (
                  <p className="text-xs text-red-600 flex items-start gap-1">
                    <span>⚠️</span>
                    <span>Ingresá el nombre del negocio para continuar.</span>
                  </p>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-left">
                <h4 className="font-medium text-slate-900 text-xs mb-1.5">Antes de seguir</h4>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Impresora térmica conectada (Epson recomendada)
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Unos minutos para completar el asistente
                  </li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 'printer' && (
            <div className="flex flex-col min-h-0 gap-2">
              {loadingPrinters ? (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-2 border-slate-400 border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm text-slate-600">Buscando impresoras…</p>
                </div>
              ) : availablePrinters.length === 0 ? (
                <div className="space-y-3">
                  <div className="text-center py-1">
                    <Printer className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 mb-1">No se detectaron impresoras</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-snug">
                      Conectá la impresora por USB, encendela y verificá los drivers en Windows.
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-600 mb-2 text-center">O escribí el nombre exacto en Windows:</p>
                    <label className="label text-xs">Nombre de la impresora</label>
                    <input
                      type="text"
                      value={config.printerName}
                      onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
                      placeholder="Ej: EPSON TM-T20III Receipt"
                      className="input text-sm py-1.5"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col min-h-0 flex-1 gap-2">
                  <p className="text-xs text-slate-600 shrink-0">Elegí la impresora física (no PDF ni AnyDesk).</p>
                  <div className="min-h-0 max-h-[min(220px,38vh)] overflow-y-auto pr-0.5 space-y-1.5 border border-slate-100 rounded-md p-1.5 bg-slate-50/80">
                    {availablePrinters.map((printer, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          const newPrinterName = printer.name || printer;
                          setConfig({
                            ...config,
                            printerName: newPrinterName,
                            printerId: normalizePrinterId(config.printerId || `${config.businessName}-printer-1`)
                          });
                          localStorage.setItem('printer_name', newPrinterName);
                          localStorage.setItem(
                            'printer_id',
                            normalizePrinterId(config.printerId || `${config.businessName}-printer-1`)
                          );
                        }}
                        className={`w-full p-2 rounded-md border text-left transition-all text-sm ${
                          config.printerName === (printer.name || printer)
                            ? 'border-slate-700 bg-white shadow-sm'
                            : 'border-slate-200 hover:border-slate-400 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Printer
                            className={`h-4 w-4 shrink-0 mt-0.5 ${
                              config.printerName === (printer.name || printer) ? 'text-slate-700' : 'text-slate-500'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 break-words leading-snug">
                              {printer.name || printer}
                            </div>
                            {printer.displayName && (
                              <div className="text-xs text-slate-500 break-words mt-0.5">{printer.displayName}</div>
                            )}
                          </div>
                          {config.printerName === (printer.name || printer) && (
                            <Check className="h-4 w-4 text-slate-700 shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {config.printerName && (
                <div className="space-y-1.5 pt-1 border-t border-slate-100 shrink-0">
                  <label className="label text-xs">Identificador (Printer ID)</label>
                  <input
                    type="text"
                    className="input text-sm py-1.5"
                    placeholder="Ej: mi-negocio-caja-1"
                    value={config.printerId}
                    onChange={(e) => {
                      const normalized = normalizePrinterId(e.target.value);
                      setConfig({ ...config, printerId: normalized });
                      localStorage.setItem('printer_id', normalized);
                    }}
                  />
                  <p className="text-xs text-slate-500">Debe coincidir con lo configurado en Supabase.</p>
                </div>
              )}

              <div className="flex justify-end pt-1 shrink-0">
                <button
                  type="button"
                  onClick={() => loadPrinters()}
                  disabled={loadingPrinters}
                  className="btn btn-secondary text-xs px-2.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPrinters ? 'Buscando…' : 'Actualizar lista'}
                </button>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="space-y-3 text-center">
              <div className="bg-emerald-50 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center border border-emerald-200">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>

              <h3 className="text-base font-semibold text-slate-900">Listo</h3>

              <p className="text-xs text-slate-600 px-1">La configuración se guardará al pulsar Finalizar.</p>

              <div className="bg-slate-50 rounded-md p-3 text-left space-y-2 border border-slate-200 text-xs">
                <h4 className="font-semibold text-slate-900">Resumen</h4>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 shrink-0">Negocio</span>
                  <span className="font-medium text-right break-words">{config.businessName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 shrink-0">Impresora</span>
                  <span className="font-medium text-right break-words">{config.printerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 shrink-0">Printer ID</span>
                  <span className="font-mono text-right break-all">{config.printerId}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-left text-xs text-slate-700">
                <p className="font-medium text-slate-900 mb-1">Al finalizar</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>Se guarda la config y se registra la impresora en el agente</li>
                  <li>Si el agente no está iniciado, iniciarlo desde el panel</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Pie fijo */}
        <div className="bg-slate-50 px-3 py-2 flex justify-between items-center gap-2 border-t border-slate-200 shrink-0">
          {currentStep !== 'welcome' ? (
            <button
              type="button"
              onClick={handleBack}
              className="btn btn-secondary group flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Atrás</span>
            </button>
          ) : onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="btn btn-secondary px-3 py-1.5 text-xs font-medium shrink-0"
            >
              Volver al panel
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || finishing}
            className="btn btn-primary group flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            <span>{finishing ? 'Guardando…' : currentStep === 'complete' ? 'Finalizar' : 'Siguiente'}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
