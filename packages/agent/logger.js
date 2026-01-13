const winston = require('winston');
const path = require('path');
const os = require('os');
const fs = require('fs');
const config = require('./config');

// Determinar dónde guardar los logs
// Si está corriendo desde Electron (en Program Files), usar userData o temp
// Si está en desarrollo, usar el directorio actual
let logsDir = 'logs';
if (process.env.ELECTRON_RUN_AS_NODE) {
  // Está corriendo desde Electron, usar una ruta accesible
  // Intentar usar APPDATA primero, luego temp
  const appDataPath = process.env.APPDATA || process.env.LOCALAPPDATA || os.homedir();
  logsDir = path.join(appDataPath, 'Agente de Impresion', 'logs');
  
  // Asegurar que el directorio existe
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (error) {
    // Si falla, usar temp como fallback
    logsDir = path.join(os.tmpdir(), 'agente-impresion-logs');
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (tempError) {
      // Si también falla temp, deshabilitar logs a archivo
      console.warn('⚠️ No se pudo crear directorio de logs, solo usando console');
      logsDir = null;
    }
  }
} else {
  // Desarrollo o ejecución directa, usar directorio actual
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (error) {
    console.warn('⚠️ No se pudo crear directorio de logs, solo usando console');
    logsDir = null;
  }
}

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
      })
    )
  })
];

// Solo agregar transports de archivo si logsDir está disponible
if (logsDir) {
  transports.push(
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') })
  );
}

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'print-agent' },
  transports
});

module.exports = logger;




