const NOISY_POLLING_ROUTES = new Set([
  '/health',
  '/api/history',
  '/api/printers'
]);

function getHttpLogLevel(method, path) {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedPath = String(path || '').trim();

  if (normalizedMethod === 'GET' && NOISY_POLLING_ROUTES.has(normalizedPath)) {
    return 'debug';
  }

  return 'info';
}

module.exports = {
  getHttpLogLevel
};
