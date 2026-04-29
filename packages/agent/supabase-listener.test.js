const test = require('node:test');
const assert = require('node:assert/strict');

const listener = require('./supabase-listener');

test('fallback polling runs when realtime is not subscribed', () => {
  assert.equal(listener.shouldRunFallbackPoll('SUBSCRIBED'), false);
  assert.equal(listener.shouldRunFallbackPoll('CHANNEL_ERROR'), true);
  assert.equal(listener.shouldRunFallbackPoll('TIMED_OUT'), true);
  assert.equal(listener.shouldRunFallbackPoll('CLOSED'), true);
  assert.equal(listener.shouldRunFallbackPoll('idle'), true);
});

test('keepalive enabled by default and interval is parsed', () => {
  const envDefault = {};
  assert.equal(listener.isKeepAliveEnabled(envDefault), true);
  assert.equal(listener.getKeepAliveIntervalMs(envDefault), 30000);

  const envDisabled = { SUPABASE_KEEPALIVE_ENABLED: 'false' };
  assert.equal(listener.isKeepAliveEnabled(envDisabled), false);

  const envCustom = { SUPABASE_KEEPALIVE_INTERVAL_MS: '45000' };
  assert.equal(listener.getKeepAliveIntervalMs(envCustom), 45000);
});

test('retry defaults are tuned for low latency', () => {
  const facturaDefaults = listener.getFacturaRetryConfig({}, {});
  assert.equal(facturaDefaults.maxAttempts, 3);
  assert.equal(facturaDefaults.delayMs, 500);

  const kitchenDefaults = listener.getKitchenRetryConfig({}, {});
  assert.equal(kitchenDefaults.maxAttempts, 1);
  assert.equal(kitchenDefaults.delayMs, 250);
});

test('full emission uses async invoice to avoid blocking kitchen', () => {
  assert.equal(listener.shouldUseAsyncInvoice({}), true);
  assert.equal(listener.shouldUseAsyncInvoice({ kitchenOnly: true }), false);
  assert.equal(listener.shouldUseAsyncInvoice({ invoiceOnly: true }), false);
});

test('invoice printing toggle is disabled by default and can be enabled', () => {
  assert.equal(listener.isInvoicePrintingEnabled({}), false);
  assert.equal(listener.isInvoicePrintingEnabled({ ENABLE_INVOICE_PRINTING: 'true' }), true);
  assert.equal(listener.isInvoicePrintingEnabled({ ENABLE_INVOICE_PRINTING: 'false' }), false);
});

test('customer welcome ticket toggle is enabled by default and can be disabled', () => {
  assert.equal(listener.isCustomerWelcomeTicketEnabled({}), true);
  assert.equal(listener.isCustomerWelcomeTicketEnabled({ ENABLE_CUSTOMER_WELCOME_TICKET: 'true' }), true);
  assert.equal(listener.isCustomerWelcomeTicketEnabled({ ENABLE_CUSTOMER_WELCOME_TICKET: 'false' }), false);
});

test('customer points for sale prefers explicit puntos_generados', () => {
  assert.equal(listener.getCustomerWelcomePointsForSale({ puntos_generados: 18, total: 999 }), 18);
  assert.equal(listener.getCustomerWelcomePointsForSale({ puntos_generados: null, total: 123.8 }), 123);
  assert.equal(listener.getCustomerWelcomePointsForSale({}), 0);
});

test('resolveMesaNumeroByMesaId returns mesa number when mesa_id exists', async () => {
  const originalSupabase = listener.supabase;
  const seen = { table: null, filters: {} };

  try {
    const query = {
      select() { return this; },
      eq(column, value) {
        seen.filters[column] = value;
        return this;
      },
      async maybeSingle() {
        return { data: { numero: 12 }, error: null };
      }
    };

    listener.supabase = {
      from(table) {
        seen.table = table;
        return query;
      }
    };

    const mesaNumero = await listener.resolveMesaNumeroByMesaId({
      mesa_id: 'mesa-1',
      tenant_id: 'tenant-1'
    });

    assert.equal(seen.table, 'mesas');
    assert.equal(seen.filters.id, 'mesa-1');
    assert.equal(seen.filters.tenant_id, 'tenant-1');
    assert.equal(mesaNumero, '12');
  } finally {
    listener.supabase = originalSupabase;
  }
});

test('resolveMesaNumeroByMesaId returns null when mesa_id is missing', async () => {
  const originalSupabase = listener.supabase;
  let queried = false;

  try {
    listener.supabase = {
      from() {
        queried = true;
        return null;
      }
    };

    const mesaNumero = await listener.resolveMesaNumeroByMesaId({
      tenant_id: 'tenant-1'
    });

    assert.equal(mesaNumero, null);
    assert.equal(queried, false);
  } finally {
    listener.supabase = originalSupabase;
  }
});

test('fetchKitchenItemsWithRetry requests notas_item from vista_items_ticket_cocina', async () => {
  const originalSupabase = listener.supabase;
  let selected = '';

  try {
    listener.supabase = {
      from(table) {
        assert.equal(table, 'vista_items_ticket_cocina');
        return {
          select(fields) {
            selected = fields;
            return this;
          },
          eq() { return this; },
          async order() {
            return { data: [], error: null };
          }
        };
      }
    };

    await listener.fetchKitchenItemsWithRetry('pedido-1', null, { maxAttempts: 1 });
    assert.ok(selected.includes('notas_item'));
  } finally {
    listener.supabase = originalSupabase;
  }
});

test('initial emission with mesa_id runs kitchenOnly mode', async () => {
  const originalPrintOrder = listener.printOrder;
  const originalAgeCheck = listener.isAutomaticPrintBlockedByOrderAge;
  const order = {
    id: 'pedido-mesa',
    mesa_id: 'mesa-10',
    created_at: new Date().toISOString()
  };
  const calls = [];

  try {
    listener.isAutomaticPrintBlockedByOrderAge = () => false;
    listener.initialEmissionPrintedPedidoIds.delete(order.id);
    listener.initialEmissionInFlightPedidoIds.delete(order.id);
    listener.printOrder = async (_order, options = {}) => {
      calls.push(options);
      return true;
    };

    await listener._runInitialEmissionPrint(order, { correlationId: 'corr-1' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].kitchenOnly, true);
  } finally {
    listener.printOrder = originalPrintOrder;
    listener.isAutomaticPrintBlockedByOrderAge = originalAgeCheck;
    listener.initialEmissionPrintedPedidoIds.delete(order.id);
    listener.initialEmissionInFlightPedidoIds.delete(order.id);
  }
});

test('initial emission without mesa_id keeps full flow', async () => {
  const originalPrintOrder = listener.printOrder;
  const originalAgeCheck = listener.isAutomaticPrintBlockedByOrderAge;
  const order = {
    id: 'pedido-sin-mesa',
    mesa_id: null,
    created_at: new Date().toISOString()
  };
  const calls = [];

  try {
    listener.isAutomaticPrintBlockedByOrderAge = () => false;
    listener.initialEmissionPrintedPedidoIds.delete(order.id);
    listener.initialEmissionInFlightPedidoIds.delete(order.id);
    listener.printOrder = async (_order, options = {}) => {
      calls.push(options);
      return true;
    };

    await listener._runInitialEmissionPrint(order, { correlationId: 'corr-2' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].kitchenOnly, false);
  } finally {
    listener.printOrder = originalPrintOrder;
    listener.isAutomaticPrintBlockedByOrderAge = originalAgeCheck;
    listener.initialEmissionPrintedPedidoIds.delete(order.id);
    listener.initialEmissionInFlightPedidoIds.delete(order.id);
  }
});

test('reprint_solicitud tipo cocina triggers kitchenOnly print', async () => {
  const originalSupabase = listener.supabase;
  const originalPrintOrder = listener.printOrder;
  const originalTenantFilter = process.env.AGENT_TENANT_IDS;
  const rowId = 'reprint-cocina-1';
  const calls = [];

  try {
    delete process.env.AGENT_TENANT_IDS;
    listener.processedReprintIds.delete(rowId);
    listener.supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async single() {
            return {
              data: { id: 'pedido-rc1', tenant_id: 'tenant-1', estado_pedido: 'FACT' },
              error: null
            };
          }
        };
      }
    };
    listener.printOrder = async (_order, options = {}) => {
      calls.push(options);
      return true;
    };

    await listener.processReprintRow({
      id: rowId,
      tenant_id: 'tenant-1',
      pedido_id: 'pedido-rc1',
      tipo: 'cocina'
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].kitchenOnly, true);
    assert.equal(calls[0].invoiceOnly || false, false);
  } finally {
    process.env.AGENT_TENANT_IDS = originalTenantFilter;
    listener.supabase = originalSupabase;
    listener.printOrder = originalPrintOrder;
    listener.processedReprintIds.delete(rowId);
  }
});

test('reprint_solicitud tipo factura triggers invoiceOnly print', async () => {
  const originalSupabase = listener.supabase;
  const originalPrintOrder = listener.printOrder;
  const originalTenantFilter = process.env.AGENT_TENANT_IDS;
  const rowId = 'reprint-factura-1';
  const calls = [];

  try {
    delete process.env.AGENT_TENANT_IDS;
    listener.processedReprintIds.delete(rowId);
    listener.supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async single() {
            return {
              data: { id: 'pedido-rf1', tenant_id: 'tenant-1', estado_pedido: 'FACT' },
              error: null
            };
          }
        };
      }
    };
    listener.printOrder = async (_order, options = {}) => {
      calls.push(options);
      return true;
    };

    await listener.processReprintRow({
      id: rowId,
      tenant_id: 'tenant-1',
      pedido_id: 'pedido-rf1',
      tipo: 'factura'
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].invoiceOnly, true);
    assert.equal(calls[0].kitchenOnly || false, false);
  } finally {
    process.env.AGENT_TENANT_IDS = originalTenantFilter;
    listener.supabase = originalSupabase;
    listener.printOrder = originalPrintOrder;
    listener.processedReprintIds.delete(rowId);
  }
});
