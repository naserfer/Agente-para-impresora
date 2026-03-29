const test = require('node:test');
const assert = require('node:assert/strict');

const { createCorrelationId, buildTraceEntry, logPrintTrace } = require('./print-trace');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('buildTraceEntry includes required keys', () => {
  const entry = buildTraceEntry({
    correlationId: 'corr-1',
    orderId: 'order-1',
    stage: 'agent_event_received',
    source: 'agent',
    meta: { printer_name: 'EPSON', copies: 2, payload_size: 1234 }
  });

  assert.equal(entry.correlation_id, 'corr-1');
  assert.equal(entry.order_id, 'order-1');
  assert.equal(entry.stage, 'agent_event_received');
  assert.equal(entry.printer_name, 'EPSON');
  assert.equal(entry.copies, 2);
  assert.equal(entry.payload_size, 1234);
  assert.ok(entry.ts);
});

test('logPrintTrace dispatches RPC payload without blocking', async () => {
  let rpcCall = null;
  const supabase = {
    rpc: async (name, payload) => {
      rpcCall = { name, payload };
      return { error: null };
    }
  };
  const logger = { info: () => {}, warn: () => {} };

  logPrintTrace(supabase, logger, {
    correlationId: createCorrelationId(),
    orderId: 'order-22',
    stage: 'spool_submit',
    source: 'agent',
    meta: { copies: 1 }
  });
  await flushMicrotasks();

  assert.equal(rpcCall.name, 'log_print_event');
  assert.equal(rpcCall.payload.p_stage, 'spool_submit');
  assert.equal(rpcCall.payload.p_order_id, 'order-22');
  assert.equal(rpcCall.payload.p_source, 'agent');
  assert.deepEqual(rpcCall.payload.p_meta, { copies: 1 });
});

test('logPrintTrace swallows RPC errors by warning only', async () => {
  let warned = false;
  const supabase = {
    rpc: async () => ({ error: { message: 'rpc fail' } })
  };
  const logger = {
    info: () => {},
    warn: () => { warned = true; }
  };

  logPrintTrace(supabase, logger, {
    correlationId: 'corr-fail',
    orderId: null,
    stage: 'agent_event_received',
    meta: {}
  });
  await flushMicrotasks();

  assert.equal(warned, true);
});
