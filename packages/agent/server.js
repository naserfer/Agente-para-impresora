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

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./logger');
const printerManager = require('./printer/PrinterManager');
const TicketGenerator = require('./printer/TicketGenerator');

// Crear la aplicación Express (el "servidor")
const app = express();

// ============================================
// CONFIGURACIÓN INICIAL
// ============================================

// CORS: Permite que tu app web (Next.js) se comunique con este agente
// Sin esto, el navegador bloquearía las peticiones por seguridad
app.use(cors({
  origin: config.allowedOrigin,  // Solo acepta peticiones de esta URL (tu app Next.js)
  credentials: true
}));

// Permite recibir datos en formato JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging: Registra todas las peticiones que llegan
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { body: req.body });
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

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    printers,
    printersCount: printers.length,
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

    // Generar ticket de prueba
    const testTicket = TicketGenerator.generateKitchenTicket({
      orderId: 'TEST',
      lomiteriaNombre: 'PRUEBA DE CONEXIÓN',
      items: [
        { nombre: 'Item de Prueba', cantidad: 1 }
      ],
      total: 0,
      fecha: new Date().toISOString()
    });

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
    const devices = await printerManager.listUSBPrinters();
    res.json({ success: true, devices });
  } catch (error) {
    logger.error('Error al listar impresoras USB:', error);
    res.status(500).json({ error: error.message });
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
        customerName: data.cliente?.nombre || data.customerName,
        lomiteriaName: data.lomiteriaName || 'Lomitería',
        createdAt: data.fecha || new Date().toLocaleString('es-AR'),
        items: data.items?.map(item => ({
          name: item.nombre || item.name,
          quantity: item.cantidad || item.quantity,
          notes: item.personalizaciones || item.notes || item.notas
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
// INICIAR EL SERVIDOR
// ============================================

// Iniciar el servidor en el puerto configurado (por defecto 3001)
// IMPORTANTE: Escuchar en 0.0.0.0 para permitir acceso desde la red local
// Esto permite que dispositivos móviles en la misma WiFi puedan conectarse
const server = app.listen(config.port, config.host, () => {
  logger.info(`🚀 Agente de impresión iniciado`);
  logger.info(`📡 Escuchando en http://${config.host}:${config.port} (accesible desde red local)`);
  logger.info(`🌐 Origen permitido: ${config.allowedOrigin}`);
  logger.info(`💡 Endpoint principal: POST http://[IP_PC]:${config.port}/print`);
});

// Manejo de errores al iniciar el servidor
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`❌ ERROR: El puerto ${config.port} ya está en uso`);
    logger.error(`💡 Solución: Ejecuta 'powershell -File stop-agent.ps1' o detén el proceso manualmente`);
    logger.error(`💡 O cambia el puerto con: PORT=3002 node server.js`);
    process.exit(1);
  } else {
    logger.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
});

// Manejo de cierre graceful (cuando se detiene el servidor)
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    logger.info('Servidor cerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...');
  server.close(() => {
    logger.info('Servidor cerrado');
    process.exit(0);
  });
});

module.exports = app;
