import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mantener referencia global de la ventana
let mainWindow;
let agentProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Deshabilitar sandbox para permitir preload
    },
    // icon: join(__dirname, '../../assets/icon.png'), // TODO: Agregar icono
    titleBarStyle: 'default',
  });

  // Cargar la aplicación
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // Esperar a que Vite esté listo y cargar directamente
    const loadVite = () => {
      const viteUrl = 'http://localhost:5173';
      console.log(`🔄 Intentando cargar ${viteUrl}...`);
      
      // Escuchar errores ANTES de cargar
      mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`❌ Error cargando ${validatedURL}:`, errorCode, errorDescription);
      });
      
      // Escuchar cuando la página termine de cargar
      mainWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Página cargada completamente');
        console.log('✅ URL final:', mainWindow.webContents.getURL());
      });
      
      // Escuchar errores de consola del renderer
      mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[RENDERER ${level}]:`, message);
      });
      
      // Escuchar errores no capturados
      mainWindow.webContents.on('unresponsive', () => {
        console.error('❌ Ventana no responde');
      });
      
      mainWindow.webContents.on('crashed', () => {
        console.error('❌ Renderer process crasheó');
      });
      
      mainWindow.loadURL(viteUrl).then(() => {
        console.log('✅ URL cargada exitosamente');
        mainWindow.webContents.openDevTools();
      }).catch((err) => {
        console.error('❌ Error al cargar URL:', err);
        // Intentar de nuevo después de 2 segundos
        setTimeout(loadVite, 2000);
      });
    };
    
    // Esperar un poco para que Vite esté completamente listo
    setTimeout(loadVite, 1500);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Función auxiliar para iniciar el proceso del agente
function spawnAgentProcess() {
  const agentPath = join(__dirname, '../../agent');
  const agentScript = join(agentPath, 'server.js');
  
  if (!existsSync(agentPath)) {
    console.error(`❌ No se encontró el directorio del agente en: ${agentPath}`);
    return null;
  }
  
  // Guardar process.env antes de usar spawn para evitar conflictos
  const nodeEnv = process.env;
  
  const childProcess = spawn('node', [agentScript], {
    cwd: agentPath,
    stdio: 'pipe',
    shell: true,
    env: { ...nodeEnv, NODE_ENV: 'production' },
  });

  childProcess.stdout.on('data', (data) => {
    const message = data.toString();
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', message);
    }
  });

  childProcess.stderr.on('data', (data) => {
    const message = data.toString();
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', message);
    }
  });

  childProcess.on('close', (code) => {
    if (mainWindow) {
      mainWindow.webContents.send('agent-status', { running: false, code });
    }
    agentProcess = null;
  });
  
  return childProcess;
}

// Iniciar el agente cuando se inicia la app
function startAgent() {
  if (agentProcess) {
    return; // Ya está corriendo
  }
  
  // Verificar si el agente ya está corriendo en el puerto 3001
  // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
  const checkRequest = http.get('http://127.0.0.1:3001/health', (res) => {
    // El agente ya está corriendo
    console.log('✅ Agente ya está corriendo en el puerto 3001');
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', '✅ Agente ya está corriendo en el puerto 3001\n');
      mainWindow.webContents.send('agent-status', { running: true });
    }
    checkRequest.destroy();
  });
  
  checkRequest.on('error', () => {
    // El agente no está corriendo, iniciarlo
    agentProcess = spawnAgentProcess();
    if (agentProcess && mainWindow) {
      mainWindow.webContents.send('agent-status', { running: true });
    }
  });
  
  checkRequest.setTimeout(2000, () => {
    checkRequest.destroy();
    // Timeout significa que el agente no está corriendo, iniciarlo
    agentProcess = spawnAgentProcess();
    if (agentProcess && mainWindow) {
      mainWindow.webContents.send('agent-status', { running: true });
    }
  });
}

// Detener el agente
function stopAgent() {
  if (agentProcess) {
    agentProcess.kill();
    agentProcess = null;
  }
}

// IPC Handlers
ipcMain.handle('get-agent-status', async () => {
  // Verificar si hay un proceso activo
  if (agentProcess) {
    return { running: true };
  }
  
  // Verificar si el agente está corriendo en el puerto 3001
  try {
    const http = await import('http');
    return new Promise((resolve) => {
      // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
      const request = http.get('http://127.0.0.1:3001/health', { timeout: 2000 }, (res) => {
        resolve({ running: true });
        request.destroy();
      });
      
      request.on('error', () => {
        resolve({ running: false });
      });
      
      request.on('timeout', () => {
        request.destroy();
        resolve({ running: false });
      });
    });
  } catch (error) {
    return { running: false };
  }
});

ipcMain.handle('start-agent', async () => {
  if (!agentProcess) {
    startAgent();
    return { success: true };
  }
  return { success: false, message: 'Agente ya está corriendo' };
});

ipcMain.handle('stop-agent', async () => {
  if (agentProcess) {
    stopAgent();
    return { success: true };
  }
  return { success: false, message: 'Agente no está corriendo' };
});

ipcMain.handle('get-agent-health', async () => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = 'http://127.0.0.1:3001/health';
    
    console.log('[MAIN] Verificando health endpoint:', url);
    
    return new Promise((resolve) => {
      const request = http.get(url, { timeout: 5000 }, (res) => {
        console.log('[MAIN] Health response status:', res.statusCode);
        let data = '';
        res.on('data', (chunk) => { 
          data += chunk;
          console.log('[MAIN] Health data chunk recibido:', chunk.toString().substring(0, 100));
        });
        res.on('end', () => {
          console.log('[MAIN] Health response completa:', data.substring(0, 200));
          try {
            const json = JSON.parse(data);
            console.log('[MAIN] Health JSON parseado:', { status: json.status, printersCount: json.printersCount });
            resolve({ success: true, data: json });
          } catch (e) {
            console.error('[MAIN] Error parsing health response:', e, 'Data:', data);
            resolve({ success: false, error: 'Error parsing response: ' + e.message });
          }
        });
      });
      
      request.on('error', (error) => {
        console.error('[MAIN] Error en request de health:', error.message, error.code);
        resolve({ success: false, error: error.message || error.code || 'Unknown error' });
      });
      
      request.on('timeout', () => {
        console.error('[MAIN] Timeout en request de health');
        request.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
      
      // Asegurar que el timeout esté configurado
      request.setTimeout(5000);
    });
  } catch (error) {
    console.error('[MAIN] Error en get-agent-health:', error);
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('get-print-history', async () => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = 'http://127.0.0.1:3001/api/history';
    
    return new Promise((resolve) => {
      const request = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json.data || [], count: json.count || 0 });
          } catch (e) {
            resolve({ success: false, error: 'Error parsing response', data: [] });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ success: false, error: error.message, data: [] });
      });
      
      request.setTimeout(3000, () => {
        request.destroy();
        resolve({ success: false, error: 'Timeout', data: [] });
      });
    });
  } catch (error) {
    return { success: false, error: error.message || String(error), data: [] };
  }
});

ipcMain.handle('get-printers-list', async () => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = 'http://127.0.0.1:3001/api/printers';
    
    return new Promise((resolve) => {
      const request = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json.data || [], count: json.count || 0 });
          } catch (e) {
            resolve({ success: false, error: 'Error parsing response', data: [] });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ success: false, error: error.message, data: [] });
      });
      
      request.setTimeout(3000, () => {
        request.destroy();
        resolve({ success: false, error: 'Timeout', data: [] });
      });
    });
  } catch (error) {
    return { success: false, error: error.message || String(error), data: [] };
  }
});

ipcMain.handle('configure-printer', async (event, config) => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = 'http://127.0.0.1:3001/api/printer/configure';
    
    return new Promise((resolve) => {
      const postData = JSON.stringify(config);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };
      
      const request = http.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json });
          } catch (e) {
            resolve({ success: false, error: 'Error parsing response' });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
      
      request.write(postData);
      request.end();
    });
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('list-printers', async () => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = 'http://127.0.0.1:3001/api/printer/list-usb';
    
    return new Promise((resolve) => {
      const request = http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, data: json });
          } catch (e) {
            resolve({ success: false, error: 'Error parsing response' });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
      
      request.setTimeout(3000, () => {
        request.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
    });
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('test-print', async (event, printerId) => {
  try {
    const http = await import('http');
    // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
    const url = `http://127.0.0.1:3001/api/printer/test/${printerId}`;
    
    return new Promise((resolve) => {
      const postData = '';
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };
      
      const request = http.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({ success: true, message: json.message || 'Impresión de prueba enviada' });
            } else {
              resolve({ success: false, error: json.error || 'Error al imprimir' });
            }
          } catch (e) {
            resolve({ success: false, error: 'Error parsing response' });
          }
        });
      });
      
      request.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
      
      request.setTimeout(10000, () => {
        request.destroy();
        resolve({ success: false, error: 'Timeout - La impresora no respondió' });
      });
      
      request.write(postData);
      request.end();
    });
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  startAgent();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopAgent();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopAgent();
});
