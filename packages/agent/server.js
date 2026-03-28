/**
 * SERVIDOR PRINCIPAL DEL AGENTE DE IMPRESIÓN
 * 
 * Este archivo es el "corazón" del agente. Es como un "teléfono" que:
 * 1. Escucha peticiones de tu aplicación web (Next.js)
 * 2. Recibe órdenes de impresión (tickets, facturas)
 * 3. Las procesa y las envía a la impresora física
 * 
 * ¿Cómo funciona?
 * - Tu app web envía: "Imprime este ticket en la impresora lomiteria-001"
 * - Este servidor recibe la orden
 * - Busca la impresora correcta usando el printerId
 * - Genera el ticket en formato que la impresora entiende
 * - Envía los comandos a la impresora física
 */

// IMPORTANTE: Configurar WebSocket globalmente ANTES de importar Supabase
// Esto resuelve problemas de timeout en Node.js con Supabase Realtime
// Resolver 'ws' de forma robusta para funcionar en producción con Electron
const path = require('path');
const fs = require('fs');

let WebSocket;
const wsPaths = [
  'ws', // Intento estándar
  path.join(__dirname, 'node_modules', 'ws'), // Ruta relativa desde __dirname
  path.join(process.cwd(), 'node_modules', 'ws'), // Ruta desde cwd
];

let wsFound = false;
for (const wsPath of wsPaths) {
  try {
    if (wsPath === 'ws') {
      WebSocket = require('ws');
    } else if (fs.existsSync(wsPath)) {
      WebSocket = require(wsPath);
    } else {
      continue;
    }
    wsFound = true;
    console.log(`✅ Módulo 'ws' cargado desde: ${wsPath}`);
    break;
  } catch (err) {
    continue;
  }
}

if (!wsFound) {
  console.error(`❌ No se pudo cargar 'ws' desde ninguna ruta:`, wsPaths);
  throw new Error(`Cannot find module 'ws'. Tried paths: ${wsPaths.join(', ')}`);
}
if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = WebSocket;
}

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./logger');
const printerManager = require('./printer/PrinterManager');
const TicketGenerator = require('./printer/TicketGenerator');
const { getHttpLogLevel } = require('./http-request-logging');
// const tunnelManager = require('./tunnel-manager'); // Deshabilitado - usando Supabase Realtime

// Cargar supabase-listener de forma segura (no fallar si no hay variables de entorno)
let supabaseListener = null;
try {
  supabaseListener = require('./supabase-listener');
} catch (error) {
  console.warn('⚠️ No se pudo cargar supabase-listener:', error.message);
  logger.warn('⚠️ Supabase listener no disponible - el agente funcionará sin impresión automática', { service: 'print-agent' });
}

// Almacenar historial de pedidos impresos (en memoria, últimos 100)
const printHistory = [];
const MAX_HISTORY = 100;

// Exponer globalmente para que supabase-listener pueda agregar entradas
if (typeof global !== 'undefined') {
  global.printHistory = printHistory;
  global.MAX_HISTORY = MAX_HISTORY;
}

// Manejo de errores no capturados para debugging
process.on('uncaughtException', (error) => {
  console.error('❌ ERROR NO CAPTURADO:', error);
  console.error('Stack:', error.stack);
  logger.error('❌ ERROR NO CAPTURADO:', error);
  logger.error('Stack:', error.stack);
  // No salir inmediatamente, dar tiempo para que se registre el error
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ PROMESA RECHAZADA NO MANEJADA:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
    logger.error('❌ PROMESA RECHAZADA NO MANEJADA:', reason);
    logger.error('Stack:', reason.stack);
  } else {
    logger.error('❌ PROMESA RECHAZADA NO MANEJADA:', reason);
  }
});

// Iniciar proxy CORS automáticamente (para túneles)
let corsProxyProcess = null;
function startCorsProxy() {
  // Solo iniciar si no está corriendo ya
  if (corsProxyProcess) {
    logger.info('Proxy CORS ya está corriendo', { service: 'print-agent' });
    return;
  }

  try {
    logger.info('Iniciando proxy CORS en puerto 3002...', { service: 'print-agent' });
    const { spawn } = require('child_process');
    const path = require('path');
    
    // Usar process.execPath si ELECTRON_RUN_AS_NODE está configurado, sino 'node'
    const nodeExec = process.env.ELECTRON_RUN_AS_NODE ? process.execPath : 'node';
    const nodeArgs = process.env.ELECTRON_RUN_AS_NODE ? [path.join(__dirname, 'cors-proxy.js')] : [path.join(__dirname, 'cors-proxy.js')];
    const corsEnv = process.env.ELECTRON_RUN_AS_NODE 
      ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      : process.env;
    
    corsProxyProcess = spawn(nodeExec, nodeArgs, {
      stdio: 'inherit',
      shell: !process.env.ELECTRON_RUN_AS_NODE, // Solo usar shell si no es Electron
      windowsHide: true,
      env: corsEnv
    });

    corsProxyProcess.on('error', (error) => {
      logger.error(`Error al iniciar proxy CORS: ${error.message}`, { service: 'print-agent' });
      corsProxyProcess = null;
    });

    corsProxyProcess.on('exit', (code) => {
      logger.warn(`Proxy CORS terminó con código ${code}`, { service: 'print-agent' });
      corsProxyProcess = null;
    });

    // Esperar un momento para que el proxy inicie
    setTimeout(() => {
      if (corsProxyProcess && !corsProxyProcess.killed) {
        logger.info('✅ Proxy CORS iniciado en puerto 3002', { service: 'print-agent' });
      }
    }, 2000);
  } catch (error) {
    logger.error(`No se pudo iniciar proxy CORS: ${error.message}`, { service: 'print-agent' });
    logger.warn('⚠️ El túnel puede no funcionar correctamente sin el proxy CORS', { service: 'print-agent' });
  }
}

// Crear la aplicación Express (el "servidor")
const app = express();

// ============================================
// CONFIGURACIÓN INICIAL
// ============================================

// CORS: Permite que tu app web (Next.js/Vercel) se comunique con este agente
// Middleware CORS manual para TODAS las peticiones (incluyendo OPTIONS)
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
  
//   // Verificar si el origen está permitido
//   if (!origin || config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
//     // Agregar headers CORS a TODAS las respuestas
//     res.header('Access-Control-Allow-Origin', origin || '*');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//     res.header('Access-Control-Max-Age', '86400');
    
//     // Si es OPTIONS (preflight), responder inmediatamente
//     if (req.method === 'OPTIONS') {
//       logger.info(`OPTIONS (preflight) permitido para: ${origin}`);
//       return res.sendStatus(204);
//     }
    
//     next();
//   } else {
//     logger.warn(`CORS bloqueado para origen: ${origin}`);
//     logger.warn(`Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
//     res.status(403).json({ error: 'No permitido por CORS' });
//   }
// });

app.use(cors({
  origin: [
    'https://lomiteria1-0.vercel.app', // Producción Vercel
    /\.vercel\.app$/,                   // Cualquier subdominio de Vercel
    ...config.allowedOrigins.filter(origin => origin !== '*'), // Orígenes configurados en .env
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

// Permite recibir datos en formato JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging: Registra todas las peticiones que llegan
app.use((req, res, next) => {
  const level = getHttpLogLevel(req.method, req.path);
  logger.log(level, `${req.method} ${req.path}`, { body: req.body });
  next();
});

// ============================================
// RUTAS (Endpoints - "Opciones del menú")
// ============================================

/**
 * RUTA: GET /
 * ¿Qué hace? Verifica que el agente esté funcionando
 * ¿Cuándo se usa? Para probar que el agente está corriendo
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Print Agent - Lomitería',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * RUTA: GET /api/history
 * ¿Qué hace? Obtiene el historial de pedidos impresos
 */
app.get('/api/history', (req, res) => {
  try {
    res.json({
      success: true,
      data: printHistory.slice().reverse(), // Más recientes primero
      count: printHistory.length
    });
  } catch (error) {
    logger.error('Error al obtener historial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * RUTA: GET /api/printers
 * ¿Qué hace? Obtiene la lista de impresoras configuradas
 */
app.get('/api/printers', (req, res) => {
  try {
    const printers = Array.from(printerManager.printers.values()).map(printer => {
      const config = printer.config || {};
      return {
        id: printer.id,
        name: config.printerName || printer.id,
        type: config.type || 'usb',
        connected: true // Asumimos conectada si está configurada
      };
    });

    res.json({
      success: true,
      data: printers,
      count: printers.length
    });
  } catch (error) {
    logger.error('Error al obtener impresoras:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * RUTA: GET /health
 * ¿Qué hace? Muestra el estado del agente y qué impresoras tiene configuradas
 * ¿Cuándo se usa? Para verificar el estado del sistema
 */
app.get('/health', (req, res) => {
  const printers = Array.from(printerManager.printers.keys()).map(printerId => {
    const config = printerManager.printers.get(printerId);
    return {
      printerId,
      type: config?.config?.type || 'unknown',
      printerName: config?.config?.printerName || 'N/A',
      configured: true
    };
  });

  const supabase = (supabaseListener && typeof supabaseListener.getStatus === 'function')
    ? supabaseListener.getStatus()
    : null;

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    printers,
    printersCount: printers.length,
    supabase,
    timestamp: new Date().toISOString()
  });
});

/**
 * RUTA: GET /api/printer/status/:printerId
 * ¿Qué hace? Verifica el estado de una impresora específica
 * ¿Cuándo se usa? Para verificar si una impresora está conectada y funcionando
 */
app.get('/api/printer/status/:printerId', async (req, res) => {
  try {
    const { printerId } = req.params;
    const printerConfig = printerManager.printers.get(printerId);

    if (!printerConfig) {
      return res.status(404).json({
        connected: false,
        error: 'Impresora no configurada. Usa POST /api/printer/configure primero.'
      });
    }

    // Intentar una impresión de prueba (texto simple)
    try {
      const testText = `TEST\n${new Date().toLocaleTimeString()}\n`;
      await printerManager.print(printerId, testText);
      
      res.json({
        connected: true,
        printerId,
        type: printerConfig.config?.type || 'unknown',
        printerName: printerConfig.config?.printerName || 'N/A',
        message: 'Impresora conectada y funcionando correctamente',
        lastTest: new Date().toISOString()
      });
    } catch (printError) {
      res.status(500).json({
        connected: false,
        printerId,
        error: printError.message,
        message: 'Impresora configurada pero no responde. Verifica que esté encendida y conectada.'
      });
    }
  } catch (error) {
    logger.error('Error al verificar estado de impresora:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: POST /api/printer/test/:printerId
 * ¿Qué hace? Imprime un ticket de prueba para verificar la conexión
 * ¿Cuándo se usa? Para probar que la impresora funciona correctamente
 */
app.post('/api/printer/test/:printerId', async (req, res) => {
  try {
    const { printerId } = req.params;
    const printerConfig = printerManager.printers.get(printerId);

    if (!printerConfig) {
      return res.status(404).json({
        error: 'Impresora no configurada. Usa POST /api/printer/configure primero.'
      });
    }

    // ESC/POS mínimo: ver packages/agent/printer/TicketGenerator.js → generateConnectionTest()
    const testTicket = TicketGenerator.generateConnectionTest();

    await printerManager.print(printerId, testTicket);

    res.json({
      success: true,
      message: 'Ticket de prueba enviado a la impresora',
      printerId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error en prueba de impresión:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: POST /api/printer/configure
 * ¿Qué hace? Configura una nueva impresora en el agente
 * ¿Cuándo se usa? Cuando instalas el agente en una lomitería nueva
 * 
 * Ejemplo de uso:
 * {
 *   "printerId": "lomiteria-001",  // ID único de la impresora (generalmente igual al ID de la lomitería)
 *   "type": "usb"                   // Tipo: "usb" o "network"
 * }
 */
app.post('/api/printer/configure', async (req, res) => {
  try {
    const { printerId, type, ip, port, vendorId, productId } = req.body;

    // Validar que se envió el printerId (es obligatorio)
    if (!printerId) {
      return res.status(400).json({ error: 'printerId es requerido' });
    }

    // Preparar la configuración de la impresora
    const printerConfig = {
      printerId,  // ID único: "lomiteria-001", "lomiteria-002", etc.
      type: type || config.defaultPrinterType,  // "usb" o "network"
      printerName: req.body.printerName,  // Nombre de la impresora (para USB)
      ip,  // IP de la impresora (solo para impresoras de red)
      port: port || config.defaultPrinterPort,  // Puerto (solo para impresoras de red)
      vendorId,  // ID del fabricante (opcional, para USB)
      productId  // ID del producto (opcional, para USB)
    };

    // Guardar la configuración en el gestor de impresoras
    printerManager.getPrinter(printerConfig);
    
    logger.info(`Impresora configurada: ${printerId}`, printerConfig);
    res.json({ 
      success: true, 
      message: `Impresora ${printerId} configurada correctamente`,
      config: printerConfig
    });
  } catch (error) {
    logger.error('Error al configurar impresora:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: GET /api/printer/list-usb
 * ¿Qué hace? Lista todas las impresoras USB conectadas a la computadora
 * ¿Cuándo se usa? Para ver qué impresoras están disponibles antes de configurarlas
 */
app.get('/api/printer/list-usb', async (req, res) => {
  try {
    logger.info('Solicitud de lista de impresoras USB recibida');
    const devices = await printerManager.listUSBPrinters();
    
    // Asegurar que devices sea un array
    const devicesArray = Array.isArray(devices) ? devices : [];
    logger.info(`listUSBPrinters() devolvió ${devicesArray.length} dispositivo(s)`);
    
    // Formatear los dispositivos para que tengan un formato consistente
    const formattedDevices = devicesArray.map(device => {
      // Si el dispositivo ya tiene el formato correcto, usarlo
      if (device && typeof device === 'object') {
        const formatted = {
          name: device.name || device.description || device.deviceName || 'Impresora desconocida',
          portName: device.address || device.path || device.port || device.portName || 'USB',
          displayName: device.displayName || device.description || device.name || device.deviceName || '',
          ...device // Mantener otras propiedades
        };
        logger.debug(`Dispositivo formateado: ${formatted.name} - ${formatted.portName}`);
        return formatted;
      }
      // Si es un string, crear un objeto básico
      if (typeof device === 'string') {
        return {
          name: device,
          portName: 'USB',
          displayName: device
        };
      }
      return null;
    }).filter(Boolean); // Eliminar nulls
    
    logger.info(`✅ Impresoras USB encontradas: ${formattedDevices.length}`, { 
      devices: formattedDevices.map(d => ({ name: d.name, port: d.portName }))
    });
    
    res.json({ success: true, devices: formattedDevices });
  } catch (error) {
    logger.error('❌ Error al listar impresoras USB:', error);
    logger.error('Stack trace:', error.stack);
    res.status(500).json({ success: false, error: error.message, devices: [] });
  }
});

/**
 * RUTA: POST /print
 * ¿Qué hace? Imprime tickets de cocina o facturas según el tipo
 * ¿Cuándo se usa? Cuando un empleado confirma un pedido desde la app móvil
 * 
 * Este es el endpoint principal según la arquitectura documentada.
 * La app web consulta printer_config en Supabase, obtiene el agent_ip y printerId,
 * y envía la solicitud aquí.
 * 
 * Ejemplo de petición desde tu app Next.js:
 * {
 *   "printerId": "atlas-burger-printer-1",  // ← Identifica qué impresora usar
 *   "tipo": "cocina",  // o "factura"
 *   "data": {
 *     "numeroPedido": 42,
 *     "tipoPedido": "local",
 *     "items": [
 *       { "name": "Lomo Completo", "quantity": 2, "notes": "sin cebolla" }
 *     ],
 *     "total": 50000,
 *     "cliente": {...},
 *     "fecha": "2025-01-15T14:30:00Z"
 *   }
 * }
 * 
 * ¿Cómo identifica la lomitería?
 * - Tu app Next.js busca en Supabase (tabla printer_config): ¿Qué printerId tiene esta lomitería?
 * - Envía ese printerId al agente
 * - El agente busca la impresora con ese ID y imprime ahí
 */
app.post('/print', async (req, res) => {
  try {
    const { printerId, tipo, data } = req.body;

    // Validar que se envió el printerId
    if (!printerId) {
      return res.status(400).json({ error: 'printerId es requerido' });
    }

    // Validar que se envió el tipo
    if (!tipo) {
      return res.status(400).json({ error: 'tipo es requerido (debe ser "cocina" o "factura")' });
    }

    // Validar que se enviaron los datos
    if (!data) {
      return res.status(400).json({ error: 'data es requerido' });
    }

    // Validar que el tipo sea válido
    if (tipo !== 'cocina' && tipo !== 'factura') {
      return res.status(400).json({ error: 'tipo debe ser "cocina" o "factura"' });
    }

    let ticketBuffer;

    // Generar los comandos ESC/POS según el tipo
    if (tipo === 'cocina') {
      // Convertir formato de data a formato esperado por TicketGenerator
      const orderData = {
        orderId: data.numeroPedido?.toString() || data.orderId || 'N/A',
        tableNumber: data.mesa || data.tableNumber,
        customerName: data.cliente?.nombre || data.customerName || 'Cliente',
        lomiteriaName: data.lomiteriaName || 'Lomitería',
        orderType: data.tipo || data.orderType || 'local',
        orderNotes: data.notas || data.orderNotes || null,
        deliveryAddress: data.cliente?.direccion || data.deliveryAddress || null,
        createdAt: data.fecha || data.createdAt || new Date().toISOString(),
        items: data.items?.map(item => ({
          name: item.nombre || item.name,
          quantity: item.cantidad || item.quantity,
          notes: item.modificaciones || item.personalizaciones || item.notes || item.notas,
          modificaciones: item.modificaciones || item.personalizaciones || null
        })) || []
      };

      ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
      logger.info(`Ticket de cocina generado: Pedido #${orderData.orderId}`, { printerId });
    } else if (tipo === 'factura') {
      // Convertir formato de data a formato esperado por TicketGenerator
      const invoiceData = {
        invoiceNumber: data.numeroFactura || data.invoiceNumber || 'N/A',
        customerName: data.cliente?.nombre || data.customerName || 'Cliente',
        customerAddress: data.cliente?.direccion || data.customerAddress,
        customerTaxId: data.cliente?.ci || data.cliente?.cuit || data.customerTaxId,
        lomiteriaName: data.lomiteriaName || 'Lomitería',
        lomiteriaAddress: data.lomiteriaAddress,
        lomiteriaTaxId: data.lomiteriaTaxId,
        createdAt: data.fecha || new Date().toLocaleString('es-AR'),
        items: data.items?.map(item => ({
          name: item.nombre || item.name,
          quantity: item.cantidad || item.quantity,
          unitPrice: item.precioUnitario || item.unitPrice || 0,
          subtotal: item.subtotal || (item.cantidad || item.quantity) * (item.precioUnitario || item.unitPrice || 0)
        })) || [],
        subtotal: data.subtotal || 0,
        tax: data.impuestos || data.tax || 0,
        total: data.total || 0,
        paymentMethod: data.metodoPago || data.paymentMethod
      };

      ticketBuffer = TicketGenerator.generateInvoice(invoiceData);
      logger.info(`Factura generada: #${invoiceData.invoiceNumber}`, { printerId });
    }

    // Enviar a la impresora física
    // printerManager busca la impresora usando el printerId
    // y envía los comandos a esa impresora específica
    await printerManager.print(printerId, ticketBuffer);

    res.json({ 
      success: true, 
      message: tipo === 'cocina' ? 'Ticket de cocina enviado a la impresora' : 'Factura enviada a la impresora',
      tipo,
      printerId
    });
  } catch (error) {
    logger.error(`Error al imprimir ${req.body.tipo}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: POST /api/print/kitchen-ticket (DEPRECADO - usar /print)
 * Mantenido para compatibilidad, pero se recomienda usar /print
 */
app.post('/api/print/kitchen-ticket', async (req, res) => {
  try {
    const { printerId, orderData } = req.body;
    if (!printerId || !orderData) {
      return res.status(400).json({ error: 'printerId y orderData son requeridos' });
    }
    const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
    await printerManager.print(printerId, ticketBuffer);
    logger.info(`Ticket de cocina impreso (endpoint legacy): Orden #${orderData.orderId}`, { printerId });
    res.json({ success: true, message: 'Ticket de cocina enviado a la impresora', orderId: orderData.orderId });
  } catch (error) {
    logger.error('Error al imprimir ticket de cocina:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: POST /api/print/invoice (DEPRECADO - usar /print)
 * Mantenido para compatibilidad, pero se recomienda usar /print
 */
app.post('/api/print/invoice', async (req, res) => {
  try {
    const { printerId, invoiceData } = req.body;
    if (!printerId || !invoiceData) {
      return res.status(400).json({ error: 'printerId y invoiceData son requeridos' });
    }
    const invoiceBuffer = TicketGenerator.generateInvoice(invoiceData);
    await printerManager.print(printerId, invoiceBuffer);
    logger.info(`Factura impresa (endpoint legacy): #${invoiceData.invoiceNumber}`, { printerId });
    res.json({ success: true, message: 'Factura enviada a la impresora', invoiceNumber: invoiceData.invoiceNumber });
  } catch (error) {
    logger.error('Error al imprimir factura:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: POST /api/print/text
 * ¿Qué hace? Imprime texto simple (para pruebas)
 * ¿Cuándo se usa? Para probar que la impresora funciona
 */
app.post('/api/print/text', async (req, res) => {
  try {
    const { printerId, text } = req.body;

    if (!printerId) {
      return res.status(400).json({ error: 'printerId es requerido' });
    }

    if (!text) {
      return res.status(400).json({ error: 'text es requerido' });
    }

    await printerManager.print(printerId, text);

    logger.info(`Texto impreso en ${printerId}`);
    res.json({ success: true, message: 'Texto enviado a la impresora' });
  } catch (error) {
    logger.error('Error al imprimir texto:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RUTA: DELETE /api/printer/:printerId
 * ¿Qué hace? Elimina la configuración de una impresora
 * ¿Cuándo se usa? Si necesitas quitar una impresora del agente
 */
app.delete('/api/printer/:printerId', (req, res) => {
  try {
    const { printerId } = req.params;
    printerManager.removePrinter(printerId);
    res.json({ success: true, message: `Impresora ${printerId} eliminada` });
  } catch (error) {
    logger.error('Error al eliminar impresora:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MANEJO DE ERRORES
// ============================================

// Si ocurre un error que no se capturó antes, se maneja aquí
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// VERIFICAR PUERTO ANTES DE INICIAR
// ============================================

/**
 * Verifica si el puerto está en uso y si es nuestro agente
 * Si es nuestro agente, muestra un mensaje y sale gracefully
 * Si no es nuestro agente, ofrece opciones al usuario
 */
async function checkPortBeforeStart() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const testServer = http.createServer();
    
    testServer.listen(config.port, config.host, () => {
      // El puerto está libre, podemos continuar
      testServer.close(() => resolve(true));
    });
    
    testServer.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        // El puerto está en uso, verificar si es nuestro agente
        logger.warn(`⚠️ El puerto ${config.port} está en uso. Verificando si es nuestro agente...`, { service: 'print-agent' });
        
        try {
          // Intentar hacer una petición HTTP al puerto para verificar si es nuestro agente
          const checkRequest = http.get(`http://localhost:${config.port}/health`, { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const health = JSON.parse(data);
                if (health.status === 'ok' && health.service) {
                  // Es nuestro agente
                  logger.info(`✅ El agente ya está corriendo en el puerto ${config.port}`, { service: 'print-agent' });
                  logger.info(`💡 Uptime: ${Math.floor(health.uptime / 60)} minutos`, { service: 'print-agent' });
                  logger.info(`💡 Impresoras configuradas: ${health.printersCount || 0}`, { service: 'print-agent' });
                  logger.info(`💡 No es necesario iniciar otro agente. El agente existente seguirá funcionando.`, { service: 'print-agent' });
                  resolve(false); // No iniciar otro servidor
                } else {
                  // No es nuestro agente
                  logger.error(`❌ El puerto ${config.port} está en uso por otro proceso`, { service: 'print-agent' });
                  logger.error(`💡 Solución 1: Detén el proceso manualmente y vuelve a intentar`, { service: 'print-agent' });
                  logger.error(`💡 Solución 2: Usa otro puerto: PORT=3002 npm run dev`, { service: 'print-agent' });
                  reject(new Error(`Puerto ${config.port} en uso por otro proceso`));
                }
              } catch (e) {
                // No es nuestro agente (no responde con JSON válido)
                logger.error(`❌ El puerto ${config.port} está en uso por otro proceso`, { service: 'print-agent' });
                logger.error(`💡 Solución 1: Detén el proceso manualmente y vuelve a intentar`, { service: 'print-agent' });
                logger.error(`💡 Solución 2: Usa otro puerto: PORT=3002 npm run dev`, { service: 'print-agent' });
                reject(new Error(`Puerto ${config.port} en uso por otro proceso`));
              }
            });
          });
          
          checkRequest.on('error', () => {
            // No responde, probablemente no es nuestro agente
            logger.error(`❌ El puerto ${config.port} está en uso pero no responde`, { service: 'print-agent' });
            logger.error(`💡 Solución 1: Detén el proceso manualmente y vuelve a intentar`, { service: 'print-agent' });
            logger.error(`💡 Solución 2: Usa otro puerto: PORT=3002 npm run dev`, { service: 'print-agent' });
            reject(new Error(`Puerto ${config.port} en uso pero no responde`));
          });
          
          checkRequest.on('timeout', () => {
            checkRequest.destroy();
            logger.error(`❌ El puerto ${config.port} está en uso pero no responde (timeout)`, { service: 'print-agent' });
            logger.error(`💡 Solución 1: Detén el proceso manualmente y vuelve a intentar`, { service: 'print-agent' });
            logger.error(`💡 Solución 2: Usa otro puerto: PORT=3002 npm run dev`, { service: 'print-agent' });
            reject(new Error(`Puerto ${config.port} en uso pero no responde`));
          });
        } catch (err) {
          logger.error(`❌ Error al verificar el puerto: ${err.message}`, { service: 'print-agent' });
          reject(err);
        }
      } else {
        // Otro tipo de error
        reject(error);
      }
    });
  });
}

// ============================================
// INICIAR EL SERVIDOR
// ============================================

async function startServer() {
  try {
    // Solo Realtime: sin Express ni POST /print (útil si HTTP nunca fue usable en tu red)
    if (process.env.DISABLE_HTTP_SERVER === 'true' || process.env.ENABLE_HTTP_SERVER === 'false') {
      logger.info('🛑 HTTP deshabilitado (DISABLE_HTTP_SERVER=true o ENABLE_HTTP_SERVER=false). Modo solo Supabase Realtime; POST /print no está disponible.', { service: 'print-agent' });
      console.log('🛑 Agente sin servidor HTTP — impresión automática vía Supabase únicamente.');
      return { noHttp: true };
    }

    // Verificar el puerto antes de intentar iniciar
    const canStart = await checkPortBeforeStart();
    
    if (!canStart) {
      // El agente ya está corriendo, salir gracefully
      logger.info(`✅ El agente ya está corriendo. Saliendo...`, { service: 'print-agent' });
      // NO hacer exit inmediatamente, dar tiempo para que se registre el log
      setTimeout(() => {
        process.exit(0);
      }, 500);
      return;
    }
    
    // El puerto está libre, iniciar el servidor
    // Asegurar que escucha en 127.0.0.1 (IPv4) explícitamente para evitar problemas de IPv6
    const listenHost = config.host || '127.0.0.1';
    console.log(`🚀 Iniciando servidor en ${listenHost}:${config.port}...`);
    logger.info(`🚀 Iniciando servidor en ${listenHost}:${config.port}...`, { service: 'print-agent' });
    
    const server = app.listen(config.port, listenHost, () => {
      const actualAddress = server.address();
      logger.info(`🚀 Agente de impresión iniciado`);
      logger.info(`📡 Escuchando en http://${listenHost}:${config.port}`);
      logger.info(`📡 Dirección real del servidor: ${JSON.stringify(actualAddress)}`);
      logger.info(`🌐 Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
      logger.info(`💡 Endpoint principal: POST http://127.0.0.1:${config.port}/print`);
      console.log(`✅ SERVIDOR INICIADO CORRECTAMENTE en ${listenHost}:${config.port}`);
    });

    // Manejo de errores al iniciar el servidor (por si acaso)
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ ERROR: El puerto ${config.port} ya está en uso`);
        logger.error(`💡 Esto no debería pasar si la verificación funcionó correctamente`);
               logger.error(`💡 Solución: Detén el proceso manualmente o cambia el puerto`);
        logger.error(`💡 O cambia el puerto con: PORT=3002 node server.js`);
        process.exit(1);
      } else {
        logger.error('❌ Error al iniciar el servidor:', error);
        process.exit(1);
      }
    });
    
    return server;
  } catch (error) {
    logger.error(`❌ Error al iniciar el servidor: ${error.message}`, { service: 'print-agent' });
    process.exit(1);
  }
}

// Iniciar el servidor
const serverPromise = startServer();

// Iniciar listener de Supabase Realtime (con HTTP normal o en modo solo-Realtime sin HTTP)
serverPromise.then((server) => {
  if (server == null) {
    // El agente ya estaba corriendo (puerto ocupado), no iniciar otro listener
    return;
  }

  if (server.noHttp) {
    logger.info('📡 Sin bind HTTP; iniciando solo listener de pedidos…', { service: 'print-agent' });
  }

  // Solo intentar iniciar el listener si está disponible y está habilitado
  if (supabaseListener && process.env.ENABLE_SUPABASE_LISTENER !== 'false') {
    supabaseListener.start()
      .then(() => {
        logger.info('✅ Impresión automática activa - Escuchando cambios en pedidos', { service: 'print-agent' });
      })
      .catch((error) => {
        logger.warn(`⚠️ Impresión automática no disponible: ${error.message}`, { service: 'print-agent' });
        logger.info('💡 El agente seguirá funcionando, pero sin impresión automática', { service: 'print-agent' });
      });
  } else if (!supabaseListener) {
    logger.warn('⚠️ Supabase listener no disponible - configura SUPABASE_URL y SUPABASE_ANON_KEY para habilitar impresión automática', { service: 'print-agent' });
  }
}).catch((error) => {
  // Error ya manejado en startServer
});

// Túnel deshabilitado - usando Supabase Realtime (sin túneles necesarios)
// Si necesitas túneles en el futuro, descomenta esto:
/*
if (process.env.AUTO_TUNNEL !== 'false') {
  tunnelManager.startTunnel()
      .then((tunnelUrl) => {
        if (tunnelUrl) {
          logger.info(`🌐 Túnel público: ${tunnelUrl}`, { service: 'print-agent' });
        }
      })
      .catch((error) => {
        // Silenciar errores de túnel
      });
}
*/

// Manejo de cierre graceful (cuando se detiene el servidor)
async function shutdown() {
  logger.info('Cerrando servidor...', { service: 'print-agent' });
  
  // Detener listener de Supabase (solo si está disponible)
  if (supabaseListener) {
    try {
      await supabaseListener.stop();
    } catch (error) {
      logger.warn(`Error al detener listener de Supabase: ${error.message}`, { service: 'print-agent' });
    }
  }
  
  // Túnel deshabilitado
  // tunnelManager.stopTunnel();
  
  if (corsProxyProcess) {
    logger.info('Deteniendo proxy CORS...', { service: 'print-agent' });
    corsProxyProcess.kill();
    corsProxyProcess = null;
  }
  
  serverPromise.then((server) => {
    if (server && server.listening) {
      server.close(() => {
        logger.info('Servidor cerrado', { service: 'print-agent' });
        process.exit(0);
      });
    } else {
      // Sin HTTP ({ noHttp: true }) o sin servidor: salir tras detener listener
      process.exit(0);
    }
  }).catch(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...', { service: 'print-agent' });
  shutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...', { service: 'print-agent' });
  shutdown();
});

module.exports = app;
