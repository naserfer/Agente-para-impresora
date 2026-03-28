const test = require('node:test');
const assert = require('node:assert/strict');

const { getHttpLogLevel } = require('./http-request-logging');

test('health and dashboard polling routes are downgraded to debug', () => {
  assert.equal(getHttpLogLevel('GET', '/health'), 'debug');
  assert.equal(getHttpLogLevel('GET', '/api/history'), 'debug');
  assert.equal(getHttpLogLevel('GET', '/api/printers'), 'debug');
});

test('business routes keep info level', () => {
  assert.equal(getHttpLogLevel('POST', '/print'), 'info');
  assert.equal(getHttpLogLevel('POST', '/api/printer/test/atlas-burger-printer-1'), 'info');
});
