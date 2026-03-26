import { useState, useEffect } from 'react';
import { Printer, Activity, FileText, RotateCcw, Code, User } from 'lucide-react';
import PrinterConfig from './components/PrinterConfig';
import StatusPanel from './components/StatusPanel';
import LogsViewer from './components/LogsViewer';
import SetupWizard from './components/SetupWizard';
import ClientDashboard from './components/ClientDashboard';

type Tab = 'status' | 'printer' | 'logs';
type Mode = 'client' | 'dev';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardKey, setWizardKey] = useState(0); // Key para forzar remount del wizard
  const [mode, setMode] = useState<Mode>(() => {
    const savedMode = localStorage.getItem('app_mode') as Mode;
    return savedMode || 'client';
  });
  const [isConfigLocked, setIsConfigLocked] = useState(false); // .exe: cliente no puede cambiar config
  const [agentStatus, setAgentStatus] = useState<{ running: boolean; health: any }>({ 
    running: false, 
    health: null 
  });

  // Si la app está empaquetada (.exe), config bloqueada: solo nosotros con --reset-config
  useEffect(() => {
    if (window.electronAPI?.getAppInfo) {
      window.electronAPI.getAppInfo().then((info) => {
        if (info?.isConfigLocked) setIsConfigLocked(true);
      });
    }
  }, []);

  // Primera vez O sin config (ej. después de --reset-config): mostrar wizard
  useEffect(() => {
    if (!window.electronAPI?.getEnvConfig) return;
    window.electronAPI.getEnvConfig().then((res) => {
      const hasLocalSetup = !!localStorage.getItem('setup_completed');
      const hasLocalPrinterId = !!localStorage.getItem('printer_id');
      const hasLocalPrinterName = !!localStorage.getItem('printer_name');
      const hasLocalBusinessName = !!localStorage.getItem('business_name');

      if (!res.success || !res.data?.SUPABASE_URL) {
        localStorage.removeItem('setup_completed');
        setShowWizard(true);
      } else if (!hasLocalSetup || !hasLocalPrinterId || !hasLocalPrinterName || !hasLocalBusinessName) {
        setShowWizard(true);
      }
    });
  }, []);

  // Log para debugging
  useEffect(() => {
    console.log('🔍 Estado del agente actualizado:', {
      running: agentStatus.running,
      healthStatus: agentStatus.health?.status,
      printersCount: agentStatus.health?.printersCount,
      healthExists: !!agentStatus.health
    });
  }, [agentStatus]);

  useEffect(() => {
    // Verificar que electronAPI esté disponible
    if (!window.electronAPI) {
      return;
    }

    let mounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Función para actualizar el estado
    const updateStatus = async () => {
      if (!mounted || !window.electronAPI) return;

      try {
        console.log('📡 Verificando estado del agente...');
        const [status, health] = await Promise.all([
          window.electronAPI.getAgentStatus(),
          window.electronAPI.getAgentHealth(),
        ]);

        console.log('📊 Respuestas recibidas:', {
          status,
          health: {
            success: health.success,
            dataStatus: health.data?.status,
            printersCount: health.data?.printersCount,
            error: health.error,
            fullHealth: health // Mostrar todo el objeto health para debugging
          }
        });

        if (!mounted) return;

        // Determinar si el agente está realmente corriendo
        // Si health.success es true, el agente está corriendo (aunque status.running sea false)
        // También verificamos si health.data existe y tiene status: 'ok'
        const isActuallyRunning = health.success || 
                                 (health.data && health.data.status === 'ok') || 
                                 status.running;
        
        console.log('✅ Estado calculado:', {
          isActuallyRunning,
          healthSuccess: health.success,
          healthDataStatus: health.data?.status,
          statusRunning: status.running
        });
        
        // Solo actualizar si hay cambios reales
        setAgentStatus(prev => {
          const newRunning = isActuallyRunning;
          const newHealth = health.success ? health.data : null;
          
          // Evitar actualización si no hay cambios
          if (prev.running === newRunning && 
              JSON.stringify(prev.health) === JSON.stringify(newHealth)) {
            console.log('⏭️ Sin cambios, no actualizando');
            return prev;
          }
          
          console.log('🔄 Actualizando estado del agente:', {
            prevRunning: prev.running,
            newRunning,
            prevHealth: prev.health ? { status: prev.health.status } : null,
            newHealth: newHealth ? { status: newHealth.status, printersCount: newHealth.printersCount } : null,
          });
          
          return {
            running: newRunning,
            health: newHealth,
          };
        });
      } catch (error) {
        if (!mounted) return;
        setAgentStatus(prev => {
          if (prev.running === false) return prev; // Ya está en false, no actualizar
          return { ...prev, running: false };
        });
      }
    };

    // Verificar inmediatamente
    updateStatus();

    // Verificar estado del agente cada 5 segundos
    intervalId = setInterval(updateStatus, 5000);

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const devTabs = [
    { id: 'status' as Tab, label: 'Estado', icon: Activity },
    { id: 'printer' as Tab, label: 'Impresora', icon: Printer },
    { id: 'logs' as Tab, label: 'Logs', icon: FileText },
  ];

  const clientTabs = [
    { id: 'status' as Tab, label: 'Dashboard', icon: Activity },
    { id: 'printer' as Tab, label: 'Impresora', icon: Printer },
  ];

  // .exe: permitir solo operación diaria + configuración local de impresora
  const lockedTabs = [
    { id: 'status' as Tab, label: 'Dashboard', icon: Activity },
    { id: 'printer' as Tab, label: 'Impresora', icon: Printer },
  ];
  const tabs = isConfigLocked ? lockedTabs : (mode === 'dev' ? devTabs : clientTabs);

  const toggleMode = () => {
    const newMode = mode === 'client' ? 'dev' : 'client';
    setMode(newMode);
    localStorage.setItem('app_mode', newMode);
    // Cambiar a tab apropiado según el modo (ambos usan 'status' como id)
    setActiveTab('status');
  };

  const handleWizardComplete = (config: any) => {
    console.log('Wizard completado con configuración:', config);
    setShowWizard(false);
  };

  const handleResetConfig = async () => {
    if (!window.confirm('¿Estás seguro de que quieres resetear toda la configuración?\n\nEsto eliminará:\n- Credenciales de Supabase\n- Configuración de impresora\n- Nombre del negocio\n\nTendrás que volver a configurar todo desde cero.')) {
      return;
    }

    try {
      if (window.electronAPI?.resetConfig) {
        const result = await window.electronAPI.resetConfig();
        if (result.success) {
          // Limpiar localStorage
          localStorage.clear();
          
          // Forzar remount del wizard cambiando la key
          setWizardKey(prev => prev + 1);
          
          // Asegurar que el wizard esté visible
          setShowWizard(true);
          
          // Mostrar mensaje sin bloquear la UI
          console.log('✅ Configuración reseteada. Por favor, configura nuevamente.');
        } else {
          alert(`❌ Error al resetear: ${result.error}`);
        }
      }
    } catch (error: any) {
      console.error('Error reseteando configuración:', error);
      alert(`❌ Error: ${error.message}`);
    }
  };

  // Mostrar wizard si es la primera vez
  if (showWizard) {
    return <SetupWizard key={wizardKey} onComplete={handleWizardComplete} />;
  }

  return (
    <div className="h-screen bg-slate-100 text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center">
              <Printer className="h-6 w-6 text-slate-700 mr-3" />
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                Agente de Impresión
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Toggle Modo: oculto cuando config está bloqueada (.exe) */}
              {!isConfigLocked && (
                <button
                  onClick={toggleMode}
                  className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                    mode === 'client'
                      ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                  title={mode === 'client' ? 'Cambiar a modo Desarrollador' : 'Cambiar a modo Cliente'}
                >
                  {mode === 'client' ? (
                    <>
                      <User className="h-4 w-4" />
                      <span>Modo Cliente</span>
                    </>
                  ) : (
                    <>
                      <Code className="h-4 w-4" />
                      <span>Modo Dev</span>
                    </>
                  )}
                </button>
              )}

              {(() => {
                // Misma lógica que en StatusPanel
                const isActive = agentStatus.running || 
                                (agentStatus.health && agentStatus.health.status === 'ok');
                return (
                  <div className={`flex items-center space-x-2 px-3 py-1 rounded-md border ${
                    isActive
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}>
                    <div className={`h-2 w-2 rounded-full ${
                      isActive ? 'bg-green-500' : 'bg-red-500'
                    } animate-pulse`} />
                    <span className="text-sm font-medium">
                      {isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                );
              })()}

              {/* Reset solo en modo Dev y cuando config no está bloqueada (no en .exe) */}
              {!isConfigLocked && mode === 'dev' && (
                <button
                  onClick={handleResetConfig}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50 transition-colors"
                  title="Resetear configuración (para pruebas)"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Resetear Config</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-slate-800 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 h-[calc(100vh-108px)] overflow-hidden">
        {isConfigLocked ? (
          <>
            {activeTab === 'status' && <ClientDashboard agentStatus={agentStatus} />}
            {activeTab === 'printer' && <PrinterConfig />}
          </>
        ) : mode === 'client' ? (
          <>
            {activeTab === 'status' && <ClientDashboard agentStatus={agentStatus} />}
            {activeTab === 'printer' && <PrinterConfig />}
          </>
        ) : (
          <>
            {activeTab === 'status' && <StatusPanel agentStatus={agentStatus} />}
            {activeTab === 'printer' && <PrinterConfig />}
            {activeTab === 'logs' && <LogsViewer />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;

