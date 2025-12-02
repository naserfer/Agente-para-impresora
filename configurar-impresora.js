/**
 * Script para configurar la impresora Epson en el agente
 * Basado en la configuración del panel de Epson
 * 
 * Ejecuta: node configurar-impresora.js
 * O con parámetros: node configurar-impresora.js "mi-printer-id" "EPSON TM-T20III Receipt"
 */

const http = require('http');

// Configuración de la impresora (basada en el panel de Epson)
const PRINTER_ID = process.argv[2] || 'atlas-burger-printer-1';
const PRINTER_NAME = process.argv[3] || 'EPSON TM-T20III Receipt'; // Nombre exacto del panel
const AGENT_PORT = 3001;

console.log('🖨️  Configurando Impresora Epson en el Agente\n');
console.log('Configuración:');
console.log(`  - Printer ID: ${PRINTER_ID}`);
console.log(`  - Nombre: ${PRINTER_NAME}`);
console.log(`  - Tipo: USB\n`);

// Función para hacer peticiones HTTP
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({
            ok: false,
            status: res.statusCode,
            json: { error: responseData }
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  try {
    // 1. Verificar que el agente esté corriendo
    console.log('1️⃣  Verificando que el agente esté corriendo...');
    
    // Intentar con múltiples hostnames
    const hostnames = ['0.0.0.0', 'localhost', '127.0.0.1'];
    let health = null;
    let connected = false;
    
    for (const hostname of hostnames) {
      try {
        health = await makeRequest({
          hostname: hostname,
          port: AGENT_PORT,
          path: '/health',
          method: 'GET'
        });
        
        if (health.ok) {
          console.log(`✅ Agente está corriendo (conectado desde ${hostname})\n`);
          connected = true;
          // Guardar el hostname que funcionó para usarlo después
          global.workingHostname = hostname;
          break;
        }
      } catch (error) {
        // Intentar con el siguiente hostname
        continue;
      }
    }
    
    if (!connected) {
      // Intentar también con el endpoint raíz
      try {
        const root = await makeRequest({
          hostname: 'localhost',
          port: AGENT_PORT,
          path: '/',
          method: 'GET'
        });
        
        if (root.ok) {
          console.log('✅ Agente está corriendo (verificado con endpoint raíz)\n');
          connected = true;
        }
      } catch (error) {
        // No hacer nada, continuar con el error
      }
    }
    
    if (!connected) {
      console.error('❌ No se puede conectar al agente');
      console.error(`   Verificando puerto ${AGENT_PORT}...`);
      
      // Verificar si el puerto está escuchando
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync(`netstat -ano | findstr ":${AGENT_PORT}" | findstr "LISTENING"`);
        if (stdout && stdout.trim()) {
          console.error('   ⚠️  El puerto está escuchando pero no responde HTTP');
          console.error('   Puede ser un problema de firewall o el servidor no inició completamente');
        } else {
          console.error('   ⚠️  El puerto no está escuchando');
        }
      } catch (e) {
        // Ignorar error de netstat
      }
      
      console.error('\n💡 Soluciones:');
      console.error('   1. Verifica que el agente esté corriendo: npm run agent:dev');
      console.error('   2. Espera unos segundos después de iniciar el agente');
      console.error('   3. Verifica el firewall de Windows');
      console.error('   4. Prueba manualmente: curl http://localhost:3001/health\n');
      process.exit(1);
    }

    // 2. Configurar la impresora
    console.log('2️⃣  Configurando impresora...');
    const configData = {
      printerId: PRINTER_ID,
      type: 'usb',
      printerName: PRINTER_NAME
    };

    try {
      // Usar el hostname que funcionó en la verificación, o localhost por defecto
      const hostnameToUse = global.workingHostname || 'localhost';
      
      const response = await makeRequest({
        hostname: hostnameToUse,
        port: AGENT_PORT,
        path: '/api/printer/configure',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }, configData);

      if (response.ok) {
        console.log('✅ Impresora configurada exitosamente');
        console.log(`   ID: ${PRINTER_ID}`);
        console.log(`   Mensaje: ${response.json.message}`);
        if (response.json.config) {
          console.log(`   Tipo: ${response.json.config.type || 'usb'}`);
          console.log(`   Nombre: ${response.json.config.printerName || PRINTER_NAME}\n`);
        } else {
          console.log('');
        }
      } else {
        throw new Error(response.json.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('❌ Error al configurar la impresora:');
      console.error(`   ${error.message}\n`);
      process.exit(1);
    }

    // 3. Verificar el estado
    console.log('3️⃣  Verificando conexión...');
    try {
      const hostnameToUse = global.workingHostname || 'localhost';
      
      const status = await makeRequest({
        hostname: hostnameToUse,
        port: AGENT_PORT,
        path: `/api/printer/status/${PRINTER_ID}`,
        method: 'GET'
      });

      if (status.ok && status.json.connected) {
        console.log('✅ Impresora conectada y funcionando');
        console.log(`   Nombre: ${status.json.printerName}`);
        console.log(`   Tipo: ${status.json.type}\n`);
      } else {
        console.log('⚠️  Impresora configurada pero no responde');
        console.log('   Verifica que esté encendida y conectada\n');
      }
    } catch (error) {
      console.log('⚠️  No se pudo verificar el estado\n');
    }

    // 4. Resumen
    console.log('📋 Resumen:');
    console.log('─'.repeat(50));
    console.log(`✅ Impresora configurada con ID: "${PRINTER_ID}"`);
    console.log(`✅ Nombre de Windows: "${PRINTER_NAME}"`);
    console.log('');
    console.log('💡 Ahora puedes usar este printerId en tus peticiones:');
    console.log(`   {`);
    console.log(`     "printerId": "${PRINTER_ID}",`);
    console.log(`     "tipo": "cocina",`);
    console.log(`     "data": { ... }`);
    console.log(`   }`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

