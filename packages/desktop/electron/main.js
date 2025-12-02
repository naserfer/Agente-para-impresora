const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let agentProcess = null;
const agentPath = path.join(__dirname, '../../agent/server.js');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Configuraciones de seguridad adicionales
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    // Puerto del servidor Vite (default: 5173)
    const vitePort = process.env.VITE_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${vitePort}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Configurar Content Security Policy antes de crear ventanas
app.whenReady().then(() => {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  // CSP más restrictiva: sin unsafe-eval, solo unsafe-inline para desarrollo (necesario para Vite HMR)
  const csp = isDev
    ? [
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:* wss://localhost:*; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "object-src 'none'; " +
        "media-src 'self'"
      ]
    : [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' http://localhost:*; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "object-src 'none'; " +
        "media-src 'self'"
      ];
  
  // Configurar CSP para todas las sesiones
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': csp
      }
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopAgent();
    app.quit();
  }
});

// Función para liberar el puerto antes de iniciar
async function freePort(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const scriptPath = path.join(__dirname, '../../../stop-agent.ps1');
    
    exec(`powershell -File "${scriptPath}" -Port ${port}`, (error, stdout, stderr) => {
      // No importa si hay error, solo intentamos liberar
      resolve(true);
    });
  });
}

// IPC Handlers
ipcMain.handle('agent:start', async () => {
  if (agentProcess) {
    return { success: false, message: 'Agente ya está corriendo' };
  }

  // Intentar liberar el puerto antes de iniciar
  const agentPort = process.env.AGENT_PORT || '3001';
  await freePort(agentPort);
  
  // Esperar un momento para que el puerto se libere
  await new Promise(resolve => setTimeout(resolve, 1000));

  return new Promise((resolve) => {
    try {
      let hasError = false;
      let errorMessage = '';

      // Verificar que el archivo del agente exista
      if (!fs.existsSync(agentPath)) {
        resolve({ 
          success: false, 
          message: `No se encontró el archivo del agente en: ${agentPath}` 
        });
        return;
      }

      // Verificar que el directorio del agente exista
      const agentDir = path.join(__dirname, '../../agent');
      if (!fs.existsSync(agentDir)) {
        resolve({ 
          success: false, 
          message: `No se encontró el directorio del agente en: ${agentDir}` 
        });
        return;
      }

      agentProcess = spawn('node', [agentPath], {
        cwd: agentDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      });

      let output = '';
      let serverReady = false;
      
      agentProcess.stdout.on('data', (data) => {
        output += data.toString();
        const logText = data.toString();
        mainWindow.webContents.send('agent:log', logText);
        
        // Detectar cuando el servidor está listo
        if (logText.includes('Escuchando en') || logText.includes('Agente de impresión iniciado')) {
          serverReady = true;
        }
      });

      agentProcess.stderr.on('data', (data) => {
        output += data.toString();
        const errorText = data.toString();
        mainWindow.webContents.send('agent:error', errorText);
        
        // Detectar error de puerto ocupado
        if (errorText.includes('EADDRINUSE') || errorText.includes('address already in use')) {
          hasError = true;
          const agentPort = process.env.AGENT_PORT || '3001';
          errorMessage = `Puerto ${agentPort} ocupado. Ejecuta 'npm run stop' o 'powershell -File stop-agent.ps1' para liberarlo.`;
        }
        
        // Detectar otros errores críticos
        if (errorText.includes('Error al iniciar el servidor') || 
            errorText.includes('Cannot find module') ||
            errorText.includes('EACCES')) {
          hasError = true;
          errorMessage = `Error al iniciar el agente: ${errorText}`;
        }
      });

      agentProcess.on('close', (code) => {
        if (code !== 0 && !hasError) {
          hasError = true;
          errorMessage = `El agente se cerró inesperadamente (código: ${code})`;
        }
        agentProcess = null;
        mainWindow.webContents.send('agent:stopped', code);
      });

      agentProcess.on('error', (error) => {
        hasError = true;
        errorMessage = error.message;
        agentProcess = null;
        mainWindow.webContents.send('agent:error', error.message);
      });

      // Esperar a que el agente esté completamente listo
      const agentPort = parseInt(process.env.AGENT_PORT || '3001', 10);
      
      // Función para verificar el estado del agente
      const checkAgentStatus = async () => {
        if (hasError) {
          if (agentProcess) {
            agentProcess.kill();
            agentProcess = null;
          }
          resolve({ success: false, message: errorMessage });
          return;
        }
        
        if (!agentProcess || agentProcess.killed) {
          resolve({ 
            success: false, 
            message: 'El agente no pudo iniciar. El proceso se detuvo. Verifica los logs para más detalles.' 
          });
          return;
        }
        
        // Verificar que el agente esté realmente escuchando
        mainWindow?.webContents.send('agent:log', `⏳ Verificando que el servidor esté escuchando en el puerto ${agentPort}...\n`);
        
        // Primero verificar que el puerto esté escuchando usando netstat
        const { exec } = require('child_process');
        const checkPort = () => new Promise((resolve) => {
          exec(`netstat -ano | findstr ":${agentPort}" | findstr "LISTENING"`, (error, stdout) => {
            resolve(!error && stdout && stdout.trim().length > 0);
          });
        });
        
        let portCheckAttempts = 0;
        let portIsListening = false;
        while (portCheckAttempts < 10 && !portIsListening) {
          portIsListening = await checkPort();
          if (!portIsListening) {
            portCheckAttempts++;
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (!portIsListening) {
          mainWindow?.webContents.send('agent:log', `⚠️ El puerto ${agentPort} no está escuchando. El servidor puede no haber iniciado correctamente.\n`);
        } else {
          mainWindow?.webContents.send('agent:log', `✅ Puerto ${agentPort} está escuchando. Verificando conexión HTTP...\n`);
        }
        
        const isReady = await waitForAgentReady(agentPort, 30, 500); // Más intentos y más tiempo (hasta 15 segundos)
        
        if (isReady) {
          mainWindow?.webContents.send('agent:log', '✅ Agente iniciado y listo\n');
          resolve({ success: true, message: 'Agente iniciado correctamente' });
        } else {
          // Si no está listo pero el proceso está vivo, dar más información
          let diagnosticMessage = 'El agente inició pero el servidor no está respondiendo. ';
          
          if (serverReady) {
            diagnosticMessage += 'El servidor reportó estar listo pero no responde a conexiones. ';
          } else {
            diagnosticMessage += 'El servidor no reportó estar listo. ';
          }
          
          diagnosticMessage += 'Verifica los logs del agente para más detalles.';
          
          mainWindow?.webContents.send('agent:log', `⚠️ ${diagnosticMessage}\n`);
          resolve({ 
            success: false, 
            message: diagnosticMessage
          });
        }
      };
      
      // Esperar inicialmente 3 segundos para que el servidor tenga tiempo de iniciar
      setTimeout(checkAgentStatus, 3000);
    } catch (error) {
      agentProcess = null;
      resolve({ success: false, message: error.message });
    }
  });
});

ipcMain.handle('agent:stop', async () => {
  if (!agentProcess) {
    return { success: false, message: 'Agente no está corriendo' };
  }

  try {
    agentProcess.kill();
    agentProcess = null;
    return { success: true, message: 'Agente detenido' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('agent:status', async () => {
  if (!agentProcess) {
    return { running: false };
  }

  // Verificar si el proceso sigue vivo
  try {
    process.kill(agentProcess.pid, 0);
    return { running: true, pid: agentProcess.pid };
  } catch {
    agentProcess = null;
    return { running: false };
  }
});

// Función para verificar si un puerto está realmente escuchando (usando netstat en Windows)
function isPortListening(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // En Windows, usar netstat para verificar si el puerto está escuchando
    exec(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, (error, stdout) => {
      if (error || !stdout || stdout.trim().length === 0) {
        resolve(false);
      } else {
        // El puerto está escuchando
        resolve(true);
      }
    });
  });
}

// Función para verificar si el agente está listo (puerto escuchando)
function waitForAgentReady(port, maxAttempts = 30, delay = 500) {
  return new Promise(async (resolve) => {
    let attempts = 0;
    
    // Primero verificar que el puerto esté escuchando usando netstat
    const checkPortListening = async () => {
      attempts++;
      const isListening = await isPortListening(port);
      
      if (isListening) {
        // El puerto está escuchando, ahora intentar conectar
        return makeHttpConnection();
      } else {
        if (attempts >= maxAttempts) {
          resolve(false);
        } else {
          setTimeout(checkPortListening, delay);
        }
      }
    };
    
    // Función para hacer la conexión HTTP real
    const makeHttpConnection = () => {
      const hostnames = ['0.0.0.0', 'localhost', '127.0.0.1'];
      let hostnameIndex = 0;
      let connectionAttempts = 0;
      const maxConnectionAttempts = 5;
      
      const tryConnect = (hostname) => {
        connectionAttempts++;
        
        const req = http.request({
          hostname: hostname,
          port: port,
          path: '/',
          method: 'GET',
          timeout: 2000
        }, (res) => {
          // El servidor responde, está listo
          resolve(true);
        });
        
        req.on('error', (error) => {
          if (error.code === 'ECONNREFUSED') {
            // Intentar con el siguiente hostname
            if (hostnameIndex < hostnames.length - 1) {
              hostnameIndex++;
              setTimeout(() => tryConnect(hostnames[hostnameIndex]), delay);
            } else if (connectionAttempts < maxConnectionAttempts) {
              // Reintentar con el mismo hostname
              setTimeout(() => tryConnect(hostname), delay);
            } else {
              // Ya intentamos todo, el servidor no responde
              resolve(false);
            }
          } else {
            // Otro error
            if (connectionAttempts < maxConnectionAttempts) {
              setTimeout(() => tryConnect(hostname), delay);
            } else {
              resolve(false);
            }
          }
        });
        
        req.setTimeout(2000, () => {
          req.destroy();
          if (connectionAttempts < maxConnectionAttempts) {
            setTimeout(() => tryConnect(hostname), delay);
          } else {
            resolve(false);
          }
        });
        
        req.end();
      };
      
      tryConnect(hostnames[hostnameIndex]);
    };
    
    // Empezar verificando que el puerto esté escuchando
    checkPortListening();
  });
}

// Función helper para hacer peticiones HTTP usando el módulo nativo
function makeHttpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(parsed)
          });
        } catch (error) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve({ error: responseData })
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout: La petición tardó demasiado'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

ipcMain.handle('agent:test-print', async (event, data) => {
  try {
    // Verificar que el agente esté corriendo
    if (!agentProcess) {
      return { 
        success: false, 
        message: 'El agente no está corriendo. Inicia el agente primero.' 
      };
    }

    // Verificar que el proceso del agente esté vivo
    try {
      process.kill(agentProcess.pid, 0);
    } catch {
      return { 
        success: false, 
        message: 'El proceso del agente no está activo. Reinicia el agente.' 
      };
    }

    // Puerto del agente (default: 3001)
    const agentPort = parseInt(process.env.AGENT_PORT || '3001', 10);
    
    // Verificar primero con netstat que el puerto esté escuchando
    mainWindow?.webContents.send('agent:log', `⏳ Verificando puerto ${agentPort}...\n`);
    
    const { exec } = require('child_process');
    const checkPortWithNetstat = () => new Promise((resolve) => {
      exec(`netstat -ano | findstr ":${agentPort}" | findstr "LISTENING"`, (error, stdout) => {
        if (error || !stdout || stdout.trim().length === 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
    
    // Esperar hasta 10 segundos para que el puerto esté escuchando
    let portIsListening = false;
    for (let i = 0; i < 20; i++) {
      portIsListening = await checkPortWithNetstat();
      if (portIsListening) {
        mainWindow?.webContents.send('agent:log', `✅ Puerto ${agentPort} está escuchando\n`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!portIsListening) {
      return { 
        success: false, 
        message: `El puerto ${agentPort} no está escuchando. El servidor del agente puede no haber iniciado correctamente. Verifica los logs del agente para ver errores.` 
      };
    }
    
    // Ahora esperar a que responda HTTP
    mainWindow?.webContents.send('agent:log', '⏳ Esperando respuesta HTTP del agente...\n');
    
    const isReady = await waitForAgentReady(agentPort, 20, 500);
    
    if (!isReady) {
      return { 
        success: false, 
        message: `El puerto ${agentPort} está escuchando pero no responde a conexiones HTTP. Puede ser un problema de firewall o el servidor no está completamente iniciado. Ejecuta 'node test-conexion-agente.js' para más detalles.` 
      };
    }
    
    mainWindow?.webContents.send('agent:log', '✅ Agente está listo y respondiendo\n');
    
    // Verificar que el agente responda primero (health check)
    try {
      const healthOptions = {
        hostname: '0.0.0.0', // Cambiar de 0.0.0.0 a localhost (0.0.0.0 no es válido para conexiones cliente)
        port: agentPort,
        path: '/health',
        method: 'GET',
        timeout: 3000
      };
      
      const healthResponse = await makeHttpRequest(healthOptions);
      
      if (!healthResponse.ok) {
        return { 
          success: false, 
          message: `El agente no responde correctamente (status: ${healthResponse.status})` 
        };
      }
      
      // Esperar la Promise y obtener el JSON parseado
      const healthData = await healthResponse.json();
      
      if (healthData.status !== 'ok') {
        return { 
          success: false, 
          message: `El agente reporta estado: ${healthData.status}` 
        };
      }
    } catch (healthError) {
      console.log("health error: ", healthError);
      let errorMessage = `No se puede conectar al agente en http://localhost:${agentPort}. `;
      
      if (healthError.code === 'ECONNREFUSED') {
        errorMessage += `El puerto ${agentPort} no está escuchando. El agente puede no haber iniciado correctamente. Verifica los logs.`;
      } else if (healthError.message.includes('Timeout')) {
        errorMessage += 'El agente no responde. Verifica que esté funcionando.';
      } else {
        errorMessage += `Error: ${healthError.message}`;
      }
      
      return { success: false, message: errorMessage };
    }

    // Hacer la petición de impresión
    const printOptions = {
      hostname: '0.0.0.0',
      port: agentPort,
      path: '/print',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    };

    const response = await makeHttpRequest(printOptions, data);

    // Esperar la Promise y obtener el JSON parseado
    const result = await response.json();

    if (!response.ok) {
      return { 
        success: false, 
        message: `Error del agente (${response.status}): ${result.error || 'Error desconocido'}` 
      };
    }

    return { success: true, data: result };
  } catch (error) {
    // Manejar diferentes tipos de errores
    let errorMessage = error.message;
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `No se puede conectar al agente en el puerto ${process.env.AGENT_PORT || '3001'}. Verifica que el agente esté corriendo.`;
    } else if (error.message.includes('Timeout')) {
      errorMessage = 'La petición tardó demasiado. Verifica que el agente esté respondiendo.';
    } else if (error.message.includes('fetch failed')) {
      errorMessage = `Error de conexión. Verifica que el agente esté corriendo en http://localhost:${process.env.AGENT_PORT || '3001'}`;
    }
    
    return { success: false, message: errorMessage };
  }
});

ipcMain.handle('agent:get-logs', async () => {
  try {
    const logPath = path.join(__dirname, '../../agent/logs/combined.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').slice(-100); // Últimas 100 líneas
      return { success: true, logs: lines };
    }
    return { success: true, logs: [] };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

function stopAgent() {
  if (agentProcess) {
    try {
      // En Windows, usar taskkill para asegurar que se detenga
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        exec(`taskkill /F /PID ${agentProcess.pid}`, (error) => {
          // Ignorar errores si el proceso ya no existe
        });
      } else {
        agentProcess.kill('SIGTERM');
      }
      agentProcess = null;
    } catch (error) {
      // Ignorar errores al detener
      agentProcess = null;
    }
  }
}

