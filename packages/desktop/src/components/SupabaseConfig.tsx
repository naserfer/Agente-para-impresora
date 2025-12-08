import { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, Loader } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

export default function SupabaseConfig() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Cargar configuración actual desde .env si existe
    // En producción, esto se haría a través del IPC
    const loadConfig = async () => {
      // Por ahora, usar valores por defecto o del localStorage
      const savedUrl = localStorage.getItem('supabase_url') || '';
      const savedKey = localStorage.getItem('supabase_key') || '';
      setSupabaseUrl(savedUrl);
      setSupabaseKey(savedKey);
    };
    loadConfig();
  }, []);

  const testConnection = async () => {
    if (!supabaseUrl || !supabaseKey) {
      setTestResult({ success: false, message: 'Por favor completa todos los campos' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Probar conexión haciendo una petición HTTP simple
      const response = await fetch(`${supabaseUrl}/rest/v1/tenants?select=id&limit=1`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });

      if (response.ok) {
        setTestResult({ success: true, message: 'Conexión exitosa a Supabase' });
      } else {
        setTestResult({ success: false, message: `Error: ${response.status} ${response.statusText}` });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: `Error: ${error.message}` });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!supabaseUrl || !supabaseKey) {
      setTestResult({ success: false, message: 'Por favor completa todos los campos' });
      return;
    }

    // Guardar en localStorage (en producción, se guardaría en .env a través del IPC)
    localStorage.setItem('supabase_url', supabaseUrl);
    localStorage.setItem('supabase_key', supabaseKey);
    
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // TODO: En producción, usar IPC para guardar en .env
    // await window.electronAPI.saveConfig({ supabaseUrl, supabaseKey });
  };

  return (
    <div className="card max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Configuración de Supabase</h2>

      <div className="space-y-4">
        <div>
          <label className="label">Supabase URL</label>
          <input
            type="text"
            className="input"
            placeholder="https://tu-proyecto.supabase.co"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
          />
          <p className="mt-1 text-sm text-gray-500">
            URL de tu proyecto Supabase
          </p>
        </div>

        <div>
          <label className="label">Supabase Anon Key</label>
          <input
            type="password"
            className="input"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            value={supabaseKey}
            onChange={(e) => setSupabaseKey(e.target.value)}
          />
          <p className="mt-1 text-sm text-gray-500">
            Anon key de tu proyecto Supabase (Settings → API)
          </p>
        </div>

        {testResult && (
          <div
            className={`flex items-center space-x-2 p-3 rounded-md ${
              testResult.success
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={testConnection}
            disabled={testing}
            className="btn btn-secondary flex items-center space-x-2 disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                <span>Probando...</span>
              </>
            ) : (
              <span>Probar Conexión</span>
            )}
          </button>

          <button
            onClick={saveConfig}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{saved ? 'Guardado ✓' : 'Guardar Configuración'}</span>
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Después de guardar, reinicia el agente para aplicar los cambios.
          </p>
        </div>
      </div>
    </div>
  );
}

