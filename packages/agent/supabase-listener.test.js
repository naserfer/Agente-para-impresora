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
  assert.equal(kitchenDefaults.maxAttempts, 2);
  assert.equal(kitchenDefaults.delayMs, 250);
});

test('full emission uses async invoice to avoid blocking kitchen', () => {
  assert.equal(listener.shouldUseAsyncInvoice({}), true);
  assert.equal(listener.shouldUseAsyncInvoice({ kitchenOnly: true }), false);
  assert.equal(listener.shouldUseAsyncInvoice({ invoiceOnly: true }), false);
});
