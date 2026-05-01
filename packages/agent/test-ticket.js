const TicketGenerator = require('./printer/TicketGenerator');
const printerManager = require('./printer/PrinterManager');

// Datos de ejemplo para probar el ticket
const orderData = {
  lomiteriaName: 'Restaurante Oriental 8',
  orderType: 'delivery',
  orderId: '152',
  createdAt: new Date().toISOString(),
  customerName: 'Juan Pérez',
  deliveryAddress: 'Av. Principal 123',
  items: [
    {
      nombre: 'Arabe de Carne',
      cantidad: 2,
      notes: 'Sin cebolla, extra queso'
    },
    {
      nombre: 'Arabe Mixto',
      cantidad: 1,
      notes: null
    },
    {
      nombre: 'Lomito Completo',
      cantidad: 1,
      notes: 'Sin tomate'
    },
    {
      nombre: 'Hamburguesa Clásica',
      cantidad: 3,
      notes: 'Bien cocida'
    }
  ],
  orderNotes: 'Entregar rápido por favor'
};

async function testTicket() {
  console.log('🧪 Generando ticket de prueba...\n');
  
  // Generar el buffer del ticket
  const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
  
  console.log('✅ Ticket generado exitosamente');
  console.log(`📏 Tamaño del buffer: ${ticketBuffer.length} bytes\n`);
  
  // Mostrar una vista previa del contenido (primeros bytes)
  console.log('📄 Vista previa del buffer (primeros 200 bytes):');
  console.log(ticketBuffer.slice(0, 200));
  console.log('\n');
  
  // Intentar imprimir si hay una impresora configurada
  const printers = Array.from(printerManager.printers.keys());
  
  if (printers.length > 0) {
    console.log(`🖨️  Impresoras configuradas: ${printers.join(', ')}`);
    console.log(`💡 Para imprimir, usa: node test-ticket.js --print ${printers[0]}\n`);
  } else {
    console.log('⚠️  No hay impresoras configuradas');
    console.log('💡 El ticket se generó correctamente, pero no se puede imprimir automáticamente\n');
  }
  
  // Si se pasa --print como argumento, intentar imprimir
  if (process.argv.includes('--print')) {
    const printerId = process.argv[process.argv.indexOf('--print') + 1] || printers[0];
    
    if (!printerId) {
      console.error('❌ Error: No se especificó printerId y no hay impresoras configuradas');
      process.exit(1);
    }
    
    if (!printers.includes(printerId)) {
      console.error(`❌ Error: La impresora "${printerId}" no está configurada`);
      console.log(`💡 Impresoras disponibles: ${printers.join(', ')}`);
      process.exit(1);
    }
    
    console.log(`🖨️  Imprimiendo en: ${printerId}...`);
    try {
      await printerManager.print(printerId, ticketBuffer);
      console.log('✅ Ticket impreso exitosamente!');
    } catch (error) {
      console.error('❌ Error al imprimir:', error.message);
      process.exit(1);
    }
  } else {
    console.log('💡 Para imprimir realmente, ejecuta:');
    console.log(`   node test-ticket.js --print ${printers[0] || 'PRINTER_ID'}`);
  }
}

// Ejecutar
testTicket().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

