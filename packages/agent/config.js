require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001, // Puerto por defecto 3001 según documentación
  host: process.env.HOST || '0.0.0.0', // Escuchar en todas las interfaces para acceso desde red local
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*', // Permitir desde cualquier origen en red local
  defaultPrinterType: process.env.DEFAULT_PRINTER_TYPE || 'usb',
  defaultPrinterIP: process.env.DEFAULT_PRINTER_IP || '192.168.1.100',
  defaultPrinterPort: process.env.DEFAULT_PRINTER_PORT || 9100,
  logLevel: process.env.LOG_LEVEL || 'info'
};




