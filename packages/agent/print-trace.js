const { randomUUID } = require('crypto');

function createCorrelationId() {
  try {
    return randomUUID();
  } catch (_) {
    return `corr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }
}

function buildTraceEntry({ correlationId, orderId = null, stage, source = 'agent', meta = {} }) {
  return {
    ts: new Date().toISOString(),
    correlation_id: correlationId,
    order_id: orderId != null ? String(orderId) : null,
    stage,
    source,
    ...meta
  };
}

function dispatchTraceRpc(supabase, logger, { correlationId, orderId, stage, source, meta }) {
  Promise.resolve()
    .then(() => supabase.rpc('log_print_event', {
      p_correlation_id: correlationId,
      p_stage: stage,
      p_source: source,
      p_order_id: orderId != null ? String(orderId) : null,
      p_meta: meta
    }))
    .then(({ error }) => {
      if (!error) return;
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[log_print_event] ${error.message}`, { service: 'supabase-listener' });
      } else {
        console.warn('[log_print_event]', error.message);
      }
    })
    .catch((error) => {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[log_print_event] ${error.message}`, { service: 'supabase-listener' });
      } else {
        console.warn('[log_print_event]', error.message);
      }
    });
}

function logPrintTrace(supabase, logger, { correlationId, orderId = null, stage, source = 'agent', meta = {} }) {
  if (!correlationId || !stage) return;

  const entry = buildTraceEntry({ correlationId, orderId, stage, source, meta });
  if (logger && typeof logger.info === 'function') {
    logger.info('print_trace', entry);
  } else {
    // Fallback para entornos sin logger disponible.
    console.log(JSON.stringify(entry));
  }

  if (!supabase || typeof supabase.rpc !== 'function') return;

  dispatchTraceRpc(supabase, logger, { correlationId, orderId, stage, source, meta });
}

module.exports = {
  createCorrelationId,
  buildTraceEntry,
  logPrintTrace
};
