#!/usr/bin/env node

/**
 * SCRIPT DE EMPAQUETADO AUTOMÁTICO
 * 
 * Este script genera un instalador personalizado por cliente.
 * Lee la configuración de cliente-config-[nombre].json y genera:
 * - Instalador Windows (.exe)
 * - Versión portable (.exe)
 * - SQL pre-configurado
 * - Manual de usuario
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Leer archivo de configuración del cliente
function loadClientConfig(clientName) {
  const configPath = path.join(__dirname, `cliente-config-${clientName}.json`);

  if (!fs.existsSync(configPath)) {
    error(`No se encontró el archivo de configuración: ${configPath}`);
    error(`Crea primero cliente-config-${clientName}.json basado en cliente-config.template.json`);
    process.exit(1);
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    success(`Configuración cargada: ${config.cliente.nombre}`);
    return config;
  } catch (e) {
    error(`Error leyendo configuración: ${e.message}`);
    process.exit(1);
  }
}

function validateClientConfig(config) {
  const missing = [];
  if (!config?.supabase?.url) missing.push('supabase.url');
  if (!config?.supabase?.anonKey) missing.push('supabase.anonKey');
  if (!config?.impresora?.printerId) missing.push('impresora.printerId');
  if (!config?.cliente?.nombre) missing.push('cliente.nombre');
  if (!config?.cliente?.slug) missing.push('cliente.slug');

  if (missing.length > 0) {
    error(`Configuración incompleta. Faltan campos requeridos: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Generar SQL personalizado
function generateSQL(config) {
  info('Generando SQL personalizado...');

  const template = fs.readFileSync(
    path.join(__dirname, 'packages/agent/database/atlas-burguer.sql'),
    'utf8'
  );

  // Reemplazar valores del template
  let sql = template
    .replace(/Atlas Burger/g, config.cliente.nombre)
    .replace(/atlas-burger/g, config.cliente.slug)
    .replace(/atlas-burger-printer-1/g, config.impresora.printerId)
    .replace(/EPSON TM-T20III Receipt/g, config.impresora.nombreEsperado);

  // Guardar SQL personalizado
  const outputPath = path.join(__dirname, `output/setup-${config.cliente.slug}.sql`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql, 'utf8');

  success(`SQL generado: ${outputPath}`);
  return outputPath;
}

// Generar archivo .env pre-configurado
function generateEnv(config) {
  info('Generando archivo .env...');

  const clientDisplayName = String(config.cliente.nombre || '')
    .replace(/\r?\n/g, ' ')
    .trim();

  let envContent = `# Configuración del Agente - ${config.cliente.nombre}
# Generado automáticamente - BLOQUEADO EN BUILD
# No exponer ni editar credenciales en el cliente final

# Identificador de instalación (sirve para detectar cambios de build por usuario Windows)
AGENT_INSTALL_ID=${config.cliente.slug}

# Nombre del negocio en la app y tickets (desde cliente-config; el asistente sigue pidiendo impresora si no hay PRINTER_* en userData)
CLIENT_NAME=${clientDisplayName}

# Conexión a Supabase
SUPABASE_URL=${config.supabase.url}
SUPABASE_ANON_KEY=${config.supabase.anonKey}
SUPABASE_ORDERS_TABLE=${config.supabase.ordersTable}

# Habilitar listener de Supabase Realtime
ENABLE_SUPABASE_LISTENER=${config.avanzado.enableSupabaseListener}

# Puerto del agente
PORT=${config.avanzado.puerto}
HOST=0.0.0.0

# CORS - Permitir requests desde Vercel
ALLOWED_ORIGINS=${config.aplicacion.vercelUrl}

# Logs
LOG_LEVEL=${config.avanzado.logLevel}

# Impresión de facturas
ENABLE_INVOICE_PRINTING=${config.avanzado.enableInvoicePrinting ?? false}

# Spool Windows (solo fast-path)
WINDOWS_SPOOL_FAST_PATH=true
WINDOWS_SPOOL_FAST_PATH_TIMEOUT_MS=1200

# NO usar túneles con Supabase Realtime
# NO usar túneles con Supabase Realtime
AUTO_TUNNEL=false
`;

  const tenantIds =
    (config.avanzado && config.avanzado.agentTenantIds) ||
    (config.cliente && config.cliente.tenantId) ||
    '';
  if (tenantIds && String(tenantIds).trim()) {
    envContent += `
# Aislamiento multi-tenant: solo esta lomitería (UUID; varios separados por coma)
AGENT_TENANT_IDS=${String(tenantIds).trim()}
# Solo este printer_id puede imprimir (Realtime + HTTP)
AGENT_ALLOWED_PRINTER_IDS=${String(config.impresora.printerId || '').trim()}
`;
  }

  envContent += `
# Configuración local editable en runtime (wizard)
# PRINTER_ID y CLIENT_NAME se guardan localmente por instalación
`;

  const outputPath = path.join(__dirname, 'output/.env');
  fs.writeFileSync(outputPath, envContent, 'utf8');

  // COPIAR a packages/agent/.env para que se incluya en el build
  const agentEnvPath = path.join(__dirname, 'packages/agent/.env');
  fs.copyFileSync(outputPath, agentEnvPath);
  success(`Archivo .env copiado a: ${agentEnvPath}`);

  success(`Archivo .env generado: ${outputPath}`);
  return outputPath;
}

// Generar manual de usuario
function generateManual(config) {
  info('Generando manual de usuario...');

  const manual = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       MANUAL DE USUARIO - AGENTE DE IMPRESIÓN            ║
║              ${config.cliente.nombre.padEnd(33)}      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📋 CONTENIDO

1. Instalación
2. Configuración Inicial
3. Uso Diario
4. Solución de Problemas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣  INSTALACIÓN

Paso 1: Conectar la impresora
   • Conecta la impresora térmica Epson al puerto USB
   • Enciende la impresora
   • Windows instalará los drivers automáticamente

Paso 2: Instalar el agente
   • Ejecuta: Agente de Impresión Setup.exe
   • Sigue el asistente de instalación
   • Acepta la ubicación de instalación

Paso 3: Primera ejecución
   • El programa se abrirá automáticamente
   • Aparecerá un asistente de configuración

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2️⃣  CONFIGURACIÓN INICIAL (Solo primera vez)

El asistente te guiará en 3 pasos:

Paso 1: Información del Negocio
   • Nombre: ${config.cliente.nombre}
   • Este nombre aparecerá en los tickets

Paso 2: Seleccionar Impresora
   • Selecciona: ${config.impresora.nombreEsperado}
   • ID de impresora: ${config.impresora.printerId}
   • Presiona "Finalizar"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3️⃣  USO DIARIO

Iniciar el agente:
   1. Abre el programa "Agente de Impresión"
   2. Presiona el botón verde "INICIAR AGENTE"
   3. Espera a ver "● ACTIVO - Imprimiendo automáticamente"
   4. ¡Listo! Los tickets se imprimirán automáticamente

Detener el agente:
   • Presiona el botón rojo "DETENER AGENTE"

💡 IMPORTANTE:
   • El agente DEBE estar activo para imprimir
   • Deja el programa abierto durante el día
   • Los tickets se imprimen automáticamente cuando se confirma un pedido

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4️⃣  SOLUCIÓN DE PROBLEMAS

❓ El botón "INICIAR AGENTE" no funciona
   → Verifica que la impresora esté encendida
   → Cierra y vuelve a abrir el programa

❓ No imprime los tickets
   → Verifica que el indicador diga "● ACTIVO"
   → Ve a la pestaña "Impresora" y verifica que esté configurada
   → Prueba con "Imprimir Prueba"

❓ La impresora no aparece en la lista
   → Verifica que esté conectada y encendida
   → Reinstala los drivers de la impresora
   → Reinicia la computadora

❓ Error de conexión a Supabase
   → Verifica tu conexión a internet
   → Contacta a soporte técnico

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📞 SOPORTE TÉCNICO

Email: soporte@lomiteria.com
Teléfono: [AGREGAR NÚMERO]

Versión del software: ${config.aplicacion.version}
Cliente: ${config.cliente.nombre}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  const outputPath = path.join(__dirname, `output/MANUAL-${config.cliente.slug}.txt`);
  fs.writeFileSync(outputPath, manual, 'utf8');

  success(`Manual generado: ${outputPath}`);
  return outputPath;
}

// Empaquetar aplicación
function buildInstaller(config) {
  info('Empaquetando aplicación con Electron Builder...');

  try {
    // Actualizar package.json con nombre del cliente
    const desktopPkgPath = path.join(__dirname, 'packages/desktop/package.json');
    const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));

    // Branding global para todos los locales
    desktopPkg.build.productName = 'Agente de Impresion de KaruBox';
    desktopPkg.version = config.aplicacion.version;

    fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2), 'utf8');

    // Construir con electron-builder
    log('\n📦 Construyendo instalador...', 'bright');
    execSync('npm run build --workspace=packages/desktop', {
      stdio: 'inherit',
      cwd: __dirname
    });

    success('Instalador generado correctamente');

    // Renombrar archivos con nombre del cliente
    const distPath = path.join(__dirname, 'packages/desktop/dist-installer-unlock');
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath);
      files.forEach(file => {
        if (file.endsWith('.exe')) {
          const newName = file.replace(
            'Agente de Impresión',
            `${config.cliente.nombre} - Agente`
          );
          const oldPath = path.join(distPath, file);
          const newPath = path.join(__dirname, `output/${newName}`);
          fs.copyFileSync(oldPath, newPath);
          success(`Instalador copiado: ${newName}`);
        }
      });
    }

  } catch (e) {
    error(`Error construyendo instalador: ${e.message}`);
    process.exit(1);
  }
}

// Main
function main() {
  log('\n╔═══════════════════════════════════════════════════════════╗', 'bright');
  log('║     GENERADOR DE INSTALADOR POR CLIENTE                  ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'bright');

  // Obtener nombre del cliente desde argumentos
  const clientName = process.argv[2];

  if (!clientName) {
    error('Debes especificar el nombre del cliente');
    info('Uso: node build-installer.js [nombre-cliente]');
    info('Ejemplo: node build-installer.js atlas-burger');
    process.exit(1);
  }

  info(`Cliente: ${clientName}\n`);

  // 1. Cargar configuración
  const config = loadClientConfig(clientName);
  validateClientConfig(config);

  // 2. Crear directorio de salida
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 3. Generar archivos
  log('\n📝 Generando archivos...', 'bright');
  const sqlPath = generateSQL(config);
  const envPath = generateEnv(config);
  const manualPath = generateManual(config);

  // 4. Construir instalador
  log('\n🏗️  Construyendo instalador...', 'bright');
  buildInstaller(config);

  // 5. Resumen final
  log('\n╔═══════════════════════════════════════════════════════════╗', 'bright');
  log('║              ✅ PROCESO COMPLETADO                        ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'bright');

  success(`Paquete generado para: ${config.cliente.nombre}`);
  info('\n📦 Archivos generados en ./output/:');
  info(`   • Instalador Windows (.exe)`);
  info(`   • Versión Portable (.exe)`);
  info(`   • Script SQL: setup-${config.cliente.slug}.sql`);
  info(`   • Manual: MANUAL-${config.cliente.slug}.txt`);
  info(`   • Configuración: .env (pre-configurado)`);

  log('\n📋 Próximos pasos:', 'bright');
  info('1. Envía todos los archivos de ./output/ al cliente');
  info('2. El cliente ejecuta el instalador');
  info('3. En la primera ejecución, completa el wizard con:');
  info(`   - Supabase URL: ${config.supabase.url ? '[CONFIGURADO]' : '[POR COMPLETAR]'}`);
  info(`   - Supabase Key: ${config.supabase.anonKey ? '[CONFIGURADO]' : '[POR COMPLETAR]'}`);
  info('4. Ejecuta el SQL en Supabase');
  info('5. ¡Presiona INICIAR AGENTE y listo!');

  log('\n');
}

// Ejecutar
try {
  main();
} catch (e) {
  error(`Error fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
}

