/**
 * Script para obtener el ID/nombre de tu impresora Epson
 * Ejecuta: node obtener-id-impresora.js
 */

const http = require('http');

const AGENT_URL = 'http://0.0.0.0:3001';
const AGENT_PORT = 3001;

console.log('🔍 Obteniendo información de impresoras...\n');

// Función para hacer peticiones HTTP
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '0.0.0.0',
      port: AGENT_PORT,
      path: path,
      method: 'GET',
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

async function main() {
  try {
    // 1. Listar impresoras USB disponibles
    console.log('1️⃣  Impresoras USB disponibles:');
    console.log('─'.repeat(50));
    try {
      const usbPrinters = await makeRequest('/api/printer/list-usb');
      if (usbPrinters.success && usbPrinters.devices) {
        if (usbPrinters.devices.length > 0) {
          usbPrinters.devices.forEach((device, index) => {
            console.log(`   ${index + 1}. ${device.deviceName || device.name || 'Impresora USB'}`);
            if (device.vendorId) console.log(`      Vendor ID: ${device.vendorId}`);
            if (device.productId) console.log(`      Product ID: ${device.productId}`);
          });
        } else {
          console.log('   ⚠️  No se encontraron impresoras USB');
        }
      } else {
        console.log('   ❌ Error al obtener impresoras USB');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('');

    // 2. Ver impresoras configuradas en el agente
    console.log('2️⃣  Impresoras configuradas en el agente:');
    console.log('─'.repeat(50));
    try {
      const health = await makeRequest('/health');
      if (health.printers && health.printers.length > 0) {
        health.printers.forEach((printer, index) => {
          console.log(`   ${index + 1}. ID: ${printer.printerId}`);
          console.log(`      Nombre: ${printer.printerName}`);
          console.log(`      Tipo: ${printer.type}`);
        });
      } else {
        console.log('   ⚠️  No hay impresoras configuradas aún');
        console.log('   💡 Necesitas configurar la impresora primero');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('');

    // 3. Instrucciones
    console.log('📋 Instrucciones:');
    console.log('─'.repeat(50));
    console.log('1. Si tu impresora Epson aparece en la lista USB:');
    console.log('   - Usa ese nombre para configurarla');
    console.log('');
    console.log('2. Para configurar la impresora, usa:');
    console.log('   POST http://localhost:3001/api/printer/configure');
    console.log('   Body: {');
    console.log('     "printerId": "atlas-burger-printer-1",  // Tu ID personalizado');
    console.log('     "type": "usb",');
    console.log('     "printerName": "EPSON TM-T20"  // Nombre exacto de Windows');
    console.log('   }');
    console.log('');
    console.log('3. El printerId es un ID que TÚ defines, no es el nombre físico');
    console.log('   Ejemplo: "atlas-burger-printer-1", "lomiteria-001", etc.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Asegúrate de que el agente esté corriendo en el puerto 3001');
  }
}

main();

