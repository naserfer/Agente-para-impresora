const test = require('node:test');
const assert = require('node:assert/strict');

const printerManager = require('./PrinterManager');

test('buildFastPathHostCandidates prioritizes env host and includes safe loopbacks', () => {
  const hosts = printerManager._test.buildFastPathHostCandidates({
    WINDOWS_SPOOL_FAST_PATH_HOST: '127.0.0.1',
    COMPUTERNAME: 'IVµNX'
  });

  assert.deepEqual(hosts, ['127.0.0.1', 'localhost', 'IVµNX']);
});

test('buildFastPathShareCandidates includes detected and sanitized names', () => {
  const shares = printerManager._test.buildFastPathShareCandidates(
    'EPSON TM-T20III Receipt',
    { shareName: 'EPSON_TM_T20III_Receipt' },
    { WINDOWS_PRINTER_SHARE_NAME: 'EPSON_TM_T20III_Receipt' }
  );

  assert.deepEqual(shares, ['EPSON_TM_T20III_Receipt', 'EPSON_TM-T20III_Receipt']);
});

test('tryWindowsFastPathMatrix retries hosts and shares until one works', async () => {
  const attempts = [];
  const copyFn = async (_printerName, _data, options) => {
    attempts.push(`\\\\${options.host}\\${options.shareName}`);
    if (options.host === '127.0.0.1' && options.shareName === 'EPSON_TM_T20III_Receipt') {
      return {
        printerPath: `\\\\${options.host}\\${options.shareName}`,
        elapsedMs: 77
      };
    }
    throw new Error('copy failed');
  };

  const result = await printerManager._test.tryWindowsFastPathMatrix(
    'EPSON TM-T20III Receipt',
    Buffer.from('x'),
    { shareName: 'EPSON_TM_T20III_Receipt' },
    { COMPUTERNAME: 'IVµNX' },
    copyFn
  );

  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.shareName, 'EPSON_TM_T20III_Receipt');
  assert.equal(result.elapsedMs, 77);
  assert.ok(attempts.length >= 1);
});
