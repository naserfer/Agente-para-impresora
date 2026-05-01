const test = require('node:test');
const assert = require('node:assert/strict');

const scope = require('./agent-scope');

test('sin AGENT_* definidos, tenant e impresora pasan', () => {
  const prevT = process.env.AGENT_TENANT_IDS;
  const prevP = process.env.AGENT_ALLOWED_PRINTER_IDS;
  try {
    delete process.env.AGENT_TENANT_IDS;
    delete process.env.AGENT_ALLOWED_PRINTER_IDS;
    assert.equal(scope.isTenantInAgentScope('cualquier-uuid'), true);
    assert.equal(scope.isPrinterIdInAgentScope('cualquier-printer'), true);
  } finally {
    if (prevT !== undefined) process.env.AGENT_TENANT_IDS = prevT;
    else delete process.env.AGENT_TENANT_IDS;
    if (prevP !== undefined) process.env.AGENT_ALLOWED_PRINTER_IDS = prevP;
    else delete process.env.AGENT_ALLOWED_PRINTER_IDS;
  }
});

test('listas separadas por coma restringen', () => {
  const prevT = process.env.AGENT_TENANT_IDS;
  const prevP = process.env.AGENT_ALLOWED_PRINTER_IDS;
  try {
    process.env.AGENT_TENANT_IDS = 'aaa,bbb';
    process.env.AGENT_ALLOWED_PRINTER_IDS = 'prn-1,prn-2';
    assert.equal(scope.isTenantInAgentScope('aaa'), true);
    assert.equal(scope.isTenantInAgentScope('ccc'), false);
    assert.equal(scope.isPrinterIdInAgentScope('prn-1'), true);
    assert.equal(scope.isPrinterIdInAgentScope('otro'), false);
  } finally {
    if (prevT !== undefined) process.env.AGENT_TENANT_IDS = prevT;
    else delete process.env.AGENT_TENANT_IDS;
    if (prevP !== undefined) process.env.AGENT_ALLOWED_PRINTER_IDS = prevP;
    else delete process.env.AGENT_ALLOWED_PRINTER_IDS;
  }
});
