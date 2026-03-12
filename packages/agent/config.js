const path = require('path');
const agentDir = path.join(__dirname);
require('dotenv').config({ path: path.join(agentDir, '.env') });
require('dotenv').config({ path: path.join(agentDir, '.env.local'), override: true });
// Si .env tiene __SECURE__ y en .env.local solo hay NEXT_PUBLIC_*, usar esas
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if ((!process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY === '__SECURE__') && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

// Orígenes permitidos (CORS)
// Puedes configurar múltiples orígenes separados por coma en ALLOWED_ORIGINS
// Ejemplo: ALLOWED_ORIGINS=https://lomiteria1-0.vercel.app
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : (process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN.trim()] : ['*']); // Compatibilidad con ALLOWED_ORIGIN

module.exports = {
  port: process.env.PORT || 3001, // Puerto por defecto 3001 según documentación
  host: process.env.HOST || '0.0.0.0', // Escuchar en todas las interfaces para acceso desde red local e internet
  allowedOrigins, // Array de orígenes permitidos
  allowedOrigin: allowedOrigins[0] === '*' ? '*' : allowedOrigins, // Compatibilidad con código existente
  defaultPrinterType: process.env.DEFAULT_PRINTER_TYPE || 'usb',
  defaultPrinterIP: process.env.DEFAULT_PRINTER_IP || '192.168.1.100',
  defaultPrinterPort: process.env.DEFAULT_PRINTER_PORT || 9100,
  logLevel: process.env.LOG_LEVEL || 'info',
  // Configuración de túnel
  tunnelType: process.env.TUNNEL_TYPE || 'localtunnel', // 'localtunnel' o 'cloudflare'
  tunnelSubdomain: process.env.TUNNEL_SUBDOMAIN || null, // Subdomain fijo (ej: 'atlas-burger-print')
  autoTunnel: process.env.AUTO_TUNNEL !== 'false', // Habilitar túnel automático por defecto
  // Configuración específica de Cloudflare Tunnel
  cloudflareTunnelUUID: process.env.CLOUDFLARE_TUNNEL_UUID || null, // UUID del túnel de Cloudflare
  cloudflareTunnelDomain: process.env.CLOUDFLARE_TUNNEL_DOMAIN || null // Dominio completo (ej: 'atlas-burger-print.tudominio.com')
};




