/**
 * SUPABASE REALTIME LISTENER
 * 
 * Este módulo escucha cambios en la tabla de pedidos en Supabase
 * y automáticamente imprime cuando se confirma un pedido.
 * 
 * ¿Cómo funciona?
 * 1. Se conecta a Supabase Realtime
 * 2. Escucha cambios en la tabla de pedidos
 * 3. Cuando detecta un pedido confirmado, imprime automáticamente
 * 4. Respeta multitenant filtrando por lomiteria_id
 * 
 * Ventajas:
 * - ✅ Sin túneles: conexión directa a Supabase
 * - ✅ Sin Vercel: no requiere comunicación con Vercel
 * - ✅ Tiempo real: impresión inmediata
 * - ✅ Multitenant: filtra por lomiteria_id
 */

// IMPORTANTE: Configurar WebSocket globalmente ANTES de importar Supabase
// Esto resuelve problemas de timeout en Node.js
const WebSocket = require('ws');
if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = WebSocket;
}

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const logger = require('./logger');
const printerManager = require('./printer/PrinterManager');
const TicketGenerator = require('./printer/TicketGenerator');

class SupabaseRealtimeListener {
  constructor() {
    this.supabase = null;
    this.isConfigured = false;
    this.configError = null;
    this.channel = null;
    this.isListening = false;
    this.processedOrders = new Set();
    this.realtimeStatus = 'idle';
    this.lastRealtimeError = null;
    this.lastPollAt = null;
    this.lastPollCount = null;
    this.lastPollError = null;
    this.pollingInterval = null;
  }

  getStatus() {
    if (!this.supabase) {
      return { configured: false, error: this.configError?.message || 'Sin SUPABASE_URL o SUPABASE_ANON_KEY' };
    }
    return {
      configured: true,
      realtime: this.realtimeStatus,
      realtimeError: this.lastRealtimeError || undefined,
      polling: this.pollingInterval ? 'activo' : 'inactivo',
      lastPollAt: this.lastPollAt || undefined,
      lastPollCount: this.lastPollCount,
      lastPollError: this.lastPollError || undefined,
      receivingOrders: this.isListening || (this.pollingInterval != null)
    };
  }

  /**
   * Inicia la escucha de cambios en la tabla de pedidos
   */
  async start() {
    // Leer variables de entorno EN ESTE MOMENTO (cuando se llama start())
    // Las variables de entorno ya están disponibles porque el proceso ya fue spawnado
    const supabaseUrl = process.env.SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseKey === '__SECURE__' || (supabaseKey && supabaseKey.trim() === '__SECURE__')) {
      const error = new Error('SUPABASE_ANON_KEY está en __SECURE__ (clave cifrada de la app). En desarrollo: poné la anon key real en packages/agent/.env.local. En .exe: la app inyecta la clave al iniciar el agente.');
      this.configError = error;
      this.isConfigured = false;
      logger.error('[Supabase] ' + error.message, { service: 'supabase-listener' });
      throw error;
    }
    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('SUPABASE_URL y SUPABASE_ANON_KEY son requeridos en .env');
      this.configError = error;
      this.isConfigured = false;
      throw error;
    }
    
    // Si el cliente no está inicializado, inicializarlo ahora
    if (!this.supabase) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          realtime: {
            params: {
              eventsPerSecond: 10
            },
            timeout: 60000, // 60 segundos de timeout (aumentado para Node.js 18)
            heartbeatIntervalMs: 30000, // Heartbeat cada 30 segundos
            reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000) // Reintentos exponenciales
          },
          auth: {
            persistSession: false, // No necesitamos sesión para Realtime
            autoRefreshToken: false
          },
          global: {
            headers: {
              'apikey': supabaseKey
            }
          },
          // Configuración adicional para mejorar compatibilidad
          db: {
            schema: 'public'
          }
        });
        this.isConfigured = true;
        this.configError = null;
        logger.info('✅ Cliente de Supabase inicializado correctamente', { service: 'supabase-listener' });
      } catch (error) {
        this.configError = error;
        this.isConfigured = false;
        logger.error(`❌ Error inicializando cliente de Supabase: ${error.message}`, { service: 'supabase-listener' });
        throw error;
      }
    }
    
    if (this.isListening) {
      logger.warn('Ya está escuchando cambios en Supabase', { service: 'supabase-listener' });
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const tableName = process.env.SUPABASE_ORDERS_TABLE || 'pedidos';
        const tableUrl = (process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('/')[0] || 'Supabase';
        logger.info(`[Supabase] Conectado a ${tableUrl} | Tabla: ${tableName}`, { service: 'supabase-listener' });

        if (!this.pollingInterval) {
          this.pollingInterval = setInterval(() => this.pollRecentOrders(), 15000);
          logger.info('[Supabase] Polling cada 15s (pedidos FACT). Si Realtime falla, se imprimen por polling.', { service: 'supabase-listener' });
        }

        const channelName = `orders:${tableName}`;
        
        // IMPORTANTE: Registrar el handler ANTES de suscribirse para evitar condición de carrera
        // Esto resuelve el problema de timeout donde los handlers no se registran a tiempo
        const changeHandler = async (payload) => {
          await this.handleOrderChange(payload);
        };
        
        this.channel = this.supabase
          .channel(channelName, {
            config: {
              broadcast: { self: false }, // No necesitamos broadcast
              presence: { key: '' }
            }
          })
          .on(
            'postgres_changes',
            {
              event: '*', // Escucha INSERT, UPDATE, DELETE
              schema: 'public',
              table: tableName
              // Sin filtro inicial - filtraremos en handleOrderChange para evitar problemas de conexión
            },
            changeHandler
          )
          .subscribe(async (status, err) => {
            this.realtimeStatus = status;
            const errMsg = (err && (err.message || err.msg || err.error?.message || (typeof err.error === 'string' ? err.error : null))) || (typeof err === 'string' ? err : null) || null;
            if (errMsg) this.lastRealtimeError = errMsg;

            if (status === 'SUBSCRIBED') {
              this.isListening = true;
              this.lastRealtimeError = null;
              logger.info('[Realtime] Suscrito a pedidos. Los nuevos pedidos FACT se imprimen al instante.', { service: 'supabase-listener' });
              try {
                const { error } = await this.supabase.from(tableName).select('id').limit(1);
                if (error) logger.warn(`[Realtime] Verificación lectura: ${error.message}`, { service: 'supabase-listener' });
              } catch (_) {}
              resolve();
            } else if (status === 'CHANNEL_ERROR') {
              logger.error(`[Realtime] Error: ${errMsg || 'desconocido'}. Se usará solo polling cada 15s.`, { service: 'supabase-listener' });
              if (err) try { logger.error('[Realtime] Detalle: ' + JSON.stringify(err), { service: 'supabase-listener' }); } catch (_) {}
              resolve();
            } else if (status === 'TIMED_OUT') {
              logger.error('[Realtime] Timeout. Se usará solo polling cada 15s.', { service: 'supabase-listener' });
              resolve();
            } else if (status === 'CLOSED' && this.isListening) {
              logger.warn('[Realtime] Canal cerrado.', { service: 'supabase-listener' });
            }
          });
        
        setTimeout(() => {
          if (!this.isListening) {
            logger.warn('[Realtime] Sin respuesta en 70s. Solo polling activo.', { service: 'supabase-listener' });
            if (this.channel) this.supabase.removeChannel(this.channel);
            this.channel = null;
            resolve();
          }
        }, 70000);

      } catch (error) {
        logger.error(`Error al iniciar listener de Supabase: ${error.message}`, { service: 'supabase-listener', error });
        reject(error);
      }
    });
  }

  async pollRecentOrders() {
    if (!this.supabase) return;
    const tableName = process.env.SUPABASE_ORDERS_TABLE || 'pedidos';
    const min = parseInt(process.env.POLLING_FACT_MINUTES || '10', 10) || 10;
    const since = new Date(Date.now() - min * 60 * 1000).toISOString();
    this.lastPollAt = new Date().toISOString();
    try {
      const { data: rows, error } = await this.supabase
        .from(tableName)
        .select('*')
        .eq('estado_pedido', 'FACT')
        .gte('updated_at', since)
        .order('updated_at', { ascending: false });
      if (error) {
        this.lastPollError = error.message;
        this.lastPollCount = null;
        logger.warn(`[Polling] Error: ${error.message}`, { service: 'supabase-listener' });
        return;
      }
      this.lastPollError = null;
      this.lastPollCount = rows?.length ?? 0;
      if (!rows?.length) return;
      for (const order of rows) {
        const key = `${order.id}-${order.updated_at || order.created_at}`;
        if (this.processedOrders.has(key)) continue;
        this.processedOrders.add(key);
        if (this.processedOrders.size > 1000) this.processedOrders.delete(this.processedOrders.values().next().value);
        logger.info(`[Polling] Pedido FACT #${order.id} → imprimiendo`, { service: 'supabase-listener' });
        await this.printOrder(order);
      }
    } catch (e) {
      this.lastPollError = e.message;
      this.lastPollCount = null;
      logger.warn(`[Polling] ${e.message}`, { service: 'supabase-listener' });
    }
  }

  async handleOrderChange(payload) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      const orderId = newRecord?.id || oldRecord?.id;
      logger.info(`[Realtime] Cambio en pedidos: ${eventType} (id ${orderId})`, { service: 'supabase-listener' });

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        let order = newRecord;
        if (orderId && (!order?.tenant_id && !order?.lomiteria_id)) {
          const { data: full } = await this.supabase.from('pedidos').select('*').eq('id', orderId).single();
          if (full) order = full;
        }
        // Verificar que el pedido esté facturado/confirmado
        // Usamos estado_pedido = 'FACT' que significa facturado/confirmado
        // También aceptamos estado = 'confirmado' como alternativa
        const isConfirmed = (order.estado_pedido === 'FACT') || 
                           (order.estado === 'confirmado') || 
                           (order.status === 'confirmado');
        
        if (!isConfirmed) {
          logger.debug(`Pedido ${order.id} no está confirmado (estado_pedido: ${order.estado_pedido}, estado: ${order.estado}), ignorando`, { service: 'supabase-listener' });
          return;
        }

        // Evitar procesar el mismo pedido dos veces
        const orderKey = `${order.id}-${order.updated_at || order.created_at}`;
        if (this.processedOrders.has(orderKey)) {
          logger.debug(`Pedido ${order.id} ya fue procesado, ignorando`, { service: 'supabase-listener' });
          return;
        }
        this.processedOrders.add(orderKey);

        // Limpiar pedidos antiguos del Set (mantener solo los últimos 1000)
        if (this.processedOrders.size > 1000) {
          const firstKey = this.processedOrders.values().next().value;
          this.processedOrders.delete(firstKey);
        }

        // Obtener la configuración de impresora para esta lomitería
        await this.printOrder(order);

      } else if (eventType === 'DELETE') {
        logger.debug(`Pedido ${oldRecord.id} eliminado`, { service: 'supabase-listener' });
      }

    } catch (error) {
      logger.error(`Error al procesar cambio en pedido: ${error.message}`, { 
        service: 'supabase-listener',
        error 
      });
    }
  }

  /**
   * Obtiene la configuración de impresora y imprime el pedido
   */
  async printOrder(order) {
    const num = order.numero_pedido ?? order.id;
    try {
      const lomiteriaId = order.tenant_id || order.lomiteria_id || order.tenantId;
      if (!lomiteriaId) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: sin tenant_id/lomiteria_id`, { service: 'supabase-listener' });
        return;
      }

      const { data: printerConfig, error } = await this.supabase
        .from('printer_config')
        .select('printer_id, lomiteria_id')
        .eq('lomiteria_id', lomiteriaId)
        .eq('activo', true)
        .single();

      if (error || !printerConfig) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: no hay printer_config para tenant ${lomiteriaId.slice(0, 8)}... (${error?.message || 'sin fila'})`, { service: 'supabase-listener' });
        return;
      }

      const printerId = printerConfig.printer_id;
      if (!printerManager.printers.has(printerId)) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: impresora "${printerId}" no está configurada en el agente`, { service: 'supabase-listener' });
        return;
      }

      logger.info(`[Imprimiendo] Pedido #${num} → ${printerId}`, { service: 'supabase-listener' });

      // Convertir el pedido al formato esperado por TicketGenerator
      // Obtener items del pedido desde la tabla items_pedido
      const orderData = await this.convertOrderToTicketFormat(order);

      // Generar ticket
      const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);

      // Imprimir
      await printerManager.print(printerId, ticketBuffer);

      // Intentar imprimir factura si existe en vista_factura_impresion
      try {
        const { data: factRows, error: factError } = await this.supabase
          .from('vista_factura_impresion')
          .select('*')
          .eq('tenant_id', lomiteriaId)
          .eq('pedido_id', order.id)
          .limit(1);

        if (factError) {
          logger.debug(`[Factura] Pedido #${num}: error consultando vista_factura_impresion: ${factError.message}`, { service: 'supabase-listener' });
        } else if (factRows && factRows.length > 0) {
          const factura = factRows[0];
          logger.info(`[Factura] Pedido #${num}: factura encontrada, imprimiendo`, { service: 'supabase-listener' });
          const facturaBuffer = TicketGenerator.generateParaguayInvoice(factura);
          await printerManager.print(printerId, facturaBuffer);
        } else {
          logger.debug(`[Factura] Pedido #${num}: no hay fila en vista_factura_impresion (aún no facturado o sin factura)`, { service: 'supabase-listener' });
        }
      } catch (factEx) {
        logger.debug(`[Factura] Pedido #${num}: excepción al imprimir factura: ${factEx.message}`, { service: 'supabase-listener' });
      }

      // Agregar al historial
      if (typeof global !== 'undefined' && global.printHistory) {
        const historyEntry = {
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber || orderData.orderId,
          lomiteriaId: order.lomiteria_id || order.tenant_id,
          printerId: printerConfig.printer_id,
          itemsCount: orderData.items?.length || 0,
          total: orderData.total || 0,
          printedAt: new Date().toISOString(),
          timestamp: Date.now()
        };
        
        global.printHistory.push(historyEntry);
        // Mantener solo los últimos MAX_HISTORY
        if (global.printHistory.length > (global.MAX_HISTORY || 100)) {
          global.printHistory.shift();
        }
      }

      logger.info(`[Impreso] Pedido #${orderData.orderId} en ${printerId}`, { service: 'supabase-listener' });
    } catch (error) {
      logger.error(`[NO IMPRIME] Pedido #${num}: ${error.message}`, { service: 'supabase-listener' });
    }
  }

  /**
   * Convierte el formato del pedido de Supabase al formato esperado por TicketGenerator.
   * Obtiene los ítems desde la vista vista_items_ticket_cocina (incluye modificaciones:
   * extras, ingredientes quitados, etc.). Cabecera y notas generales vienen de pedidos.
   */
  async convertOrderToTicketFormat(order) {
    try {
      // Obtener ítems con modificaciones desde la vista (no solo items_pedido)
      const { data: items, error: itemsError } = await this.supabase
        .from('vista_items_ticket_cocina')
        .select('producto_nombre, cantidad, modificaciones')
        .eq('pedido_id', order.id)
        .order('item_pedido_id', { ascending: true });

      if (itemsError) {
        logger.warn(`Error al obtener items del pedido ${order.id}: ${itemsError.message}`, { 
          service: 'supabase-listener' 
        });
      }

      // Obtener nombre de la lomitería desde tenants
      let lomiteriaName = 'Lomitería';
      const tenantId = order.tenant_id || order.lomiteria_id;
      if (tenantId) {
        const { data: tenant } = await this.supabase
          .from('tenants')
          .select('nombre')
          .eq('id', tenantId)
          .single();
        
        if (tenant) {
          lomiteriaName = tenant.nombre;
        }
      }

      // Obtener datos del cliente si existe
      let customerName = 'Cliente';
      let deliveryAddress = null;
      if (order.cliente_id) {
        const { data: cliente } = await this.supabase
          .from('clientes')
          .select('nombre, direccion')
          .eq('id', order.cliente_id)
          .single();
        
        if (cliente) {
          customerName = cliente.nombre;
          // Si es delivery, usar la dirección del cliente
          if (order.tipo === 'delivery' && cliente.direccion) {
            deliveryAddress = cliente.direccion;
          }
        }
      }

      return {
        orderId: order.numero_pedido?.toString() || order.id?.toString() || 'N/A',
        tableNumber: order.mesa || order.table_number || null,
        customerName: customerName,
        lomiteriaName: lomiteriaName,
        orderType: order.tipo || 'local',
        orderNotes: order.notas || null,
        deliveryAddress: deliveryAddress,
        createdAt: order.created_at || new Date().toISOString(),
        items: (items || []).map(item => ({
          name: item.producto_nombre || item.nombre || 'Producto',
          quantity: item.cantidad || 1,
          notes: item.modificaciones || null,
          modificaciones: item.modificaciones || null
        }))
      };
    } catch (error) {
      logger.error(`Error al convertir formato del pedido: ${error.message}`, { 
        service: 'supabase-listener',
        orderId: order.id 
      });
      
      // Retornar formato básico en caso de error
      return {
        orderId: order.numero_pedido?.toString() || order.id?.toString() || 'N/A',
        tableNumber: null,
        customerName: 'Cliente',
        lomiteriaName: 'Lomitería',
        createdAt: order.created_at || new Date().toISOString(),
        items: []
      };
    }
  }

  /**
   * Detiene la escucha de cambios
   */
  async stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.channel && this.supabase) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.isListening = false;
    this.realtimeStatus = 'idle';
    logger.info('[Supabase] Listener detenido', { service: 'supabase-listener' });
  }
}

module.exports = new SupabaseRealtimeListener();

