/**
 * SUPABASE REALTIME LISTENER
 * 
 * Este módulo escucha cambios en la tabla de pedidos en Supabase
 * y automáticamente imprime cuando se confirma un pedido.
 * 
 * ¿Cómo funciona?
 * 1. Se conecta a Supabase Realtime
 * 2. Escucha cambios en la tabla de pedidos (INSERT/UPDATE/DELETE)
 * 3. Emisión inicial: UPDATE de estado_pedido a FACT (p. ej. EDIT→FACT); INSERT directo en FACT solo por compatibilidad
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
    this.reprintRealtimeStatus = 'idle';
    this.facturaBumpRealtimeStatus = 'idle';
    this.isListening = false;
    /** Emisión inicial automática (Realtime/polling): un pedido_id solo una vez; no aplica a reprint ni factura bump */
    this.initialEmissionPrintedPedidoIds = new Set();
    /** Evita carrera Realtime + polling: dos hilos imprimían antes de marcar id → 2× cocina + 2× factura */
    this.initialEmissionInFlightPedidoIds = new Set();
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
    this.keepAliveInterval = null;
    this.lastKeepAliveAt = null;
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Impresión automática (pedido FACT / polling): solo si el pedido se creó dentro de la ventana reciente.
   * Evita imprimir backlog al conectar el agente. Reimpresiones explícitas usan skipAgeCheck o reprintSolicitudId.
   * PRINT_ORDER_MAX_AGE_MINUTES (default 10). 0 = sin límite.
   */
  isAutomaticPrintBlockedByOrderAge(order) {
    const raw = process.env.PRINT_ORDER_MAX_AGE_MINUTES;
    const maxMin = raw === undefined || raw === '' ? 10 : parseInt(String(raw), 10);
    if (!Number.isFinite(maxMin) || maxMin <= 0) return false;

    const created = order?.created_at;
    if (!created) {
      return true;
    }
    const t = Date.parse(created);
    if (Number.isNaN(t)) {
      return true;
    }
    const ageMs = Date.now() - t;
    return ageMs > maxMin * 60 * 1000;
  }

  async fetchFacturaWithRetry(lomiteriaId, pedidoId, options = {}) {
    const { maxAttempts, delayMs } = this.getFacturaRetryConfig(options);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data: factRows, error: factError } = await this.supabase
        .from('vista_factura_impresion')
        .select('*')
        .eq('tenant_id', lomiteriaId)
        .eq('pedido_id', pedidoId)
        .limit(1);

      if (factError) {
        return { factura: null, error: factError, attempts: attempt };
      }
      if (factRows && factRows.length > 0) {
        return { factura: factRows[0], error: null, attempts: attempt };
      }

      if (attempt < maxAttempts) {
        await this.sleep(delayMs);
      }
    }

    return { factura: null, error: null, attempts: maxAttempts };
  }

  /**
   * Obtiene ítems de cocina con modificaciones (recetas/extras/quitados).
   * Si llegan sin modificaciones (vacío/null) muy rápido después de pasar a FACT,
   * reintenta unas veces para cubrir propagación/latencia de la app + vistas.
   */
  async fetchKitchenItemsWithRetry(pedidoId, pedidoAgeMs, options = {}) {
    const { maxAttempts, delayMs } = this.getKitchenRetryConfig(options);
    const freshnessMs = Number(options.freshnessMs || process.env.KITCHEN_ITEMS_FRESHNESS_MS || 30000);

    // Solo reintentar si el pedido todavía "es reciente" (primeros segundos tras FACT).
    // En reimpresiones típicamente ya estará resuelto, evitando esperas innecesarias.
    const allowRetryByFreshness = pedidoAgeMs == null ? true : pedidoAgeMs < freshnessMs;

    let lastItems = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data: items, error: itemsError } = await this.supabase
        .from('vista_items_ticket_cocina')
        .select('producto_nombre, cantidad, modificaciones')
        .eq('pedido_id', pedidoId)
        .order('item_pedido_id', { ascending: true });

      if (itemsError) {
        if (attempt < maxAttempts && allowRetryByFreshness) {
          if (attempt > 1) {
            logger.debug(
              `[KitchenItemsRetry] Pedido ${pedidoId}: error al consultar items (intent ${attempt}/${maxAttempts}, ageMs=${pedidoAgeMs ?? 'n/a'})`,
              { service: 'supabase-listener' }
            );
          }
          await this.sleep(delayMs);
          continue;
        }
        return { items: lastItems, error: itemsError, attempts: attempt };
      }

      lastItems = items || [];

      // Si existen filas pero todas vienen sin modificaciones, es el caso que queremos esperar.
      const hasRows = lastItems.length > 0;
      const allModificationsEmpty = hasRows
        ? lastItems.every((it) => !it.modificaciones || String(it.modificaciones).trim().length === 0)
        : true;

      if (hasRows && !allModificationsEmpty) {
        return { items: lastItems, error: null, attempts: attempt };
      }

      if (attempt < maxAttempts && allowRetryByFreshness) {
        if (attempt > 1) {
          logger.debug(
            `[KitchenItemsRetry] Pedido ${pedidoId}: esperando modificaciones (intent ${attempt}/${maxAttempts}, ageMs=${pedidoAgeMs ?? 'n/a'}, rows=${lastItems.length})`,
            { service: 'supabase-listener' }
          );
        }
        await this.sleep(delayMs);
        continue;
      }

      return { items: lastItems, error: null, attempts: attempt };
    }

    return { items: lastItems, error: null, attempts: maxAttempts };
  }

  _markInitialEmissionPrinted(pedidoId) {
    if (pedidoId == null) return;
    this.initialEmissionPrintedPedidoIds.add(pedidoId);
    if (this.initialEmissionPrintedPedidoIds.size > 1000) {
      this.initialEmissionPrintedPedidoIds.delete(this.initialEmissionPrintedPedidoIds.values().next().value);
    }
  }

  /**
   * Emisión inicial: idempotencia + mutex en memoria para no duplicar cocina/factura si Realtime y polling coinciden.
   */
  async _runInitialEmissionPrint(order) {
    const id = order.id;
    if (this.initialEmissionPrintedPedidoIds.has(id)) {
      logger.debug(`Pedido ${id}: emisión inicial ya impresa, ignorando`, { service: 'supabase-listener' });
      return;
    }
    if (this.initialEmissionInFlightPedidoIds.has(id)) {
      logger.debug(
        `Pedido ${id}: emisión inicial ya en curso (evita duplicado Realtime/polling), ignorando`,
        { service: 'supabase-listener' }
      );
      return;
    }
    this.initialEmissionInFlightPedidoIds.add(id);
    try {
      const ok = await this.printOrder(order);
      if (ok) this._markInitialEmissionPrinted(id);
    } finally {
      this.initialEmissionInFlightPedidoIds.delete(id);
    }
  }

  getStatus() {
    if (!this.supabase) {
      return { configured: false, error: this.configError?.message || 'Sin SUPABASE_URL o SUPABASE_ANON_KEY' };
    }
    return {
      configured: true,
      realtime: this.realtimeStatus,
      realtimeReprint: this.reprintRealtimeStatus,
      realtimeFacturaBump: this.facturaBumpRealtimeStatus,
      realtimeError: this.lastRealtimeError || undefined,
      polling: this.pollingInterval ? 'activo' : 'inactivo',
      keepAlive: this.keepAliveInterval ? 'activo' : 'inactivo',
      lastKeepAliveAt: this.lastKeepAliveAt || undefined,
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

  shouldRunFallbackPoll(status) {
    return status !== 'SUBSCRIBED';
  }

  getFallbackPollingIntervalMs(env = process.env) {
    const raw = parseInt(String(env.SUPABASE_FALLBACK_POLLING_MS || '5000'), 10);
    if (!Number.isFinite(raw) || raw <= 0) return 5000;
    return Math.max(raw, 1000);
  }

  isKeepAliveEnabled(env = process.env) {
    return String(env.SUPABASE_KEEPALIVE_ENABLED || 'true').toLowerCase() !== 'false';
  }

  getKeepAliveIntervalMs(env = process.env) {
    const raw = parseInt(String(env.SUPABASE_KEEPALIVE_INTERVAL_MS || '30000'), 10);
    if (!Number.isFinite(raw) || raw <= 0) return 30000;
    return Math.max(raw, 5000);
  }

  getFacturaRetryConfig(options = {}, env = process.env) {
    const attemptsRaw = Number(options.maxAttempts ?? env.FACTURA_RETRY_ATTEMPTS ?? 3);
    const delayRaw = Number(options.delayMs ?? env.FACTURA_RETRY_DELAY_MS ?? 500);
    const maxAttempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.max(1, Math.floor(attemptsRaw)) : 3;
    const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? Math.max(0, Math.floor(delayRaw)) : 500;
    return { maxAttempts, delayMs };
  }

  getKitchenRetryConfig(options = {}, env = process.env) {
    const attemptsRaw = Number(options.maxAttempts ?? env.KITCHEN_ITEMS_RETRY_ATTEMPTS ?? 2);
    const delayRaw = Number(options.delayMs ?? env.KITCHEN_ITEMS_RETRY_DELAY_MS ?? 250);
    const maxAttempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.max(1, Math.floor(attemptsRaw)) : 2;
    const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? Math.max(0, Math.floor(delayRaw)) : 250;
    return { maxAttempts, delayMs };
  }

  shouldUseAsyncInvoice(options = {}) {
    const { kitchenOnly = false, invoiceOnly = false } = options;
    return !kitchenOnly && !invoiceOnly;
  }

  startKeepAliveLoop() {
    if (!this.isKeepAliveEnabled()) return;
    const intervalMs = this.getKeepAliveIntervalMs();
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.keepAliveInterval = setInterval(async () => {
      if (!this.channel || this.realtimeStatus !== 'SUBSCRIBED') return;
      try {
        await this.channel.send({
          type: 'broadcast',
          event: 'keepalive',
          payload: {}
        });
        this.lastKeepAliveAt = new Date().toISOString();
      } catch (error) {
        logger.debug(`[Realtime] Keepalive falló: ${error.message}`, { service: 'supabase-listener' });
      }
    }, intervalMs);
    logger.info(`[Realtime] Keepalive activo cada ${intervalMs}ms.`, { service: 'supabase-listener' });
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
          const fallbackPollingIntervalMs = this.getFallbackPollingIntervalMs();
          this.pollingInterval = setInterval(() => {
            if (this.shouldRunFallbackPoll(this.realtimeStatus)) {
              this.pollRecentOrders();
            }
            if (this.shouldRunFallbackPoll(this.reprintRealtimeStatus)) {
              this.pollRecentReprints();
            }
            if (this.shouldRunFallbackPoll(this.facturaBumpRealtimeStatus)) {
              this.pollRecentFacturaBumps();
            }
          }, fallbackPollingIntervalMs);
          logger.info(
            `[Supabase] Fallback polling condicional cada ${fallbackPollingIntervalMs}ms (solo si canal realtime correspondiente no está SUBSCRIBED).`,
            { service: 'supabase-listener' }
          );
          setImmediate(() => {
            if (this.shouldRunFallbackPoll(this.reprintRealtimeStatus)) {
              this.pollRecentReprints();
            }
            if (this.shouldRunFallbackPoll(this.facturaBumpRealtimeStatus)) {
              this.pollRecentFacturaBumps();
            }
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
              this.startKeepAliveLoop();
              logger.info('[Realtime] Suscrito a pedidos. Emisión inicial al pasar a FACT (p. ej. EDIT→FACT por UPDATE).', { service: 'supabase-listener' });
              try {
                const { error } = await this.supabase.from(tableName).select('id').limit(1);
                if (error) logger.warn(`[Realtime] Verificación lectura: ${error.message}`, { service: 'supabase-listener' });
              } catch (_) {}
              resolve();
            } else if (status === 'CHANNEL_ERROR') {
              logger.error('[Realtime] Error en canal pedidos; fallback polling activo para pedidos.', { service: 'supabase-listener' });
              if (err) try { logger.error('[Realtime] Detalle: ' + JSON.stringify(err), { service: 'supabase-listener' }); } catch (_) {}
              resolve();
            } else if (status === 'TIMED_OUT') {
              logger.error('[Realtime] Timeout en canal pedidos; fallback polling activo para pedidos.', { service: 'supabase-listener' });
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
            logger.warn('[Realtime] Sin respuesta en 70s. Fallback polling activo para pedidos.', { service: 'supabase-listener' });
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
        this.reprintRealtimeStatus = status;
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
        this.facturaBumpRealtimeStatus = status;
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

    await this.printOrder(pedido, { invoiceOnly: true, skipAgeCheck: true });
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
        if (this.initialEmissionPrintedPedidoIds.has(order.id)) continue;
        logger.info(`[Polling] Pedido FACT #${order.id} → imprimiendo`, { service: 'supabase-listener' });
        await this._runInitialEmissionPrint(order);
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
        if (!order?.id) return;

        // Ka'u / Lomitería: INSERT suele ser EDIT; la emisión inicial es el UPDATE a FACT.
        if (eventType === 'UPDATE') {
          if (order.estado_pedido !== 'FACT') {
            logger.debug(
              `Pedido ${order.id}: UPDATE sin estado_pedido FACT, ignorando emisión inicial`,
              { service: 'supabase-listener' }
            );
            return;
          }
          if (oldRecord && oldRecord.estado_pedido === 'FACT') {
            logger.debug(
              `Pedido ${order.id}: UPDATE con pedido ya FACT (sin transición), ignorando emisión inicial`,
              { service: 'supabase-listener' }
            );
            return;
          }
        } else if (eventType === 'INSERT') {
          // Compatibilidad: instalaciones que insertan ya en FACT
          if (order.estado_pedido !== 'FACT') {
            logger.debug(
              `Pedido ${order.id}: INSERT sin FACT (p. ej. EDIT), ignorando emisión inicial automática`,
              { service: 'supabase-listener' }
            );
            return;
          }
        }

        const allowed = process.env.AGENT_TENANT_IDS;
        if (allowed && allowed.trim()) {
          const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
          const tid = order.tenant_id || order.lomiteria_id;
          if (list.length && tid && !list.includes(tid)) {
            logger.debug(`Pedido ${order.id}: ignorado (tenant no en AGENT_TENANT_IDS)`, { service: 'supabase-listener' });
            return;
          }
        }

        await this._runInitialEmissionPrint(order);

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
   * Imprime factura para un pedido (bloqueante o async según quién lo invoque).
   */
  async printInvoiceForOrder(order, context = {}) {
    const {
      lomiteriaId,
      printerId,
      num,
      kitchenOnly = false,
      invoiceOnly = false,
      reprintSolicitudId = null
    } = context;

    const lookupStartedAt = Date.now();
    try {
      const facturaLookup = await this.fetchFacturaWithRetry(lomiteriaId, order.id, {
        maxAttempts: invoiceOnly ? 8 : undefined
      });
      const lookupMs = Date.now() - lookupStartedAt;

      if (facturaLookup.error) {
        logger.debug(`[Factura] Pedido #${num}: error consultando vista_factura_impresion: ${facturaLookup.error.message}`, { service: 'supabase-listener' });
        logger.info(`[Timing] Pedido #${num}: factura_lookup_ms=${lookupMs} attempts=${facturaLookup.attempts || 0} (error)`, { service: 'supabase-listener' });
        return;
      }

      if (!facturaLookup.factura) {
        logger.warn(
          `[Factura] Pedido #${num}: no hay fila en vista_factura_impresion tras ${facturaLookup.attempts} intento(s)`,
          { service: 'supabase-listener' }
        );
        logger.info(`[Timing] Pedido #${num}: factura_lookup_ms=${lookupMs} attempts=${facturaLookup.attempts || 0} (sin fila)`, { service: 'supabase-listener' });
        if (invoiceOnly) {
          logger.warn(`[Reprint factura] Pedido #${num}: sin fila en vista_factura_impresion, nada que imprimir`, { service: 'supabase-listener' });
        }
        return;
      }

      const factura = { ...facturaLookup.factura };
      if (
        (factura.numero_pedido == null || String(factura.numero_pedido).trim() === '') &&
        order.numero_pedido != null &&
        String(order.numero_pedido).trim() !== ''
      ) {
        factura.numero_pedido = order.numero_pedido;
      }
      const facturaBuffer = TicketGenerator.generateParaguayInvoice(factura);
      const isInitialFull = !kitchenOnly && !invoiceOnly && !reprintSolicitudId;
      const rawCopias = process.env.FACTURA_EMISION_COPIAS;
      const copiasFactura = isInitialFull
        ? (rawCopias === undefined || rawCopias === ''
          ? 2
          : Math.max(1, parseInt(String(rawCopias), 10) || 2))
        : 1;
      logger.info(
        `[Factura] Pedido #${num}: factura encontrada, imprimiendo ${copiasFactura} copia(s)`,
        { service: 'supabase-listener' }
      );

      const printStartedAt = Date.now();
      for (let c = 0; c < copiasFactura; c++) {
        await printerManager.print(printerId, facturaBuffer);
      }
      const printMs = Date.now() - printStartedAt;
      logger.info(
        `[Timing] Pedido #${num}: factura_lookup_ms=${lookupMs} attempts=${facturaLookup.attempts || 0} factura_print_ms=${printMs} copias=${copiasFactura}`,
        { service: 'supabase-listener' }
      );
    } catch (factEx) {
      const lookupMs = Date.now() - lookupStartedAt;
      logger.debug(`[Factura] Pedido #${num}: excepción al imprimir factura: ${factEx.message}`, { service: 'supabase-listener' });
      logger.info(`[Timing] Pedido #${num}: factura_lookup_ms=${lookupMs} (exception)`, { service: 'supabase-listener' });
    }
  }

  /**
   * Obtiene la configuración de impresora y imprime el pedido
   * @param {Object} order - Fila pedidos
   * @param {{ kitchenOnly?: boolean, invoiceOnly?: boolean, reprintSolicitudId?: string, skipAgeCheck?: boolean }} [options]
   * @returns {Promise<boolean>} true si la impresión prevista se completó (para idempotencia de emisión inicial)
   */
  async printOrder(order, options = {}) {
    const { kitchenOnly = false, invoiceOnly = false, reprintSolicitudId = null, skipAgeCheck = false } = options;
    const num = order.numero_pedido ?? order.id;
    const totalStartedAt = Date.now();
    try {
      const lomiteriaId = order.tenant_id || order.lomiteria_id || order.tenantId;
      if (!lomiteriaId) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: sin tenant_id/lomiteria_id`, { service: 'supabase-listener' });
        return false;
      }

      const bypassAge = skipAgeCheck === true || !!reprintSolicitudId;
      if (!bypassAge && this.isAutomaticPrintBlockedByOrderAge(order)) {
        const created = order.created_at ? Date.parse(order.created_at) : NaN;
        const ageMin = Number.isNaN(created) ? '?' : Math.round((Date.now() - created) / 60000);
        const maxMin = process.env.PRINT_ORDER_MAX_AGE_MINUTES === undefined || process.env.PRINT_ORDER_MAX_AGE_MINUTES === ''
          ? 10
          : parseInt(String(process.env.PRINT_ORDER_MAX_AGE_MINUTES), 10);
        logger.info(
          `[CicloVida] Pedido #${num} no imprimido: creado hace ~${ageMin} min (ventana máx. ${Number.isFinite(maxMin) && maxMin > 0 ? maxMin : 10} min desde created_at). Solo aplica a impresión automática.`,
          { service: 'supabase-listener' }
        );
        return false;
      }

      const { data: printerConfig, error } = await this.supabase
        .from('printer_config')
        .select('printer_id, lomiteria_id')
        .eq('lomiteria_id', lomiteriaId)
        .eq('activo', true)
        .single();

      if (error || !printerConfig) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: no hay printer_config para tenant ${lomiteriaId.slice(0, 8)}... (${error?.message || 'sin fila'})`, { service: 'supabase-listener' });
        return false;
      }

      const printerId = printerConfig.printer_id;
      if (!printerManager.printers.has(printerId)) {
        logger.warn(`[NO IMPRIME] Pedido #${num}: impresora "${printerId}" no está configurada en el agente`, { service: 'supabase-listener' });
        return false;
      }

      const tag = reprintSolicitudId ? `[Reprint ${reprintSolicitudId.slice(0, 8)}] ` : '';
      logger.info(`${tag}[Imprimiendo] Pedido #${num} → ${printerId}${kitchenOnly ? ' (solo cocina)' : ''}${invoiceOnly ? ' (solo factura)' : ''}`, { service: 'supabase-listener' });

      let orderData = null;
      let kitchenDataMs = 0;
      let kitchenPrintMs = 0;

      if (!invoiceOnly) {
        const kitchenDataStartedAt = Date.now();
        orderData = await this.convertOrderToTicketFormat(order);
        kitchenDataMs = Date.now() - kitchenDataStartedAt;
        const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
        const kitchenPrintStartedAt = Date.now();
        await printerManager.print(printerId, ticketBuffer);
        kitchenPrintMs = Date.now() - kitchenPrintStartedAt;
      }

      if (!kitchenOnly) {
        const invoiceContext = { lomiteriaId, printerId, num, kitchenOnly, invoiceOnly, reprintSolicitudId };
        if (this.shouldUseAsyncInvoice(options)) {
          logger.info(`[Factura] Pedido #${num}: emisión de factura en paralelo (no bloquea cocina).`, { service: 'supabase-listener' });
          this.printInvoiceForOrder(order, invoiceContext).catch((factEx) => {
            logger.debug(`[Factura] Pedido #${num}: excepción en paralelo: ${factEx.message}`, { service: 'supabase-listener' });
          });
        } else {
          await this.printInvoiceForOrder(order, invoiceContext);
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
      const totalMs = Date.now() - totalStartedAt;
      logger.info(
        `[Timing] Pedido #${num}: total_ms=${totalMs} kitchen_data_ms=${kitchenDataMs} kitchen_print_ms=${kitchenPrintMs} invoice_mode=${this.shouldUseAsyncInvoice(options) ? 'async' : 'sync'}`,
        { service: 'supabase-listener' }
      );
      return true;
    } catch (error) {
      logger.error(`[NO IMPRIME] Pedido #${num}: ${error.message}`, { service: 'supabase-listener' });
      return false;
    }
  }

  /**
   * Convierte el formato del pedido de Supabase al formato esperado por TicketGenerator.
   * Obtiene los ítems desde la vista vista_items_ticket_cocina (incluye modificaciones:
   * extras, ingredientes quitados, etc.). Cabecera y notas generales vienen de pedidos.
   */
  async convertOrderToTicketFormat(order) {
    try {
      // Edad aproximada del pedido: sirve para decidir si vale la pena reintentar.
      let pedidoAgeMs = null;
      try {
        const ts = order.updated_at || order.created_at;
        if (ts) pedidoAgeMs = Date.now() - new Date(ts).getTime();
      } catch (_) {}

      // Obtener ítems con modificaciones desde la vista (no solo items_pedido).
      // Si llega "demasiado rápido" sin modificaciones, esperamos y reconsultamos.
      const kitchenLookupStartedAt = Date.now();
      const kitchenLookup = await this.fetchKitchenItemsWithRetry(order.id, pedidoAgeMs);
      const kitchenLookupMs = Date.now() - kitchenLookupStartedAt;

      const items = kitchenLookup.items || [];
      const itemsError = kitchenLookup.error;

      if (itemsError) {
        logger.warn(`Error al obtener items del pedido ${order.id}: ${itemsError.message}`, { 
          service: 'supabase-listener' 
        });
      }
      logger.info(
        `[Timing] Pedido #${order.numero_pedido ?? order.id}: kitchen_lookup_ms=${kitchenLookupMs} attempts=${kitchenLookup.attempts || 0} rows=${items.length}`,
        { service: 'supabase-listener' }
      );

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
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
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
    this.reprintRealtimeStatus = 'idle';
    this.facturaBumpRealtimeStatus = 'idle';
    logger.info('[Supabase] Listener detenido', { service: 'supabase-listener' });
  }
}

module.exports = new SupabaseRealtimeListener();

