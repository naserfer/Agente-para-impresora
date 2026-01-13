import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn, exec } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import http from 'http';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mantener referencia global de la ventana
let mainWindow;
let agentProcess = null;
let tray = null;
let isQuitting = false;

// Crear system tray
function createTray() {
  const isDev = !app.isPackaged;
  
  // Intentar múltiples rutas para el icono
  let iconPath = null;
  const possiblePaths = [
    isDev ? join(__dirname, '../../assets/icon.png') : null,
    join(app.getAppPath(), 'assets/icon.png'),
    join(process.resourcesPath, '../assets/icon.png'),
    join(process.resourcesPath, 'assets/icon.png'),
  ].filter(Boolean);
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      iconPath = path;
      break;
    }
  }
  
  // Crear el icono del tray
  let trayIcon;
  if (iconPath) {
    try {
      const image = nativeImage.createFromPath(iconPath);
      if (!image.isEmpty()) {
        // Resize a 16x16 para el tray (Windows requiere tamaño específico)
        trayIcon = image.resize({ width: 16, height: 16 });
      }
    } catch (err) {
      console.warn('[MAIN] ⚠️ Error cargando icono del tray:', err.message);
    }
  }
  
  // Si no se pudo cargar el icono, usar uno vacío (Electron usará el icono por defecto)
  if (!trayIcon || trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar ventana',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Ocultar ventana',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Agente de Impresión');
  tray.setContextMenu(contextMenu);
  
  // Click en el icono del tray muestra/oculta la ventana
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
  
  console.log('✅ System tray creado');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // No mostrar hasta que esté listo (mejora percepción de velocidad)
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
  
  // No cerrar la app cuando se cierra la ventana, solo esconderla
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('🪟 Ventana escondida (app sigue corriendo en segundo plano)');
    }
  });
  
  // Mostrar ventana tan pronto como el DOM esté listo (no esperar a did-finish-load)
  // Esto mejora significativamente la percepción de velocidad
  mainWindow.webContents.once('dom-ready', () => {
    console.log('✅ DOM listo - mostrando ventana inmediatamente');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show(); // Mostrar ventana tan pronto como el DOM esté listo
    }
  });
  
  // Logs adicionales cuando la página termine de cargar completamente
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Página completamente cargada');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', '[MAIN] ✅ Ventana cargada correctamente\n');
      mainWindow.webContents.send('agent-log', '[MAIN] 📡 Sistema de logs funcionando\n');
      
      mainWindow.webContents.send('main-process-log', { 
        message: 'Ventana cargada - Sistema listo', 
        level: 'log', 
        timestamp: new Date().toISOString() 
      });
    }
  });
  
  // También enviar cuando el DOM esté listo
  mainWindow.webContents.once('dom-ready', () => {
    console.log('✅ DOM listo');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', '[MAIN] ✅ DOM listo\n');
    }
  });
}

// Función auxiliar para iniciar el proceso del agente
function spawnAgentProcess() {
  const isDev = !app.isPackaged;
  // En producción, el agente está en resources/agent
  // En desarrollo, está en ../../agent
  const agentPath = isDev
    ? join(__dirname, '../../agent')
    : join(process.resourcesPath, 'agent');

  const agentScript = join(agentPath, 'server.js');

  if (!existsSync(agentPath)) {
    console.error(`❌ No se encontró el directorio del agente en: ${agentPath}`);
    // Intentar ruta alternativa por si acaso
    if (!isDev) {
      console.log('Intentando ruta alternativa de desarrollo...');
      const altPath = join(__dirname, '../../agent');
      if (existsSync(altPath)) {
        // Si lo encuentra aquí, es que no se empaquetó bien, pero intentamos correrlo
        return spawn('node', [join(altPath, 'server.js')], {
          cwd: altPath,
          stdio: 'pipe',
          shell: true,
          env: { ...process.env, NODE_ENV: 'production' }
        });
      }
    }
    return null;
  }

  console.log(`🚀 Iniciando agente desde: ${agentPath}`);
  console.log(`📄 Script del agente: ${agentScript}`);
  console.log(`📁 Existe el directorio: ${existsSync(agentPath)}`);
  console.log(`📄 Existe el script: ${existsSync(agentScript)}`);
  
  // Enviar información al renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', `🚀 Iniciando agente desde: ${agentPath}\n`);
    mainWindow.webContents.send('agent-log', `📄 Script: ${agentScript}\n`);
    mainWindow.webContents.send('agent-log', `📁 Directorio existe: ${existsSync(agentPath)}\n`);
    mainWindow.webContents.send('agent-log', `📄 Script existe: ${existsSync(agentScript)}\n`);
  }

  if (!existsSync(agentScript)) {
    console.error(`❌ El script del agente no existe: ${agentScript}`);
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', `❌ ERROR: El script del agente no existe en: ${agentScript}\n`);
    }
    return null;
  }

  // En producción, usar el binario de Electron como Node.js
  // En desarrollo, usar 'node' del PATH
  const nodeCommand = isDev ? 'node' : process.execPath;
  // IMPORTANTE: En producción, necesitamos pasar ELECTRON_RUN_AS_NODE como argumento
  // O configurarlo en el entorno (ya lo hacemos en nodeEnv)
  const nodeArgs = isDev ? [agentScript] : [agentScript];
  
  // Configurar NODE_PATH correctamente
  // NODE_PATH debe apuntar al directorio que CONTIENE node_modules, no a node_modules mismo
  const nodeModulesPath = join(agentPath, 'node_modules');
  const nodePath = agentPath; // NODE_PATH debe ser el directorio padre de node_modules
  
  // Verificar que el módulo 'ws' existe ANTES de continuar
  const wsModulePath = join(nodeModulesPath, 'ws');
  if (!existsSync(wsModulePath)) {
    console.error(`❌ Módulo 'ws' no encontrado en: ${wsModulePath}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `❌ ERROR CRÍTICO: Módulo 'ws' no encontrado\n`);
      mainWindow.webContents.send('agent-log', `❌ Ruta esperada: ${wsModulePath}\n`);
      mainWindow.webContents.send('agent-log', `❌ node_modules existe: ${existsSync(nodeModulesPath)}\n`);
      mainWindow.webContents.send('agent-status', { running: false, error: 'Module ws not found - node_modules may be incomplete' });
    }
    return null;
  }
  
  // Cargar variables de entorno desde userData si existe
  const userDataEnvPath = join(app.getPath('userData'), '.env');
  const envVars = { ...process.env };
  
  if (existsSync(userDataEnvPath)) {
    try {
      const envContent = readFileSync(userDataEnvPath, 'utf8');
      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          if (key && value) {
            envVars[key.trim()] = value;
          }
        }
      });
      console.log('[MAIN] ✅ Variables de entorno cargadas desde userData');
    } catch (error) {
      console.warn('[MAIN] ⚠️ Error leyendo .env desde userData:', error.message);
    }
  }
  
  const nodeEnv = isDev 
    ? { ...envVars, NODE_ENV: 'production', PATH: process.env.PATH }
    : { 
        ...envVars, // Incluir variables del .env de userData
        NODE_ENV: 'production', 
        ELECTRON_RUN_AS_NODE: '1', 
        PATH: process.env.PATH,
        NODE_PATH: nodePath, // Directorio que contiene node_modules
        // Asegurar que las variables críticas estén disponibles
        USERPROFILE: process.env.USERPROFILE,
        APPDATA: process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        // Forzar resolución de módulos desde el directorio del agente
        PWD: agentPath,
        INIT_CWD: agentPath
      };
  
  console.log(`🔧 NODE_PATH configurado: ${nodePath}`);
  console.log(`🔧 node_modules existe: ${existsSync(nodeModulesPath)}`);
  console.log(`✅ Módulo 'ws' verificado: ${wsModulePath}`);
  
  console.log(`🔧 Ejecutando: ${nodeCommand} ${agentScript}`);
  console.log(`📁 Directorio de trabajo: ${agentPath}`);
  console.log(`🔧 Modo: ${isDev ? 'Desarrollo' : 'Producción'}`);
  console.log(`🔧 ELECTRON_RUN_AS_NODE: ${nodeEnv.ELECTRON_RUN_AS_NODE || 'no'}`);
  console.log(`🔧 node_modules existe: ${existsSync(join(agentPath, 'node_modules'))}`);
  
  // Enviar al renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', `🔧 Ejecutando: ${nodeCommand} ${agentScript}\n`);
    mainWindow.webContents.send('agent-log', `📁 Directorio: ${agentPath}\n`);
    mainWindow.webContents.send('agent-log', `🔧 Modo: ${isDev ? 'Desarrollo' : 'Producción'}\n`);
    mainWindow.webContents.send('agent-log', `🔧 node_modules existe: ${existsSync(join(agentPath, 'node_modules'))}\n`);
  }
  
  // Log ANTES de spawn para verificar que llegamos aquí
  console.log('🔧 ANTES DE SPAWN - Verificando todo...');
  console.log('🔧 nodeCommand:', nodeCommand);
  console.log('🔧 nodeArgs:', nodeArgs);
  console.log('🔧 agentPath:', agentPath);
  console.log('🔧 agentScript:', agentScript);
  console.log('🔧 userDataEnvPath:', userDataEnvPath);
  const loadedVars = Object.keys(envVars).filter(k => k.includes('SUPABASE') || k.includes('CLIENT') || k.includes('PRINTER'));
  console.log('[MAIN] 🔧 Variables de entorno cargadas:', loadedVars.join(', '));
  if (loadedVars.length === 0) {
    console.warn('[MAIN] ⚠️ No se encontraron variables de entorno críticas en userData');
  } else {
    console.log('[MAIN] ✅ Variables críticas presentes:', loadedVars.map(k => `${k}=${envVars[k] ? '***' : 'MISSING'}`).join(', '));
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', '🔧 ANTES DE SPAWN - Preparando para iniciar el proceso...\n');
    mainWindow.webContents.send('agent-log', `🔧 Comando: ${nodeCommand}\n`);
    mainWindow.webContents.send('agent-log', `🔧 Argumentos: ${nodeArgs.join(' ')}\n`);
    mainWindow.webContents.send('agent-log', `🔧 Directorio: ${agentPath}\n`);
    mainWindow.webContents.send('agent-log', `🔧 .env en userData: ${existsSync(userDataEnvPath) ? 'SÍ' : 'NO'}\n`);
  }

  let childProcess;
  try {
    console.log(`✅ Módulo 'ws' encontrado, procediendo con spawn...`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `✅ Módulo 'ws' verificado, iniciando proceso...\n`);
    }
    
    childProcess = spawn(
      nodeCommand,
      nodeArgs,
      {
        cwd: agentPath, // CRÍTICO: cwd debe ser agentPath para que require() funcione
        stdio: 'pipe',
        shell: isDev, // Solo usar shell en desarrollo
        env: nodeEnv,
      }
    );
    console.log('✅ SPAWN EXITOSO - PID:', childProcess.pid);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `✅ Proceso spawnado exitosamente (PID: ${childProcess.pid})\n`);
    }
  } catch (spawnError) {
    console.error('❌ ERROR EN SPAWN:', spawnError);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `❌ ERROR AL HACER SPAWN: ${spawnError.message}\n`);
      mainWindow.webContents.send('agent-status', { running: false, error: spawnError.message });
    }
    return null;
  }

  // Guardar referencia inmediatamente
  agentProcess = childProcess;

  // Manejar errores de spawn (esto se ejecuta si spawn falla)
  childProcess.on('error', (error) => {
    const errorMsg = `❌ ERROR DE SPAWN: ${error.message}\nCódigo: ${error.code}\nRuta intentada: ${agentScript}`;
    console.error('❌ ERROR DE SPAWN:', error);
    console.error('❌ Error completo:', JSON.stringify(error, null, 2));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `❌ ERROR DE SPAWN: ${error.message}\n`);
      mainWindow.webContents.send('agent-log', `❌ Código: ${error.code}\n`);
      mainWindow.webContents.send('agent-log', `❌ Ruta: ${agentScript}\n`);
      mainWindow.webContents.send('agent-status', { running: false, error: error.message, code: error.code });
    }
    agentProcess = null;
  });

  childProcess.stdout.on('data', (data) => {
    const message = data.toString();
    console.log('[AGENT STDOUT]', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', message);
      // Si vemos el mensaje de inicio del servidor, el agente está corriendo
      if (message.includes('Agente de impresión iniciado') || message.includes('Escuchando en') || message.includes('SERVIDOR INICIADO')) {
        mainWindow.webContents.send('agent-status', { running: true });
      }
    }
  });

  childProcess.stderr.on('data', (data) => {
    const message = data.toString();
    console.error('[AGENT STDERR]', message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Marcar claramente como ERROR con emoji
      mainWindow.webContents.send('agent-log', `❌ [ERROR] ${message}`);
      // Si hay errores críticos, actualizar el estado
      if (message.includes('Error') || message.includes('Cannot') || message.includes('ENOENT') || 
          message.includes('MODULE_NOT_FOUND') || message.includes('Cannot find module') ||
          message.includes('SyntaxError') || message.includes('ReferenceError') ||
          message.includes('TypeError') || message.includes('at ')) {
        const errorMsg = message.substring(0, 500);
        mainWindow.webContents.send('agent-status', { running: false, error: errorMsg });
        console.error('❌ ERROR CRÍTICO DEL AGENTE:', errorMsg);
      }
    }
  });

  childProcess.on('close', (code, signal) => {
    console.log(`⚠️ Proceso del agente terminó con código ${code}, señal: ${signal}`);
    if (code !== 0 && code !== null) {
      console.error(`❌ El agente se cerró con código de error: ${code}`);
      console.error(`❌ Esto generalmente indica un error de inicio (módulo faltante, error de sintaxis, etc.)`);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `⚠️ Agente terminó (código: ${code}, señal: ${signal})\n`);
      if (code !== 0 && code !== null) {
        mainWindow.webContents.send('agent-log', `❌ ERROR: El agente se cerró inesperadamente (código ${code}).\n`);
        mainWindow.webContents.send('agent-log', `💡 Revisa los logs anteriores para ver el error específico.\n`);
        mainWindow.webContents.send('agent-log', `💡 Verifica que node_modules esté completo en: ${agentPath}\n`);
      }
      mainWindow.webContents.send('agent-status', { running: false, code, signal });
    }
    agentProcess = null;
  });

  // Log inmediato del PID
  console.log('✅ Proceso del agente spawnado, PID:', childProcess.pid);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', `✅ Proceso del agente iniciado (PID: ${childProcess.pid})\n`);
  }

  // Esperar un momento para verificar que el proceso se inició correctamente
  setTimeout(() => {
    if (childProcess.killed) {
      console.error('❌ El proceso del agente fue terminado inmediatamente');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-log', '❌ El proceso del agente fue terminado inmediatamente\n');
        mainWindow.webContents.send('agent-log', '💡 Revisa los logs anteriores para ver el error específico\n');
        mainWindow.webContents.send('agent-status', { running: false, error: 'Process killed immediately' });
      }
      agentProcess = null;
    } else {
      console.log('✅ Proceso del agente sigue corriendo, PID:', childProcess.pid);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-log', `✅ Proceso corriendo (PID: ${childProcess.pid}), esperando que el servidor inicie...\n`);
      }
      // Verificar health después de 5 segundos (dar más tiempo para que inicie)
      setTimeout(() => {
        verifyAgentHealth();
      }, 5000);
    }
  }, 3000); // Aumentado a 3 segundos para dar más tiempo

  return childProcess;
}

// Iniciar el agente cuando se inicia la app
function startAgent() {
  console.log('[MAIN] startAgent() llamado');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', '[MAIN] startAgent() llamado\n');
  }
  
  if (agentProcess) {
    console.log('⚠️ Agente ya está corriendo, no se iniciará otro');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', '[MAIN] ⚠️ Agente ya está corriendo\n');
    }
    return; // Ya está corriendo
  }

  console.log('🔍 Verificando si el agente ya está corriendo...');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-log', '[MAIN] 🔍 Verificando si el agente ya está corriendo...\n');
  }

  // Verificar si el agente ya está corriendo en el puerto 3001
  // Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
  // Reducir timeout para iniciar más rápido
  const checkRequest = http.get('http://127.0.0.1:3001/health', { timeout: 1000 }, (res) => {
    // El agente ya está corriendo
    console.log('✅ Agente ya está corriendo en el puerto 3001');
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', '✅ Agente ya está corriendo en el puerto 3001\n');
      mainWindow.webContents.send('agent-status', { running: true });
    }
    checkRequest.destroy();
  });

  checkRequest.on('error', (error) => {
    console.log('⚠️ Agente no está corriendo, iniciando...', error.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', `⚠️ Agente no está corriendo, iniciando...\n`);
    }
    // El agente no está corriendo, iniciarlo
    agentProcess = spawnAgentProcess();
    if (!agentProcess) {
      console.error('❌ No se pudo iniciar el proceso del agente');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-log', '❌ ERROR: No se pudo iniciar el proceso del agente\n');
        mainWindow.webContents.send('agent-log', '💡 Verifica que el directorio del agente y node_modules existan\n');
        mainWindow.webContents.send('agent-status', { running: false, error: 'Failed to spawn process' });
      }
      return;
    }
    
    // Esperar un poco antes de verificar el estado y enviar configuración
    setTimeout(() => {
      verifyAgentHealth();
      // Si hay configuración guardada, enviarla al agente
      sendSavedPrinterConfigToAgent();
    }, 5000); // Aumentado a 5 segundos
  });

  checkRequest.on('timeout', () => {
    console.log('⏱️ Timeout verificando agente, iniciando nuevo proceso...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-log', '⏱️ Timeout verificando agente, iniciando nuevo proceso...\n');
    }
    checkRequest.destroy();
    // Timeout significa que el agente no está corriendo, iniciarlo
    agentProcess = spawnAgentProcess();
    if (!agentProcess) {
      console.error('❌ No se pudo iniciar el proceso del agente');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-log', '❌ ERROR: No se pudo iniciar el proceso del agente\n');
        mainWindow.webContents.send('agent-log', '💡 Verifica que el directorio del agente y node_modules existan\n');
        mainWindow.webContents.send('agent-status', { running: false, error: 'Failed to spawn process' });
      }
      return;
    }
    
    // Esperar un poco antes de verificar el estado y enviar configuración
    setTimeout(() => {
      verifyAgentHealth();
      // Si hay configuración guardada, enviarla al agente
      sendSavedPrinterConfigToAgent();
    }, 5000); // Aumentado a 5 segundos
  });

  checkRequest.setTimeout(1000); // Reducido de 2000ms a 1000ms para iniciar más rápido
}

// IPC handler para obtener información de debug del agente
ipcMain.handle('get-agent-debug-info', async () => {
  const isDev = !app.isPackaged;
  const agentPath = isDev
    ? join(__dirname, '../../agent')
    : join(process.resourcesPath, 'agent');
  
  const agentScript = join(agentPath, 'server.js');
  const nodeModulesPath = join(agentPath, 'node_modules');
  
  return {
    isDev,
    agentPath,
    agentScript,
    agentPathExists: existsSync(agentPath),
    agentScriptExists: existsSync(agentScript),
    nodeModulesExists: existsSync(nodeModulesPath),
    processRunning: agentProcess !== null && !agentProcess.killed,
    processPid: agentProcess?.pid || null,
    resourcesPath: process.resourcesPath,
    __dirname: __dirname
  };
});

// Función auxiliar para verificar el health del agente
function verifyAgentHealth() {
  console.log('🔍 Verificando health del agente...');
  const healthRequest = http.get('http://127.0.0.1:3001/health', { timeout: 5000 }, (res) => {
    console.log('✅ Agente está respondiendo correctamente');
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', '✅ Agente iniciado y respondiendo correctamente\n');
      mainWindow.webContents.send('agent-status', { running: true });
    }
    healthRequest.destroy();
  });

  healthRequest.on('error', (error) => {
    console.error('❌ El agente no está respondiendo:', error.message);
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', `⚠️ El agente inició pero no está respondiendo: ${error.message}\n`);
      mainWindow.webContents.send('agent-status', { running: false, error: error.message });
    }
  });

  healthRequest.on('timeout', () => {
    console.error('❌ Timeout verificando health del agente');
    healthRequest.destroy();
    if (mainWindow) {
      mainWindow.webContents.send('agent-log', '⚠️ Timeout verificando health del agente\n');
      mainWindow.webContents.send('agent-status', { running: false, error: 'Health check timeout' });
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

// Función para enviar configuración guardada al agente cuando se inicia
async function sendSavedPrinterConfigToAgent() {
  try {
    const isDevMode = !app.isPackaged;
    const agentPath = isDevMode 
      ? join(__dirname, '../../agent/printers-config.json')
      : join(process.resourcesPath, 'agent/printers-config.json');
    
    // Intentar cargar desde el archivo del agente primero
    if (existsSync(agentPath)) {
      try {
        const configData = readFileSync(agentPath, 'utf8');
        const configs = JSON.parse(configData);
        
        // Enviar cada configuración al agente
        for (const [printerId, config] of Object.entries(configs)) {
          await sendPrinterConfigToAgent({
            printerId,
            type: config.type || 'usb',
            printerName: config.printerName
          });
        }
        console.log('[MAIN] ✅ Configuraciones guardadas enviadas al agente');
        return;
      } catch (e) {
        console.warn('[MAIN] ⚠️ Error leyendo configuración del agente:', e.message);
      }
    }
    
    // Fallback: intentar desde userData
    const userDataPath = join(app.getPath('userData'), 'printer-config.json');
    if (existsSync(userDataPath)) {
      try {
        const configData = readFileSync(userDataPath, 'utf8');
        const config = JSON.parse(configData);
        await sendPrinterConfigToAgent({
          printerId: config.printerId,
          type: config.type || 'usb',
          printerName: config.printerName
        });
        console.log('[MAIN] ✅ Configuración desde userData enviada al agente');
      } catch (e) {
        console.warn('[MAIN] ⚠️ Error leyendo configuración de userData:', e.message);
      }
    }
  } catch (error) {
    console.error('[MAIN] ❌ Error enviando configuración al agente:', error.message);
  }
}

// Función auxiliar para enviar configuración al agente
async function sendPrinterConfigToAgent(config) {
  return new Promise((resolve) => {
    const http = require('http');
    const url = 'http://127.0.0.1:3001/api/printer/configure';
    const postData = JSON.stringify(config);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3000
    };

    const request = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`[MAIN] ✅ Configuración de impresora ${config.printerId} enviada al agente`);
          resolve({ success: true, data: json });
        } catch (e) {
          console.warn(`[MAIN] ⚠️ Agente no respondió correctamente para ${config.printerId}`);
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });

    request.on('error', (error) => {
      console.warn(`[MAIN] ⚠️ No se pudo enviar configuración al agente: ${error.message}`);
      resolve({ success: false, error: error.message });
    });

    request.on('timeout', () => {
      request.destroy();
      console.warn(`[MAIN] ⚠️ Timeout enviando configuración al agente`);
      resolve({ success: false, error: 'Timeout' });
    });

    request.setTimeout(3000);
    request.write(postData);
    request.end();
  });
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
    const isDevMode = !app.isPackaged;
    
    // Guardar en múltiples lugares para asegurar persistencia
    const userDataPath = join(app.getPath('userData'), 'printer-config.json');
    const agentPath = isDevMode 
      ? join(__dirname, '../../agent/printers-config.json')
      : join(process.resourcesPath, 'agent/printers-config.json');
    
    const configData = {
      printerId: config.printerId,
      type: config.type || 'usb',
      printerName: config.printerName,
      savedAt: new Date().toISOString()
    };
    
    // Guardar en userData (para el desktop)
    try {
      writeFileSync(userDataPath, JSON.stringify(configData, null, 2), 'utf8');
      console.log('[MAIN] ✅ Configuración guardada en userData:', configData);
    } catch (writeError) {
      console.error('[MAIN] ❌ Error guardando en userData:', writeError);
    }
    
    // Guardar también en el formato que el agente espera (printers-config.json)
    try {
      let agentConfigs = {};
      if (existsSync(agentPath)) {
        try {
          const existingData = readFileSync(agentPath, 'utf8');
          agentConfigs = JSON.parse(existingData);
        } catch (e) {
          console.warn('[MAIN] ⚠️ No se pudo leer configuración existente, creando nueva');
        }
      }
      
      // Agregar/actualizar la configuración de esta impresora
      agentConfigs[config.printerId] = {
        printerId: config.printerId,
        type: config.type || 'usb',
        printerName: config.printerName,
        port: config.port || 'USB'
      };
      
      writeFileSync(agentPath, JSON.stringify(agentConfigs, null, 2), 'utf8');
      console.log('[MAIN] ✅ Configuración guardada en formato del agente:', agentPath);
    } catch (agentWriteError) {
      console.error('[MAIN] ❌ Error guardando en formato del agente:', agentWriteError);
    }

    // Intentar enviar al agente si está disponible (opcional)
    try {
      const http = await import('http');
      const url = 'http://127.0.0.1:3001/api/printer/configure';

      return new Promise((resolve) => {
        const postData = JSON.stringify(config);
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 3000 // Timeout corto para no bloquear
        };

        const request = http.request(url, options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              console.log('[MAIN] ✅ Configuración también enviada al agente');
              resolve({ success: true, data: json, savedLocally: true });
            } catch (e) {
              // Si falla el parseo, igual está guardado localmente
              resolve({ success: true, savedLocally: true, warning: 'Guardado localmente, agente no respondió correctamente' });
            }
          });
        });

        request.on('error', (error) => {
          // Si el agente no está disponible, igual está guardado localmente
          console.log('[MAIN] ⚠️ Agente no disponible, pero configuración guardada localmente');
          resolve({ success: true, savedLocally: true, warning: 'Guardado localmente, agente no disponible' });
        });

        request.on('timeout', () => {
          request.destroy();
          resolve({ success: true, savedLocally: true, warning: 'Guardado localmente, agente no respondió a tiempo' });
        });

        request.setTimeout(3000);
        request.write(postData);
        request.end();
      });
    } catch (agentError) {
      // Si falla todo, al menos está guardado localmente
      console.log('[MAIN] ⚠️ No se pudo conectar al agente, pero configuración guardada localmente');
      return { success: true, savedLocally: true, warning: 'Guardado localmente, agente no disponible' };
    }
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle('list-printers', async () => {
  try {
    // DETECCIÓN DIRECTA: Usar PowerShell directamente desde Electron
    // Esto NO depende del agente corriendo
    if (process.platform === 'win32') {
      console.log('[MAIN] 🔍 Detectando impresoras directamente con PowerShell...');
      
      return new Promise((resolve) => {
        // Usar un script PowerShell más simple que extraiga solo los campos necesarios
        // Crear un script temporal para evitar problemas con comillas
        const tempScript = join(os.tmpdir(), `detect-printers-${Date.now()}.ps1`);
        
        const psScript = `$ErrorActionPreference = 'Stop'
try {
    $printers = Get-Printer -ErrorAction SilentlyContinue | Select-Object Name, PortName, DriverName, PrinterStatus, Type
    $result = @()
    foreach ($p in $printers) {
        $result += @{
            Name = if ($p.Name) { $p.Name } else { '' }
            PortName = if ($p.PortName) { $p.PortName } else { '' }
            DriverName = if ($p.DriverName) { $p.DriverName } else { '' }
            PrinterStatus = if ($p.PrinterStatus) { $p.PrinterStatus.ToString() } else { '' }
            Type = if ($p.Type) { $p.Type.ToString() } else { '' }
        }
    }
    $result | ConvertTo-Json -Depth 3 -Compress
} catch {
    Write-Error $_.Exception.Message
    exit 1
}`;
        
        try {
          writeFileSync(tempScript, psScript, 'utf8');
        } catch (writeError) {
          console.error('[MAIN] ❌ Error escribiendo script temporal:', writeError);
          return tryAgentFallback(resolve);
        }
        
        const command = `powershell -ExecutionPolicy Bypass -File "${tempScript}"`;
        
        console.log('[MAIN] Ejecutando comando PowerShell para detectar impresoras...');
        
        exec(command, { 
          encoding: 'utf8', 
          maxBuffer: 1024 * 1024,
          timeout: 10000 
        }, (error, stdout, stderr) => {
          // Limpiar archivo temporal
          try {
            unlinkSync(tempScript);
          } catch (cleanupError) {
            // Ignorar errores de limpieza
          }
          if (error) {
            console.error('[MAIN] ❌ Error ejecutando PowerShell:', error.message);
            if (stderr) {
              console.error('[MAIN] stderr completo:', stderr);
            }
            if (stdout) {
              console.error('[MAIN] stdout (aunque hubo error):', stdout.substring(0, 500));
            }
            // Intentar fallback: verificar si el agente está corriendo
            return tryAgentFallback(resolve);
          }

          try {
            const output = stdout.trim();
            
            // Log completo para debugging
            console.log('[MAIN] 📋 Output completo de PowerShell (primeros 1000 chars):', output.substring(0, 1000));
            
            if (!output || output === '') {
              console.warn('[MAIN] ⚠️ PowerShell no devolvió impresoras (output vacío)');
              console.warn('[MAIN] stderr (si existe):', stderr);
              return tryAgentFallback(resolve);
            }

            let printers;
            try {
              printers = JSON.parse(output);
              console.log('[MAIN] ✅ JSON parseado correctamente');
            } catch (parseError) {
              console.error('[MAIN] ❌ Error parseando JSON de PowerShell:', parseError.message);
              console.error('[MAIN] Output completo (primeros 500 chars):', output.substring(0, 500));
              console.error('[MAIN] Output completo (últimos 500 chars):', output.substring(Math.max(0, output.length - 500)));
              // Intentar limpiar el output y parsear de nuevo
              try {
                // A veces PowerShell agrega caracteres BOM o espacios extra
                const cleanedOutput = output.replace(/^\uFEFF/, '').trim();
                printers = JSON.parse(cleanedOutput);
                console.log('[MAIN] ✅ JSON parseado después de limpiar BOM');
              } catch (retryError) {
                console.error('[MAIN] ❌ Error en segundo intento de parseo:', retryError.message);
                return tryAgentFallback(resolve);
              }
            }

            // Si es un solo objeto, convertirlo a array
            if (!Array.isArray(printers)) {
              printers = [printers];
            }

            console.log(`[MAIN] ✅ PowerShell encontró ${printers.length} impresora(s) sin filtrar`);
            if (printers.length > 0) {
              console.log('[MAIN] 📋 Lista completa de impresoras (antes de filtrar):');
              printers.forEach((p, idx) => {
                console.log(`[MAIN]   ${idx + 1}. Nombre: "${p?.Name || 'sin nombre'}", Puerto: "${p?.PortName || 'N/A'}", Driver: "${p?.DriverName || 'N/A'}", Status: "${p?.PrinterStatus || 'N/A'}", Tipo: "${p?.Type || 'N/A'}"`);
              });
            }

            // Formatear y filtrar las impresoras virtuales (filtro menos agresivo)
            // Solo filtrar si el nombre COINCIDE EXACTAMENTE o contiene palabras clave muy específicas
            const virtualPrinters = [
              'Microsoft Print to PDF',
              'Fax',
              'OneNote',
              'XPS Document Writer',
              'Send To OneNote',
              'Root Print Queue'
            ];
            const formattedPrinters = printers
              .filter(p => {
                if (!p || !p.Name) {
                  console.log(`[MAIN] ⏭️ Filtrando impresora sin nombre:`, p);
                  return false;
                }
                const name = String(p.Name).trim();
                
                // Filtrar solo si coincide exactamente o contiene palabras muy específicas
                const isVirtual = virtualPrinters.some(vp => {
                  const vpLower = vp.toLowerCase();
                  const nameLower = name.toLowerCase();
                  // Coincidencia exacta o contiene la palabra completa
                  return nameLower === vpLower || 
                         (nameLower.includes('pdf') && nameLower.includes('print')) ||
                         (nameLower.includes('fax') && !nameLower.includes('epson')) ||
                         (nameLower.includes('onenote') && !nameLower.includes('epson')) ||
                         (nameLower === 'xps document writer');
                });
                
                if (isVirtual) {
                  console.log(`[MAIN] ⏭️ Filtrando impresora virtual: ${name}`);
                } else {
                  console.log(`[MAIN] ✅ Manteniendo impresora: ${name} (Puerto: ${p?.PortName || 'N/A'})`);
                }
                return !isVirtual;
              })
              .map(printer => ({
                name: String(printer.Name).trim(),
                portName: String(printer.PortName || 'USB').trim(),
                displayName: `${String(printer.Name).trim()}${printer.DriverName ? ` (${String(printer.DriverName).trim()})` : ''}`,
                driverName: String(printer.DriverName || '').trim()
              }));

            console.log(`[MAIN] ✅ ${formattedPrinters.length} impresora(s) formateada(s) después del filtro`);
            if (formattedPrinters.length > 0) {
              console.log('[MAIN] Impresoras detectadas:', formattedPrinters.map(p => p.name).join(', '));
            } else {
              console.warn('[MAIN] ⚠️ No se encontraron impresoras físicas después del filtro');
            }
            
            resolve({ success: true, data: formattedPrinters });
          } catch (parseError) {
            console.error('[MAIN] ❌ Error procesando impresoras:', parseError);
            return tryAgentFallback(resolve);
          }
        });
      });
    } else {
      // Linux/Mac: intentar con el agente como fallback
      return new Promise((resolve) => {
        tryAgentFallback(resolve);
      });
    }
  } catch (error) {
    console.error('[MAIN] ❌ Error en list-printers handler:', error);
    return { success: false, error: error.message || String(error), data: [] };
  }
});

// Función auxiliar para intentar obtener impresoras del agente como fallback
async function tryAgentFallback(resolve) {
  try {
    console.log('[MAIN] 🔄 Intentando obtener impresoras del agente como fallback...');
    const http = await import('http');
    const url = 'http://127.0.0.1:3001/api/printer/list-usb';

    const request = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success && Array.isArray(json.devices)) {
            const printers = json.devices.map(device => ({
              name: device.name || device.description || 'Impresora desconocida',
              portName: device.portName || device.address || device.path || 'USB',
              displayName: device.displayName || device.description || device.name || ''
            }));
            console.log(`[MAIN] ✅ ${printers.length} impresora(s) desde el agente`);
            resolve({ success: true, data: printers });
          } else {
            resolve({ success: true, data: [] });
          }
        } catch (e) {
          resolve({ success: true, data: [] });
        }
      });
    });

    request.on('error', () => {
      console.log('[MAIN] ⚠️ Agente no disponible, devolviendo lista vacía');
      resolve({ success: true, data: [] });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ success: true, data: [] });
    });
  } catch (error) {
    resolve({ success: true, data: [] });
  }
}

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

// Guardar configuración .env
ipcMain.handle('save-env-config', async (event, config) => {
  try {
    const isDevMode = !app.isPackaged;
    // Guardar en userData (siempre accesible, incluso en Program Files)
    const userDataEnvPath = join(app.getPath('userData'), '.env');
    // También guardar en el agente si estamos en desarrollo
    const agentEnvPath = isDevMode ? join(__dirname, '../../agent/.env') : null;

    // Construir contenido del .env
    let envContent = '# Configuración del Agente de Impresión\n\n';

    for (const [key, value] of Object.entries(config)) {
      if (value) {
        envContent += `${key}=${value}\n`;
      }
    }

    // Guardar en userData (principal)
    writeFileSync(userDataEnvPath, envContent, 'utf8');
    console.log('[MAIN] ✅ Configuración guardada en userData:', userDataEnvPath);
    
    // También guardar en agente si estamos en desarrollo
    if (agentEnvPath) {
      try {
        writeFileSync(agentEnvPath, envContent, 'utf8');
        console.log('[MAIN] ✅ Configuración también guardada en agente (dev):', agentEnvPath);
      } catch (err) {
        console.warn('[MAIN] ⚠️ No se pudo guardar en agente (dev):', err.message);
      }
    }

    return { success: true, message: 'Configuración guardada correctamente' };
  } catch (error) {
    console.error('Error saving .env:', error);
    return { success: false, error: error.message || String(error) };
  }
});

// Leer configuración .env existente
ipcMain.handle('get-env-config', async () => {
  try {
    const isDevMode = !app.isPackaged;
    // Buscar primero en userData, luego en agente (dev)
    const userDataEnvPath = join(app.getPath('userData'), '.env');
    const agentEnvPath = isDevMode ? join(__dirname, '../../agent/.env') : null;
    
    let envPath = null;
    if (existsSync(userDataEnvPath)) {
      envPath = userDataEnvPath;
    } else if (agentEnvPath && existsSync(agentEnvPath)) {
      envPath = agentEnvPath;
    }

    if (!envPath || !existsSync(envPath)) {
      return { success: false, error: 'No configuration file found' };
    }

    const envContent = readFileSync(envPath, 'utf8');
    const config = {};

    // Parsear .env básico
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        config[key] = value;
      }
    });

    return { success: true, data: config };
  } catch (error) {
    console.error('Error reading .env:', error);
    return { success: false, error: error.message };
  }
});

// Handlers para controlar autostart
ipcMain.handle('get-autostart', async () => {
  try {
    const settings = app.getLoginItemSettings();
    return { 
      success: true, 
      enabled: settings.openAtLogin 
    };
  } catch (error) {
    console.error('[MAIN] Error obteniendo autostart:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-autostart', async (event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
      name: 'Agente de Impresión',
      args: []
    });
    console.log(`[MAIN] ✅ Autostart ${enabled ? 'habilitado' : 'deshabilitado'}`);
    return { success: true };
  } catch (error) {
    console.error('[MAIN] Error configurando autostart:', error);
    return { success: false, error: error.message };
  }
});

// Resetear configuración (eliminar .env y localStorage)
ipcMain.handle('reset-config', async () => {
  try {
    const isDevMode = !app.isPackaged;
    // Eliminar .env de userData (principal)
    const userDataEnvPath = join(app.getPath('userData'), '.env');
    const printerConfigPath = join(app.getPath('userData'), 'printer-config.json');
    
    // También eliminar del agente si estamos en desarrollo
    const agentEnvPath = isDevMode ? join(__dirname, '../../agent/.env') : null;
    
    let deleted = false;
    
    // Eliminar de userData (siempre intentar, incluso si falla)
    try {
      if (existsSync(userDataEnvPath)) {
        unlinkSync(userDataEnvPath);
        console.log('[MAIN] ✅ Archivo .env eliminado de userData');
        deleted = true;
      }
    } catch (err) {
      console.warn('[MAIN] ⚠️ No se pudo eliminar .env de userData:', err.message);
    }
    
    // Eliminar configuración de impresora
    try {
      if (existsSync(printerConfigPath)) {
        unlinkSync(printerConfigPath);
        console.log('[MAIN] ✅ Configuración de impresora eliminada');
      }
    } catch (err) {
      console.warn('[MAIN] ⚠️ No se pudo eliminar configuración de impresora:', err.message);
    }
    
    // Eliminar del agente si estamos en desarrollo
    if (agentEnvPath) {
      try {
        if (existsSync(agentEnvPath)) {
          unlinkSync(agentEnvPath);
          console.log('[MAIN] ✅ Archivo .env eliminado del agente (dev)');
        }
      } catch (err) {
        console.warn('[MAIN] ⚠️ No se pudo eliminar .env del agente:', err.message);
      }
    }
    
    // Detener el agente si está corriendo
    if (agentProcess) {
      stopAgent();
    }
    
    if (deleted) {
      return { success: true, message: 'Configuración reseteada correctamente' };
    } else {
      return { success: true, message: 'No había configuración para resetear' };
    }
  } catch (error) {
    console.error('[MAIN] Error reseteando configuración:', error);
    return { success: false, error: error.message || String(error) };
  }
});

// Guardar las funciones originales de console ANTES de interceptarlas
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Función para enviar logs al renderer (usa las funciones originales para evitar recursión)
function sendLogToRenderer(message, level = 'log') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('main-process-log', { message, level, timestamp: new Date().toISOString() });
  }
  // Usar las funciones originales para evitar recursión
  if (level === 'error') {
    originalError(message);
  } else if (level === 'warn') {
    originalWarn(message);
  } else {
    originalLog(message);
  }
}

// Nota: No interceptamos console.log/error/warn para evitar recursión y stack overflow.
// Usar sendLogToRenderer manualmente donde se requiera enviar logs al renderer.

// App lifecycle
app.whenReady().then(() => {
  console.log('🚀 Aplicación iniciando...');
  
  // Configurar autostart (iniciar con Windows)
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false, // Mostrar ventana al iniciar
    name: 'Agente de Impresión',
    args: []
  });
  
  // Crear system tray
  createTray();
  
  createWindow();
  
  // Función para enviar logs de forma segura
  const sendLog = (message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('agent-log', message);
      } catch (err) {
        // Silenciar errores de logs durante inicio
      }
    }
  };
  
  // Iniciar agente de forma asíncrona (no bloquear la UI)
  if (mainWindow) {
    // Mostrar ventana inmediatamente cuando el DOM esté listo (no esperar a did-finish-load)
    mainWindow.webContents.once('dom-ready', () => {
      console.log('✅ DOM listo - mostrando ventana inmediatamente');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show(); // Mostrar ventana tan pronto como el DOM esté listo
        sendLog('[MAIN] ✅ DOM listo\n');
      }
    });
    
    mainWindow.webContents.once('did-finish-load', () => {
      sendLog('[MAIN] 🚀 Aplicación iniciada\n');
      sendLog('[MAIN] ✅ Ventana completamente cargada\n');
      
      // Iniciar agente en background (no bloquear UI)
      // Usar setTimeout con 0 para que sea asíncrono y no bloquee
      setTimeout(() => {
        sendLog('[MAIN] 🔧 Iniciando agente en background...\n');
        startAgent();
      }, 0); // Inmediato pero asíncrono
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // NO cerrar la app, dejar que corra en segundo plano con el system tray
  // Solo cerrar si isQuitting es true (usuario eligió "Salir" desde el tray)
  if (isQuitting) {
    stopAgent();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  } else {
    // Solo esconder la ventana, el agente sigue corriendo
    console.log('🪟 Todas las ventanas cerradas - app sigue corriendo en segundo plano');
  }
});

app.on('before-quit', (event) => {
  // Solo permitir cerrar si isQuitting es true
  if (!isQuitting) {
    event.preventDefault();
    if (mainWindow) {
      mainWindow.hide();
    }
    return;
  }
  stopAgent();
});
