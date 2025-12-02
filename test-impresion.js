/**
 * Script para probar la impresión de la impresora Epson
 * Ejecuta: node test-impresion.js
 */

const http = require('http');

const PRINTER_ID = 'atlas-burger-printer-1';
const AGENT_URL = 'http://localhost:3001';
const AGENT_PORT = 3001;

console.log('🧪 Probando Impresora Epson\n');
console.log('='.repeat(50));
console.log('');

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
    req.setTimeout(10000, () => {
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
    console.log('1️⃣  Verificando agente...');
    try {
      // Intentar con múltiples hostnames
      const hostnames = ['127.0.0.1', 'localhost'];
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
            connected = true;
            global.workingHostname = hostname;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!connected) {
        throw new Error('No se pudo conectar al agente');
      }

      if (health.ok) {
        console.log('✅ Agente está corriendo');
        if (health.json.printers && health.json.printers.length > 0) {
          console.log(`   Impresoras configuradas: ${health.json.printers.length}`);
        }
      } else {
        throw new Error('Agente no responde correctamente');
      }
    } catch (error) {
      console.error('❌ El agente no está corriendo');
      console.error('   Ejecuta: npm run agent:dev\n');
      process.exit(1);
    }

    console.log('');

    // 2. Verificar estado de la impresora
    console.log('2️⃣  Verificando estado de la impresora...');
    try {
      const hostnameToUse = global.workingHostname || '127.0.0.1';
      
      const status = await makeRequest({
        hostname: hostnameToUse,
        port: AGENT_PORT,
        path: `/api/printer/status/${PRINTER_ID}`,
        method: 'GET'
      });

      if (status.ok) {
        console.log(`   ID: ${status.json.printerId}`);
        console.log(`   Nombre: ${status.json.printerName}`);
        console.log(`   Tipo: ${status.json.type}`);
        console.log(`   Conectada: ${status.json.connected ? '✅ Sí' : '⚠️  No'}`);
        
        if (!status.json.connected) {
          console.log(`   ⚠️  Mensaje: ${status.json.message || status.json.error || 'Desconocido'}`);
        }
      } else {
        console.log(`   ⚠️  Error: ${status.json.error || 'Desconocido'}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Error al verificar estado: ${error.message}`);
    }

    console.log('');

    // 2.5. Si la impresora no está configurada, configurarla automáticamente
    let printerConfigured = false;
    try {
      const statusCheck = await makeRequest({
        hostname: 'localhost',
        port: AGENT_PORT,
        path: `/api/printer/status/${PRINTER_ID}`,
        method: 'GET'
      });
      
      if (statusCheck.ok && statusCheck.json.printerId) {
        printerConfigured = true;
      }
    } catch (e) {
      // No está configurada
    }

    if (!printerConfigured) {
      console.log('2.5️⃣  Configurando impresora automáticamente...');
      try {
        const configData = {
          printerId: PRINTER_ID,
          type: 'usb',
          printerName: 'EPSON TM-T20III Receipt'
        };

        const hostnameToUse = global.workingHostname || '127.0.0.1';
        
        const configResponse = await makeRequest({
          hostname: hostnameToUse,
          port: AGENT_PORT,
          path: '/api/printer/configure',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }, configData);

        if (configResponse.ok) {
          console.log('✅ Impresora configurada exitosamente');
          printerConfigured = true;
        } else {
          console.log('⚠️  No se pudo configurar automáticamente');
        }
      } catch (error) {
        console.log(`⚠️  Error al configurar: ${error.message}`);
      }
      console.log('');
    }

    // 3. Hacer test de impresión
    console.log('3️⃣  Ejecutando test de impresión...');
    try {
      const hostnameToUse = global.workingHostname || '127.0.0.1';
      
      const testResponse = await makeRequest({
        hostname: hostnameToUse,
        port: AGENT_PORT,
        path: `/api/printer/test/${PRINTER_ID}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }, { printerId: PRINTER_ID });

       if (testResponse.ok && testResponse.json.success) {
         console.log('✅ Test de impresión exitoso');
         console.log(`   Mensaje: ${testResponse.json.message}`);
         console.log('');
         console.log('🎉 ¡La impresora debería haber impreso un ticket de prueba!');
         console.log('');
         console.log('💡 Si no salió papel, verifica:');
         console.log('   1. Que la impresora tenga papel');
         console.log('   2. Que la impresora esté encendida');
         console.log('   3. Que no haya papel atascado');
       } else {
         console.log('❌ Test de impresión falló');
         const errorMsg = testResponse.json.error || 'Desconocido';
         console.log(`   Error: ${errorMsg}`);
         console.log('');
         
         if (errorMsg.includes('no configurada')) {
           console.log('💡 La impresora no está configurada. Ejecuta:');
           console.log('   npm run config-printer');
         } else if (errorMsg.includes('compartida') || errorMsg.includes('administrador')) {
           console.log('💡 Verifica:');
           console.log('   1. Que la impresora esté compartida');
           console.log('   2. Que el servicio de spooler esté corriendo');
           console.log('   3. O ejecuta el agente como administrador');
         } else {
           console.log('💡 Verifica:');
           console.log('   1. Que la impresora esté encendida y conectada');
           console.log('   2. Que la impresora tenga papel');
           console.log('   3. Que la impresora esté compartida');
           console.log('   4. Que el servicio de spooler esté corriendo');
         }
       }
    } catch (error) {
      console.error('❌ Error al ejecutar test:', error.message);
      console.log('');
      console.log('💡 Verifica que el agente esté corriendo y la impresora esté configurada');
    }

    console.log('');
    console.log('✨ Prueba completada');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

