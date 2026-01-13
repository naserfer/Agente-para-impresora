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
    // NO inicializar el cliente en el constructor
    // Las variables de entorno pueden no estar disponibles todavía
    // Inicializar en start() cuando se llame explícitamente
    this.supabase = null;
    this.isConfigured = false;
    this.configError = null;
    this.channel = null;
    this.isListening = false;
    this.processedOrders = new Set(); // Para evitar impresiones duplicadas
  }

  /**
   * Inicia la escucha de cambios en la tabla de pedidos
   */
  async start() {
    // Leer variables de entorno EN ESTE MOMENTO (cuando se llama start())
    // Las variables de entorno ya están disponibles porque el proceso ya fue spawnado
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    // Verificar si están disponibles
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
        logger.info('Iniciando listener de Supabase Realtime...', { service: 'supabase-listener' });

        // Suscribirse a cambios en la tabla de pedidos
        // IMPORTANTE: Ajusta el nombre de la tabla según tu esquema
        // Ejemplos comunes: 'pedidos', 'orders', 'ordenes'
        const tableName = process.env.SUPABASE_ORDERS_TABLE || 'pedidos';
        
        // Crear canal con configuración mejorada
        // Usar un nombre de canal más simple y estable
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
            logger.info(`Estado de suscripción: ${status}`, { service: 'supabase-listener', status, error: err?.message });
            
            if (status === 'SUBSCRIBED') {
              this.isListening = true;
              logger.info(`✅ Realtime activo - Escuchando tabla: ${tableName}`, { service: 'supabase-listener' });
              
              // Verificar que la conexión funciona haciendo una consulta de prueba
              try {
                const { data, error } = await this.supabase
                  .from(tableName)
                  .select('id')
                  .limit(1);
                
                if (error) {
                  logger.warn(`Advertencia al verificar conexión: ${error.message}`, { service: 'supabase-listener' });
                } else {
                  logger.info('✅ Conexión a Supabase verificada', { service: 'supabase-listener' });
                }
              } catch (verifyError) {
                logger.warn(`No se pudo verificar conexión: ${verifyError.message}`, { service: 'supabase-listener' });
              }
              
              resolve();
            } else if (status === 'CHANNEL_ERROR') {
              const errorMsg = err ? err.message : 'Error desconocido';
              logger.error(`❌ Error en Realtime: ${errorMsg}`, { service: 'supabase-listener', error: err });
              
              // Si es un error de RLS, dar sugerencia específica
              if (errorMsg.includes('RLS') || errorMsg.includes('policy')) {
                logger.info('💡 Posible problema de RLS. Verifica las políticas de seguridad en Supabase', { service: 'supabase-listener' });
              }
              
              reject(new Error(`Error al suscribirse: ${errorMsg}`));
            } else if (status === 'TIMED_OUT') {
              logger.error('❌ Timeout conectando a Supabase Realtime', { service: 'supabase-listener' });
              logger.info('💡 Verifica: 1) Realtime habilitado (ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;)', { service: 'supabase-listener' });
              logger.info('💡 Verifica: 2) Credenciales correctas en .env', { service: 'supabase-listener' });
              logger.info('💡 Verifica: 3) Firewall/red permite conexiones WebSocket a Supabase', { service: 'supabase-listener' });
              logger.info('💡 Verifica: 4) RLS no bloquea la lectura de la tabla pedidos', { service: 'supabase-listener' });
              reject(new Error('Timeout conectando a Supabase Realtime'));
            } else if (status === 'CLOSED') {
              // Solo log si no es el cierre esperado después de timeout
              if (this.isListening) {
                logger.warn('⚠️ Canal de Realtime cerrado', { service: 'supabase-listener' });
              }
            }
          });
        
        // Timeout de seguridad (70 segundos - más tiempo para Node.js 18 y conexiones lentas)
        setTimeout(() => {
          if (!this.isListening) {
            logger.error('❌ Timeout: No se pudo conectar a Supabase Realtime después de 70 segundos', { service: 'supabase-listener' });
            logger.info('💡 Realtime está habilitado, pero hay un problema de conexión', { service: 'supabase-listener' });
            logger.info('💡 Posibles causas: 1) Node.js 18 incompatible (actualiza a v20+), 2) Firewall bloqueando WebSockets, 3) Problemas de red', { service: 'supabase-listener' });
            if (this.channel) {
              this.supabase.removeChannel(this.channel);
            }
            reject(new Error('Timeout: No se pudo conectar a Supabase Realtime'));
          }
        }, 70000);

      } catch (error) {
        logger.error(`Error al iniciar listener de Supabase: ${error.message}`, { service: 'supabase-listener', error });
        reject(error);
      }
    });
  }

  /**
   * Maneja los cambios en la tabla de pedidos
   */
  async handleOrderChange(payload) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      logger.info(`Cambio detectado en pedidos: ${eventType}`, { 
        service: 'supabase-listener',
        orderId: newRecord?.id || oldRecord?.id 
      });

      // Solo procesar INSERT o UPDATE cuando el estado_pedido es 'FACT' (facturado/confirmado)
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const order = newRecord;
        
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
    try {
      // Obtener tenant_id del pedido (respetando multitenant)
      const lomiteriaId = order.tenant_id || order.lomiteria_id || order.tenantId;
      
      if (!lomiteriaId) {
        logger.warn('Pedido sin lomiteria_id, no se puede imprimir', { 
          service: 'supabase-listener',
          orderId: order.id 
        });
        return;
      }

      // Consultar configuración de impresora desde Supabase
      const { data: printerConfig, error } = await this.supabase
        .from('printer_config')
        .select('printer_id, lomiteria_id')
        .eq('lomiteria_id', lomiteriaId)
        .eq('activo', true)
        .single();

      if (error || !printerConfig) {
        logger.warn(`No se encontró configuración de impresora para lomitería ${lomiteriaId}`, { 
          service: 'supabase-listener',
          orderId: order.id,
          error: error?.message 
        });
        return;
      }

      const printerId = printerConfig.printer_id;

      // Verificar que la impresora esté configurada en el agente
      if (!printerManager.printers.has(printerId)) {
        logger.warn(`Impresora ${printerId} no está configurada en el agente`, { 
          service: 'supabase-listener',
          orderId: order.id 
        });
        return;
      }

      // Convertir el pedido al formato esperado por TicketGenerator
      // Obtener items del pedido desde la tabla items_pedido
      const orderData = await this.convertOrderToTicketFormat(order);

      // Generar ticket
      const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);

      // Imprimir
      await printerManager.print(printerId, ticketBuffer);

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

      logger.info(`✅ Pedido #${orderData.orderId} impreso automáticamente`, { 
        service: 'supabase-listener',
        printerId,
        lomiteriaId 
      });

    } catch (error) {
      logger.error(`Error al imprimir pedido: ${error.message}`, { 
        service: 'supabase-listener',
        orderId: order.id,
        error 
      });
    }
  }

  /**
   * Convierte el formato del pedido de Supabase al formato esperado por TicketGenerator
   * Obtiene los items desde la tabla items_pedido (respetando multitenant)
   */
  async convertOrderToTicketFormat(order) {
    try {
      // Obtener items del pedido desde la tabla items_pedido
      const { data: items, error: itemsError } = await this.supabase
        .from('items_pedido')
        .select('producto_nombre, cantidad, precio_unitario, subtotal, notas')
        .eq('pedido_id', order.id)
        .order('created_at', { ascending: true });

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
          notes: item.notas || null
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
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
      this.isListening = false;
      logger.info('Listener de Supabase detenido', { service: 'supabase-listener' });
    }
  }
}

module.exports = new SupabaseRealtimeListener();

