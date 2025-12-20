const TicketGenerator = require('./printer/TicketGenerator');

// Datos de ejemplo para probar el ticket
const orderData = {
  lomiteriaName: 'Atlas Burger',
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

// Generar el buffer del ticket
const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);

// Convertir buffer a string (simulando cómo lo vería la impresora)
const ticketStr = ticketBuffer.toString('latin1');

// Separar en líneas
const lines = ticketStr.split('\n');

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║        VISTA PREVIA DEL TICKET IMPRESO            ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Mostrar cada línea con indicadores visuales
lines.forEach((line, index) => {
  // Filtrar comandos ESC/POS y mostrar solo texto visible
  let cleanLine = line;
  
  // Remover comandos ESC/POS comunes (simplificado)
  cleanLine = cleanLine.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // ANSI escape sequences
  cleanLine = cleanLine.replace(/\x1B[^a-zA-Z]*[a-zA-Z]/g, ''); // ESC sequences
  
  // Si la línea tiene contenido visible después de limpiar comandos
  if (cleanLine.trim().length > 0 || line.includes('\r')) {
    // Mostrar la línea con indicadores de ancho
    const displayLine = cleanLine.replace(/\r/g, '').replace(/\x1B/g, '[ESC]');
    
    // Mostrar con guías de columna cada 10 caracteres
    let guide = '';
    for (let i = 0; i < 48; i++) {
      if (i % 10 === 0 && i > 0) {
        guide += '|';
      } else {
        guide += ' ';
      }
    }
    
    // Mostrar línea con su longitud
    const lineLength = displayLine.replace(/\[ESC\][^\[]*/g, '').length;
    const padding = ' '.repeat(Math.max(0, 50 - displayLine.length));
    
    console.log(`${displayLine}${padding} [${lineLength} chars]`);
    
    // Mostrar guía de columnas cada 10 líneas
    if (index % 10 === 0 && index > 0) {
      console.log(`         10        20        30        40`);
    }
  }
});

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║        ANÁLISIS DE ALINEACIÓN                     ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Analizar líneas de items específicamente
lines.forEach((line, index) => {
  // Buscar líneas que contengan items
  const cleanLine = line.replace(/\x1B[^a-zA-Z]*[a-zA-Z]/g, '').replace(/\r/g, '');
  
  if (cleanLine.includes('Producto') || cleanLine.includes('Cant.') || 
      cleanLine.match(/Arabe|Lomito|Hamburguesa/) || 
      cleanLine.match(/^\s*\d+\s*$/)) {
    
    console.log(`Línea ${index}:`);
    console.log(`  Texto: "${cleanLine}"`);
    console.log(`  Longitud: ${cleanLine.length} caracteres`);
    
    // Si es una línea de item, analizar alineación
    const itemMatch = cleanLine.match(/^(.+?)(\s+)(\d+)$/);
    if (itemMatch) {
      const producto = itemMatch[1].trim();
      const padding = itemMatch[2];
      const cantidad = itemMatch[3];
      
      console.log(`  ┌─ Producto: "${producto}" (${producto.length} chars)`);
      console.log(`  ├─ Padding: ${padding.length} espacios`);
      console.log(`  └─ Cantidad: "${cantidad}" (columna ${cleanLine.length - cantidad.length + 1}-${cleanLine.length})`);
      
      // Mostrar visualización de columnas
      let visual = '';
      for (let i = 0; i < 48; i++) {
        if (i < producto.length) {
          visual += producto[i];
        } else if (i < producto.length + padding.length) {
          visual += '.';
        } else if (i >= cleanLine.length - cantidad.length) {
          visual += cantidad[i - (cleanLine.length - cantidad.length)];
        } else {
          visual += ' ';
        }
      }
      console.log(`  Visualización: "${visual}"`);
    }
    console.log('');
  }
});

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║        SIMULACIÓN DE IMPRESIÓN REAL              ║');
console.log('╚════════════════════════════════════════════════════╝\n');

// Simular cómo se vería realmente impreso (solo texto, sin comandos)
const simulatePrint = (str) => {
  return str
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B[^a-zA-Z]*[a-zA-Z]/g, '')
    .replace(/\r/g, '')
    .replace(/\x00/g, '')
    .trim();
};

// Mostrar con guías de columna
console.log('    0         1         2         3         4');
console.log('    012345678901234567890123456789012345678901234567');
console.log('    ────────────────────────────────────────────────');

lines.forEach((line, idx) => {
  const clean = simulatePrint(line);
  if (clean.length > 0) {
    // Mostrar con bordes y guías
    const display = clean.padEnd(48).substring(0, 48);
    const lineNum = String(idx).padStart(3);
    
    // Mostrar con indicador de columna cada 10
    let guide = '    ';
    for (let i = 0; i < 48; i++) {
      if (i % 10 === 0 && i > 0) {
        guide += '|';
      } else {
        guide += ' ';
      }
    }
    
    console.log(`${lineNum}: │${display}│`);
    
    // Mostrar guía cada 5 líneas
    if ((idx + 1) % 5 === 0) {
      console.log('    ────────────────────────────────────────────────');
    }
  }
});

console.log('    ────────────────────────────────────────────────');
console.log('    0         1         2         3         4');
console.log('    012345678901234567890123456789012345678901234567\n');

// Mostrar tabla de items con análisis detallado
console.log('╔════════════════════════════════════════════════════╗');
console.log('║        TABLA DE ITEMS - ANÁLISIS                  ║');
console.log('╚════════════════════════════════════════════════════╝\n');

const items = orderData.items;
items.forEach((item, idx) => {
  const nombre = item.nombre;
  const cantidad = item.cantidad.toString();
  const nombreLen = nombre.length;
  const padding = 37 - nombreLen;
  const cantidadStart = 37;
  const cantidadEnd = 48;
  
  console.log(`Item ${idx + 1}: ${nombre}`);
  console.log(`  Nombre: "${nombre}" (${nombreLen} chars) → columna 0-${nombreLen - 1}`);
  console.log(`  Padding: ${padding} espacios → columna ${nombreLen}-${cantidadStart - 1}`);
  console.log(`  Cantidad: "${cantidad}" (${cantidad.length} chars) → columna ${cantidadEnd - cantidad.length}-${cantidadEnd - 1}`);
  console.log(`  ┌${'─'.repeat(48)}┐`);
  console.log(`  │${nombre.padEnd(37)}${cantidad.padStart(11)}│`);
  console.log(`  └${'─'.repeat(48)}┘`);
  console.log('');
});

console.log('\n✅ Análisis completo. Revisa la alineación arriba.\n');

