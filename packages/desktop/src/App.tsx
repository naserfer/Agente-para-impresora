import { useState, useEffect } from 'react';
import { Printer, Settings, Activity, FileText } from 'lucide-react';
import SupabaseConfig from './components/SupabaseConfig';
import PrinterConfig from './components/PrinterConfig';
import StatusPanel from './components/StatusPanel';
import LogsViewer from './components/LogsViewer';
import SetupWizard from './components/SetupWizard';

type Tab = 'status' | 'supabase' | 'printer' | 'logs';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [showWizard, setShowWizard] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ running: boolean; health: any }>({ 
    running: false, 
    health: null 
  });

  // Verificar si es la primera vez que se ejecuta
  useEffect(() => {
    const setupCompleted = localStorage.getItem('setup_completed');
    if (!setupCompleted) {
      setShowWizard(true);
    }
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

  const tabs = [
    { id: 'status' as Tab, label: 'Estado', icon: Activity },
    { id: 'supabase' as Tab, label: 'Supabase', icon: Settings },
    { id: 'printer' as Tab, label: 'Impresora', icon: Printer },
    { id: 'logs' as Tab, label: 'Logs', icon: FileText },
  ];

  const handleWizardComplete = (config: any) => {
    console.log('Wizard completado con configuración:', config);
    setShowWizard(false);
  };

  // Mostrar wizard si es la primera vez
  if (showWizard) {
    return <SetupWizard onComplete={handleWizardComplete} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Printer className="h-8 w-8 text-primary-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">
                Agente de Impresión
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {(() => {
                // Misma lógica que en StatusPanel
                const isActive = agentStatus.running || 
                                (agentStatus.health && agentStatus.health.status === 'ok');
                return (
                  <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                    isActive
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
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
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'status' && <StatusPanel agentStatus={agentStatus} />}
        {activeTab === 'supabase' && <SupabaseConfig />}
        {activeTab === 'printer' && <PrinterConfig />}
        {activeTab === 'logs' && <LogsViewer />}
      </main>
    </div>
  );
}

export default App;

