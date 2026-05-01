/**
 * Aislamiento multi-tenant / multi-impresora por instalación (variables de entorno).
 * - AGENT_TENANT_IDS: UUID(s) de lomitería permitidos; si está definido y no vacío, el resto se rechaza.
 * - AGENT_ALLOWED_PRINTER_IDS: id(s) lógicos de impresora permitidos; si está definido, solo esos pueden imprimir.
 */

function parseCommaList(value) {
  if (value == null || String(value).trim() === '') return null;
  const list = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function isTenantInAgentScope(tenantId) {
  const list = parseCommaList(process.env.AGENT_TENANT_IDS);
  if (!list) return true;
  return Boolean(tenantId && list.includes(tenantId));
}

function isPrinterIdInAgentScope(printerId) {
  const list = parseCommaList(process.env.AGENT_ALLOWED_PRINTER_IDS);
  if (!list) return true;
  return Boolean(printerId && list.includes(printerId));
}

module.exports = {
  parseCommaList,
  isTenantInAgentScope,
  isPrinterIdInAgentScope
};
