/**
 * Script de prueba para el agente de impresión
 * Ejecutar: node examples/test-print.js
 */

const PRINT_AGENT_URL = 'http://0.0.0.0:3001';

async function testPrint() {
  const printerId = 'atlas-burger-printer-1';

  try {
    console.log('🔍 Verificando estado del agente...');
    const healthCheck = await fetch(`${PRINT_AGENT_URL}/health`);
    const health = await healthCheck.json();
    console.log('✅ Agente activo:', health);

    console.log('\n📋 Configurando impresora...');
    const configResponse = await fetch(`${PRINT_AGENT_URL}/api/printer/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId,
        type: 'usb' // Cambiar a 'network' si es impresora de red
      })
    });

    if (!configResponse.ok) {
      const error = await configResponse.json();
      throw new Error(error.error);
    }

    const config = await configResponse.json();
    console.log('✅ Impresora configurada:', config);

    console.log('\n🍽️  Imprimiendo ticket de cocina de prueba...');
    const kitchenTicketResponse = await fetch(`${PRINT_AGENT_URL}/api/print/kitchen-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId,
        orderData: {
          orderId: 'TEST-001',
          tableNumber: '5',
          customerName: 'Cliente de Prueba',
          lomiteriaName: 'Lomitería El Buen Sabor',
          createdAt: new Date().toLocaleString('es-AR'),
          items: [
            {
              name: 'Lomo Completo',
              quantity: 2,
              notes: 'Sin cebolla'
            },
            {
              name: 'Papas Fritas',
              quantity: 1
            },
            {
              name: 'Coca Cola',
              quantity: 2
            }
          ]
        }
      })
    });

    if (!kitchenTicketResponse.ok) {
      const error = await kitchenTicketResponse.json();
      throw new Error(error.error);
    }

    const kitchenResult = await kitchenTicketResponse.json();
    console.log('✅ Ticket de cocina enviado:', kitchenResult);

    // Esperar un momento antes de imprimir la factura
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n🧾 Imprimiendo factura de prueba...');
    const invoiceResponse = await fetch(`${PRINT_AGENT_URL}/api/print/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId,
        invoiceData: {
          invoiceNumber: 'FAC-001-00012345',
          customerName: 'Cliente de Prueba',
          customerAddress: 'Av. Corrientes 1234',
          customerTaxId: '20-12345678-9',
          lomiteriaName: 'Lomitería El Buen Sabor',
          lomiteriaAddress: 'Av. Principal 456',
          lomiteriaTaxId: '30-98765432-1',
          createdAt: new Date().toLocaleString('es-AR'),
          items: [
            {
              name: 'Lomo Completo',
              quantity: 2,
              unitPrice: 1500,
              subtotal: 3000
            },
            {
              name: 'Papas Fritas',
              quantity: 1,
              unitPrice: 500,
              subtotal: 500
            },
            {
              name: 'Coca Cola',
              quantity: 2,
              unitPrice: 300,
              subtotal: 600
            }
          ],
          subtotal: 4100,
          tax: 861,
          total: 4961,
          paymentMethod: 'Efectivo'
        }
      })
    });

    if (!invoiceResponse.ok) {
      const error = await invoiceResponse.json();
      throw new Error(error.error);
    }

    const invoiceResult = await invoiceResponse.json();
    console.log('✅ Factura enviada:', invoiceResult);

    console.log('\n✅ Todas las pruebas completadas exitosamente!');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    process.exit(1);
  }
}

// Ejecutar prueba
testPrint();




