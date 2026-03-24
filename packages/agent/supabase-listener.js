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
    this.channelReprint = null;
    this.channelFacturaBump = null;
    this.isListening = false;
    this.processedOrders = new Set();
    this.processedReprintIds = new Set();
    this.processedFacturaBumps = new Set();
    this._reprintPollErrorLogged = false;
    this._facturaBumpPollErrorLogged = false;
    this.realtimeStatus = 'idle';
    this.lastRealtimeError = null;
    this.lastPollAt = null;
    this.lastPollCount = null;
    this.lastPollError = null;
    this.lastReprintPollAt = null;
    this.lastReprintPollCount = null;
    this.lastReprintPollError = null;
    this.lastFacturaBumpPollAt = null;
    this.lastFacturaBumpPollCount = null;
    this.lastFacturaBumpPollError = null;
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
      lastReprintPollAt: this.lastReprintPollAt || undefined,
      lastReprintPollCount: this.lastReprintPollCount,
      lastReprintPollError: this.lastReprintPollError || undefined,
      lastFacturaBumpPollAt: this.lastFacturaBumpPollAt || undefined,
      lastFacturaBumpPollCount: this.lastFacturaBumpPollCount,
      lastFacturaBumpPollError: this.lastFacturaBumpPollError || undefined,
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
          this.pollingInterval = setInterval(() => {
            this.pollRecentOrders();
            this.pollRecentReprints();
            this.pollRecentFacturaBumps();
          }, 15000);
          logger.info('[Supabase] Polling cada 15s: pedidos FACT + reprint_solicitud + facturas (bump reimpresión).', { service: 'supabase-listener' });
          setImmediate(() => {
            this.pollRecentReprints();
            this.pollRecentFacturaBumps();
          });
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

        // Canal independiente: reimpresiones explícitas (no depende de que pedidos llegue a SUBSCRIBED)
        this.subscribeReprintSolicitud();
        this.subscribeFacturaBump();

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

  /**
   * Cola reprint_solicitud: INSERT tipo 'cocina' → solo ticket cocina (sin factura).
   * INSERT tipo 'factura' → solo factura térmica si existe en vista_factura_impresion.
   */
  subscribeReprintSolicitud() {
    if (process.env.ENABLE_REPRINT_SOLICITUD === 'false') {
      logger.info('[Reprint] Suscripción reprint_solicitud deshabilitada (ENABLE_REPRINT_SOLICITUD=false)', { service: 'supabase-listener' });
      return;
    }
    if (!this.supabase) return;
    if (this.channelReprint) {
      try {
        this.supabase.removeChannel(this.channelReprint);
      } catch (_) {}
      this.channelReprint = null;
    }

    const handler = async (payload) => {
      await this.handleReprintInsert(payload);
    };

    this.channelReprint = this.supabase
      .channel('reprint_solicitud:agent')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reprint_solicitud'
        },
        handler
      )
      .subscribe((status, err) => {
        const errMsg = (err && (err.message || err.msg || err.error?.message)) || (typeof err === 'string' ? err : null) || null;
        if (status === 'SUBSCRIBED') {
          logger.info('[Realtime] Suscrito a reprint_solicitud (reimpresión cocina/factura explícita).', { service: 'supabase-listener' });
        } else if (status === 'CHANNEL_ERROR') {
          logger.warn(`[Realtime] Canal reprint_solicitud: ${errMsg || 'error'}. Revisá publication supabase_realtime y RLS.`, { service: 'supabase-listener' });
        }
      });
  }

  async handleReprintInsert(payload) {
    try {
      if (process.env.ENABLE_REPRINT_SOLICITUD === 'false') return;
      const { eventType, new: row } = payload;
      if (eventType !== 'INSERT' || !row?.id) return;
      await this.processReprintRow(row, 'realtime');
    } catch (e) {
      logger.error(`[Reprint] Error: ${e.message}`, { service: 'supabase-listener', error: e });
    }
  }

  /**
   * Procesa una fila de reprint_solicitud (Realtime o polling).
   */
  async processReprintRow(row, source = 'poll') {
    if (process.env.ENABLE_REPRINT_SOLICITUD === 'false') return;
    if (!row?.id) return;

    const allowed = process.env.AGENT_TENANT_IDS;
    if (allowed && allowed.trim()) {
      const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length && !list.includes(row.tenant_id)) {
        logger.debug(`[Reprint] Ignorado (tenant no en AGENT_TENANT_IDS): ${row.tenant_id}`, { service: 'supabase-listener' });
        return;
      }
    }

    if (this.processedReprintIds.has(row.id)) {
      logger.debug(`[Reprint] Ya procesado id=${row.id}`, { service: 'supabase-listener' });
      return;
    }
    this.processedReprintIds.add(row.id);
    if (this.processedReprintIds.size > 2000) {
      this.processedReprintIds.delete(this.processedReprintIds.values().next().value);
    }

    const tipo = (row.tipo || '').toLowerCase();
    if (tipo !== 'cocina' && tipo !== 'factura') {
      logger.warn(`[Reprint] tipo desconocido: ${row.tipo}`, { service: 'supabase-listener' });
      return;
    }

    logger.info(`[Reprint] ${source} ${tipo} pedido_id=${row.pedido_id} solicitud=${row.id}`, { service: 'supabase-listener' });

    const { data: pedido, error } = await this.supabase
      .from('pedidos')
      .select('*')
      .eq('id', row.pedido_id)
      .eq('tenant_id', row.tenant_id)
      .single();

    if (error || !pedido) {
      logger.warn(`[Reprint] No se pudo cargar pedido ${row.pedido_id}: ${error?.message || 'sin fila'}`, { service: 'supabase-listener' });
      return;
    }
    if (pedido.estado_pedido !== 'FACT') {
      logger.warn(`[Reprint] Pedido ${row.pedido_id} no está FACT, omitiendo`, { service: 'supabase-listener' });
      return;
    }

    if (tipo === 'cocina') {
      await this.printOrder(pedido, { kitchenOnly: true, reprintSolicitudId: row.id });
    } else {
      await this.printOrder(pedido, { invoiceOnly: true, reprintSolicitudId: row.id });
    }
  }

  /**
   * Igual que pedidos FACT: si Realtime no entrega (RLS anon, publication, etc.), el agente descubre INSERT vía REST.
   */
  async pollRecentReprints() {
    if (!this.supabase || process.env.ENABLE_REPRINT_SOLICITUD === 'false') return;
    const min = parseInt(process.env.POLLING_REPRINT_MINUTES || process.env.POLLING_FACT_MINUTES || '15', 10) || 15;
    const since = new Date(Date.now() - min * 60 * 1000).toISOString();
    this.lastReprintPollAt = new Date().toISOString();
    try {
      const { data: rows, error } = await this.supabase
        .from('reprint_solicitud')
        .select('id, tenant_id, pedido_id, tipo, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error) {
        this.lastReprintPollError = error.message;
        this.lastReprintPollCount = null;
        if (!this._reprintPollErrorLogged) {
          this._reprintPollErrorLogged = true;
          logger.warn(
            `[Polling reprint] ${error.message} — el rol del agente (p. ej. anon) necesita SELECT en reprint_solicitud o usá SUPABASE_SERVICE_ROLE_KEY en el .env del agente. Ver database/14_reprint_solicitud.sql (sección anon).`,
            { service: 'supabase-listener' }
          );
        }
        return;
      }
      this._reprintPollErrorLogged = false;
      this.lastReprintPollError = null;
      this.lastReprintPollCount = rows?.length ?? 0;
      if (!rows?.length) return;

      for (const row of rows) {
        if (this.processedReprintIds.has(row.id)) continue;
        await this.processReprintRow(row, 'polling');
      }
    } catch (e) {
      this.lastReprintPollError = e.message;
      this.lastReprintPollCount = null;
      logger.warn(`[Polling reprint] ${e.message}`, { service: 'supabase-listener' });
    }
  }

  /**
   * KaruBox / POS: PATCH facturas.updated_at para "solo reimprimir factura".
   * Escucha UPDATE + polling (misma idea que reprint_solicitud).
   */
  subscribeFacturaBump() {
    if (process.env.ENABLE_FACTURA_BUMP_LISTENER === 'false') {
      logger.info('[Factura bump] Deshabilitado (ENABLE_FACTURA_BUMP_LISTENER=false)', { service: 'supabase-listener' });
      return;
    }
    if (!this.supabase) return;
    if (this.channelFacturaBump) {
      try {
        this.supabase.removeChannel(this.channelFacturaBump);
      } catch (_) {}
      this.channelFacturaBump = null;
    }

    this.channelFacturaBump = this.supabase
      .channel('facturas:bump_reprint')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'facturas'
        },
        async (payload) => {
          await this.handleFacturaBumpUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        const errMsg = (err && (err.message || err.msg || err.error?.message)) || (typeof err === 'string' ? err : null) || null;
        if (status === 'SUBSCRIBED') {
          logger.info('[Realtime] Suscrito a facturas UPDATE (reimpresión fiscal vía bump).', { service: 'supabase-listener' });
        } else if (status === 'CHANNEL_ERROR') {
          logger.warn(`[Realtime] Canal facturas bump: ${errMsg || 'error'}. Usá polling o publication supabase_realtime + SELECT para anon.`, { service: 'supabase-listener' });
        }
      });
  }

  async handleFacturaBumpUpdate(payload) {
    try {
      if (process.env.ENABLE_FACTURA_BUMP_LISTENER === 'false') return;
      const { eventType, new: row } = payload;
      if (eventType !== 'UPDATE' || !row?.id) return;
      await this.processFacturaBumpRow(row, 'realtime');
    } catch (e) {
      logger.error(`[Factura bump] Error: ${e.message}`, { service: 'supabase-listener', error: e });
    }
  }

  async processFacturaBumpRow(row, source = 'poll') {
    if (process.env.ENABLE_FACTURA_BUMP_LISTENER === 'false') return;
    if (!row?.id || !row.pedido_id || !row.tenant_id) return;
    if (row.anulada === true) return;

    const freshKey = row.created_at ? `${row.id}__new__${row.created_at}` : null;
    if (freshKey && this.processedFacturaBumps.has(freshKey)) return;

    // Polling: no confundir alta de factura (created≈updated) con PATCH de reimpresión
    if (row.created_at && row.updated_at) {
      const c = Date.parse(row.created_at);
      const u = Date.parse(row.updated_at);
      if (!Number.isNaN(c) && !Number.isNaN(u) && u - c < 3000) {
        if (freshKey) this.processedFacturaBumps.add(freshKey);
        logger.debug(`[Factura bump] Omitido (alta reciente, no bump): ${row.id}`, { service: 'supabase-listener' });
        return;
      }
    }

    const allowed = process.env.AGENT_TENANT_IDS;
    if (allowed && allowed.trim()) {
      const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length && !list.includes(row.tenant_id)) {
        logger.debug(`[Factura bump] Ignorado (tenant no en AGENT_TENANT_IDS): ${row.tenant_id}`, { service: 'supabase-listener' });
        return;
      }
    }

    const ts = row.updated_at || row.created_at || '';
    const bumpKey = `${row.id}-${ts}`;
    if (this.processedFacturaBumps.has(bumpKey)) {
      logger.debug(`[Factura bump] Ya procesado ${bumpKey}`, { service: 'supabase-listener' });
      return;
    }
    this.processedFacturaBumps.add(bumpKey);
    if (this.processedFacturaBumps.size > 2000) {
      this.processedFacturaBumps.delete(this.processedFacturaBumps.values().next().value);
    }

    logger.info(`[Factura bump] ${source} factura=${row.id} pedido=${row.pedido_id}`, { service: 'supabase-listener' });

    const { data: pedido, error } = await this.supabase
      .from('pedidos')
      .select('*')
      .eq('id', row.pedido_id)
      .eq('tenant_id', row.tenant_id)
      .single();

    if (error || !pedido) {
      logger.warn(`[Factura bump] Pedido ${row.pedido_id}: ${error?.message || 'sin fila'}`, { service: 'supabase-listener' });
      return;
    }
    if (pedido.estado_pedido !== 'FACT') {
      logger.warn(`[Factura bump] Pedido ${row.pedido_id} no FACT, omitiendo`, { service: 'supabase-listener' });
      return;
    }

    await this.printOrder(pedido, { invoiceOnly: true });
  }

  async pollRecentFacturaBumps() {
    if (!this.supabase || process.env.ENABLE_FACTURA_BUMP_LISTENER === 'false') return;
    const min = parseInt(process.env.POLLING_FACTURA_BUMP_MINUTES || process.env.POLLING_FACT_MINUTES || '15', 10) || 15;
    const since = new Date(Date.now() - min * 60 * 1000).toISOString();
    this.lastFacturaBumpPollAt = new Date().toISOString();
    try {
      const { data: rows, error } = await this.supabase
        .from('facturas')
        .select('id, pedido_id, tenant_id, anulada, updated_at, created_at')
        .eq('anulada', false)
        .gte('updated_at', since)
        .order('updated_at', { ascending: true });

      if (error) {
        this.lastFacturaBumpPollError = error.message;
        this.lastFacturaBumpPollCount = null;
        if (!this._facturaBumpPollErrorLogged) {
          this._facturaBumpPollErrorLogged = true;
          logger.warn(
            `[Polling factura bump] ${error.message} — el agente necesita SELECT en facturas (anon o service role). Agregá facturas a supabase_realtime si querés Realtime.`,
            { service: 'supabase-listener' }
          );
        }
        return;
      }
      this._facturaBumpPollErrorLogged = false;
      this.lastFacturaBumpPollError = null;
      this.lastFacturaBumpPollCount = rows?.length ?? 0;
      if (!rows?.length) return;

      for (const row of rows) {
        const ts = row.updated_at || '';
        const bumpKey = `${row.id}-${ts}`;
        if (this.processedFacturaBumps.has(bumpKey)) continue;
        await this.processFacturaBumpRow(row, 'polling');
      }
    } catch (e) {
      this.lastFacturaBumpPollError = e.message;
      this.lastFacturaBumpPollCount = null;
      logger.warn(`[Polling factura bump] ${e.message}`, { service: 'supabase-listener' });
    }
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
   * @param {Object} order - Fila pedidos
   * @param {{ kitchenOnly?: boolean, invoiceOnly?: boolean, reprintSolicitudId?: string }} [options]
   */
  async printOrder(order, options = {}) {
    const { kitchenOnly = false, invoiceOnly = false, reprintSolicitudId = null } = options;
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

      const tag = reprintSolicitudId ? `[Reprint ${reprintSolicitudId.slice(0, 8)}] ` : '';
      logger.info(`${tag}[Imprimiendo] Pedido #${num} → ${printerId}${kitchenOnly ? ' (solo cocina)' : ''}${invoiceOnly ? ' (solo factura)' : ''}`, { service: 'supabase-listener' });

      let orderData = null;

      if (!invoiceOnly) {
        orderData = await this.convertOrderToTicketFormat(order);
        const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
        await printerManager.print(printerId, ticketBuffer);
      }

      if (!kitchenOnly) {
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
            if (invoiceOnly) {
              logger.warn(`[Reprint factura] Pedido #${num}: sin fila en vista_factura_impresion, nada que imprimir`, { service: 'supabase-listener' });
            }
          }
        } catch (factEx) {
          logger.debug(`[Factura] Pedido #${num}: excepción al imprimir factura: ${factEx.message}`, { service: 'supabase-listener' });
        }
      }

      if (typeof global !== 'undefined' && global.printHistory) {
        if (!orderData) {
          orderData = await this.convertOrderToTicketFormat(order);
        }
        const historyEntry = {
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber || orderData.orderId,
          lomiteriaId: order.lomiteria_id || order.tenant_id,
          printerId: printerConfig.printer_id,
          itemsCount: orderData.items?.length || 0,
          total: orderData.total || 0,
          printedAt: new Date().toISOString(),
          timestamp: Date.now(),
          reprintSolicitudId: reprintSolicitudId || undefined,
          kitchenOnly: kitchenOnly || undefined,
          invoiceOnly: invoiceOnly || undefined
        };

        global.printHistory.push(historyEntry);
        if (global.printHistory.length > (global.MAX_HISTORY || 100)) {
          global.printHistory.shift();
        }
      }

      logger.info(`${tag}[Impreso] Pedido #${(orderData && orderData.orderId) || num} en ${printerId}`, { service: 'supabase-listener' });
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
    if (this.channelReprint && this.supabase) {
      await this.supabase.removeChannel(this.channelReprint);
      this.channelReprint = null;
    }
    if (this.channelFacturaBump && this.supabase) {
      await this.supabase.removeChannel(this.channelFacturaBump);
      this.channelFacturaBump = null;
    }
    this.isListening = false;
    this.realtimeStatus = 'idle';
    logger.info('[Supabase] Listener detenido', { service: 'supabase-listener' });
  }
}

module.exports = new SupabaseRealtimeListener();

