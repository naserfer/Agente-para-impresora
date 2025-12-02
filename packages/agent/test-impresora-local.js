/**
 * Script de prueba rápida para la impresora Epson TM-T20
 * Ejecutar: node test-impresora-local.js
 */

const PRINT_AGENT_URL = process.env.PRINT_AGENT_URL || 'http://localhost:3001';
const PRINTER_ID = 'epson-tm-t20-001'; // Cambia este ID si quieres usar otro

async function testImpresora() {
  console.log('🖨️  Iniciando prueba de impresora Epson TM-T20...\n');

  try {
    // Paso 1: Verificar que el agente esté corriendo
    console.log('1️⃣  Verificando estado del agente...');
    const healthCheck = await fetch(`${PRINT_AGENT_URL}/health`);
    if (!healthCheck.ok) {
      throw new Error('El agente no está corriendo. Ejecuta: npm start');
    }
    const health = await healthCheck.json();
    console.log('✅ Agente activo:', health.status);
    console.log('   Impresoras configuradas:', health.printers || []);
    console.log('');

    // Paso 2: Listar impresoras USB disponibles
    console.log('2️⃣  Buscando impresoras USB...');
    const listResponse = await fetch(`${PRINT_AGENT_URL}/api/printer/list-usb`);
    if (!listResponse.ok) {
      throw new Error('Error al listar impresoras USB');
    }
    const listData = await listResponse.json();
    console.log('✅ Impresoras USB encontradas:', listData.devices?.length || 0);
    if (listData.devices && listData.devices.length > 0) {
      listData.devices.forEach((device, index) => {
        console.log(`   ${index + 1}. ${device.deviceName || 'Impresora USB'}`);
      });
    } else {
      console.log('   ⚠️  No se encontraron impresoras USB');
      console.log('   Verifica que la impresora esté conectada y encendida');
    }
    console.log('');

    // Paso 3: Configurar la impresora
    console.log('3️⃣  Configurando impresora...');
    const configResponse = await fetch(`${PRINT_AGENT_URL}/api/printer/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId: PRINTER_ID,
        type: 'usb'
      })
    });

    if (!configResponse.ok) {
      const error = await configResponse.json();
      throw new Error(error.error || 'Error al configurar impresora');
    }

    const config = await configResponse.json();
    console.log('✅ Impresora configurada:', config.message);
    console.log('   Printer ID:', PRINTER_ID);
    console.log('');

    // Paso 4: Prueba de texto simple
    console.log('4️⃣  Prueba 1: Imprimiendo texto simple...');
    const textResponse = await fetch(`${PRINT_AGENT_URL}/api/print/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId: PRINTER_ID,
        text: '━━━━━━━━━━━━━━━━━━━━\nPRUEBA DE IMPRESION\nEpson TM-T20\n━━━━━━━━━━━━━━━━━━━━\n\nSi ves esto, la impresora funciona!\n\n'
      })
    });

    if (!textResponse.ok) {
      const error = await textResponse.json();
      throw new Error(error.error || 'Error al imprimir texto');
    }

    const textResult = await textResponse.json();
    console.log('✅ Texto impreso:', textResult.message);
    console.log('   Verifica que el ticket haya salido de la impresora');
    console.log('');

    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Paso 5: Prueba de ticket de cocina
    console.log('5️⃣  Prueba 2: Imprimiendo ticket de cocina...');
    const kitchenResponse = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId: PRINTER_ID,
        tipo: 'cocina',
        data: {
          numeroPedido: 42,
          tipoPedido: 'local',
          items: [
            {
              nombre: 'Lomo Completo',
              cantidad: 2,
              personalizaciones: 'sin cebolla'
            },
            {
              nombre: 'Papas Fritas',
              cantidad: 1
            },
            {
              nombre: 'Coca Cola',
              cantidad: 2
            }
          ],
          total: 5000,
          cliente: {
            nombre: 'Cliente de Prueba'
          },
          fecha: new Date().toISOString(),
          lomiteriaName: 'Lomitería de Prueba'
        }
      })
    });

    if (!kitchenResponse.ok) {
      const error = await kitchenResponse.json();
      throw new Error(error.error || 'Error al imprimir ticket de cocina');
    }

    const kitchenResult = await kitchenResponse.json();
    console.log('✅ Ticket de cocina impreso:', kitchenResult.message);
    console.log('   Verifica que el ticket haya salido de la impresora');
    console.log('');

    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Paso 6: Prueba de factura
    console.log('6️⃣  Prueba 3: Imprimiendo factura...');
    const invoiceResponse = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId: PRINTER_ID,
        tipo: 'factura',
        data: {
          numeroFactura: 'FAC-001-00012345',
          cliente: {
            nombre: 'Cliente de Prueba',
            direccion: 'Av. Corrientes 1234',
            ci: '12345678'
          },
          items: [
            {
              nombre: 'Lomo Completo',
              cantidad: 2,
              precioUnitario: 1500,
              subtotal: 3000
            },
            {
              nombre: 'Papas Fritas',
              cantidad: 1,
              precioUnitario: 500,
              subtotal: 500
            }
          ],
          subtotal: 3500,
          impuestos: 735,
          total: 4235,
          metodoPago: 'Efectivo',
          fecha: new Date().toISOString(),
          lomiteriaName: 'Lomitería de Prueba',
          lomiteriaAddress: 'Av. Principal 456',
          lomiteriaTaxId: '30-98765432-1'
        }
      })
    });

    if (!invoiceResponse.ok) {
      const error = await invoiceResponse.json();
      throw new Error(error.error || 'Error al imprimir factura');
    }

    const invoiceResult = await invoiceResponse.json();
    console.log('✅ Factura impresa:', invoiceResult.message);
    console.log('   Verifica que la factura haya salido de la impresora');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ¡Todas las pruebas completadas exitosamente!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 Resumen:');
    console.log('   - Texto simple: ✅');
    console.log('   - Ticket de cocina: ✅');
    console.log('   - Factura: ✅');
    console.log('');
    console.log('🎉 Tu impresora Epson TM-T20 está funcionando correctamente!');

  } catch (error) {
    console.error('');
    console.error('❌ Error en la prueba:', error.message);
    console.error('');
    console.error('💡 Soluciones:');
    console.error('   1. Verifica que el agente esté corriendo: npm start');
    console.error('   2. Verifica que la impresora esté conectada y encendida');
    console.error('   3. Verifica que los drivers estén instalados');
    console.error('   4. Revisa los logs del agente para más detalles');
    console.error('');
    process.exit(1);
  }
}

// Ejecutar prueba
testImpresora();

