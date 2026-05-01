const test = require('node:test');
const assert = require('node:assert/strict');

const TicketGenerator = require('./TicketGenerator');

test('generateCustomerWelcomeTicket builds ticket for registered customer', () => {
  const buffer = TicketGenerator.generateCustomerWelcomeTicket({
    brandName: 'Atlas Burguer',
    orderId: '643',
    customerName: 'Juan Perez',
    isRegisteredCustomer: true,
    customerPointsTotal: 1200,
    pointsGeneratedInSale: 250
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
});

test('generateCustomerWelcomeTicket builds ticket for guest customer', () => {
  const buffer = TicketGenerator.generateCustomerWelcomeTicket({
    brandName: 'Atlas Burguer',
    orderId: '644',
    isRegisteredCustomer: false
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
});

test('generateKitchenTicket prints "Mesa #X" when table number exists', () => {
  const buffer = TicketGenerator.generateKitchenTicket({
    orderId: '701',
    createdAt: '2026-04-27T23:00:00.000Z',
    tableNumber: '7',
    items: [{ name: 'Lomo', quantity: 1 }]
  });

  const ticketText = buffer.toString('latin1');
  assert.ok(ticketText.includes('Mesa #7'));
});

test('generateKitchenTicket omits mesa line when table number is missing', () => {
  const buffer = TicketGenerator.generateKitchenTicket({
    orderId: '702',
    createdAt: '2026-04-27T23:00:00.000Z',
    items: [{ name: 'Lomo', quantity: 1 }]
  });

  const ticketText = buffer.toString('latin1');
  assert.equal(ticketText.includes('Mesa #'), false);
});

test('generateKitchenTicket prints both modificaciones and notas_item when different', () => {
  const buffer = TicketGenerator.generateKitchenTicket({
    orderId: '703',
    createdAt: '2026-04-27T23:00:00.000Z',
    items: [{
      name: 'Arroz blanco c/curry - 71',
      quantity: 1,
      modificaciones: 'Sin peregil',
      notasItem: 'Sin cebolla'
    }]
  });

  const ticketText = buffer.toString('latin1').toLowerCase();
  assert.ok(ticketText.includes('sin peregil'));
  assert.ok(ticketText.includes('sin cebolla'));
});

test('generateKitchenTicket dedupes repeated text between modificaciones and notas_item', () => {
  const buffer = TicketGenerator.generateKitchenTicket({
    orderId: '704',
    createdAt: '2026-04-27T23:00:00.000Z',
    items: [{
      name: 'Arroz blanco c/curry - 71',
      quantity: 1,
      modificaciones: '  Sín   peregil ',
      notasItem: 'sin peregil'
    }]
  });

  const ticketText = buffer.toString('latin1').toLowerCase();
  const matches = ticketText.match(/sin peregil/g) || [];
  assert.equal(matches.length, 1);
});

test('generateKitchenTicket wraps restaurant name by words to avoid mid-word splits', () => {
  const buffer = TicketGenerator.generateKitchenTicket({
    lomiteriaName: 'Restaurante oriental 8',
    orderId: '900',
    createdAt: '2026-04-30T05:00:00.000Z',
    items: [{ name: 'Lomo', quantity: 1 }]
  });

  const ticketText = buffer.toString('latin1');
  assert.ok(ticketText.includes('Restaurante'));
  assert.ok(ticketText.includes('oriental 8'));
  assert.equal(ticketText.includes('orie\nntal'), false);
});

test('generateParaguayInvoice omits fiscal labels and QR footer in non-fiscal mode', () => {
  const buffer = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    numero_factura: '001-001-0000001',
    timbrado: '12345678',
    timbrado_vigencia_inicio: '2026-01-01',
    timbrado_vigencia_fin: '2026-12-31',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '900',
    total_a_pagar: 25000,
    detalle: [{ cantidad: 1, producto_nombre: 'Lomo arabe', precio_unitario: 25000, subtotal: 25000, iva_porcentaje: 10 }],
    mesa_numero: null,
    saludo_final: 'Gracias Restaurante Oriental 8'
  });

  const ticketText = buffer.toString('latin1').toLowerCase();
  assert.equal(ticketText.includes('timbrado'), false);
  assert.equal(ticketText.includes('vigencia'), false);
  assert.equal(ticketText.includes('factura nro'), false);
  assert.equal(ticketText.includes('condici'), false);
  assert.equal(ticketText.includes('karubox.com.py'), false);
  assert.equal(ticketText.includes('exentas'), false);
  assert.equal(ticketText.includes('iva 5%'), false);
  assert.equal(ticketText.includes('iva 10%'), false);
  assert.equal(ticketText.includes('total iva'), false);
});

test('generateParaguayInvoice prints large mesa header only when mesa_numero exists', () => {
  const withMesa = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '901',
    total_a_pagar: 18000,
    detalle: [{ cantidad: 1, producto_nombre: 'Yakimeshi', precio_unitario: 18000, subtotal: 18000, iva_porcentaje: 10 }],
    mesa_numero: '12',
    saludo_final: 'Gracias Restaurante Oriental 8'
  }).toString('latin1');

  const withoutMesa = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '902',
    total_a_pagar: 18000,
    detalle: [{ cantidad: 1, producto_nombre: 'Yakimeshi', precio_unitario: 18000, subtotal: 18000, iva_porcentaje: 10 }],
    mesa_numero: null,
    saludo_final: 'Gracias Restaurante Oriental 8'
  }).toString('latin1');

  assert.ok(withMesa.includes('Mesa #12'));
  assert.equal(withoutMesa.includes('Mesa #'), false);
});

test('generateParaguayInvoice prints saludo_final with fallback text', () => {
  const withCustomGreeting = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '903',
    total_a_pagar: 18000,
    detalle: [{ cantidad: 1, producto_nombre: 'Yakimeshi', precio_unitario: 18000, subtotal: 18000, iva_porcentaje: 10 }],
    saludo_final: 'Volve pronto!'
  }).toString('latin1');

  const withFallbackGreeting = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '904',
    total_a_pagar: 18000,
    detalle: [{ cantidad: 1, producto_nombre: 'Yakimeshi', precio_unitario: 18000, subtotal: 18000, iva_porcentaje: 10 }],
    saludo_final: ''
  }).toString('latin1');

  assert.ok(withCustomGreeting.includes('Volve pronto!'));
  assert.ok(withFallbackGreeting.includes('Gracias por tu compra!'));
});

test('generateParaguayInvoice renders Chinese saludo_final as raster image', () => {
  const withChineseGreeting = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '905',
    total_a_pagar: 18000,
    detalle: [{ cantidad: 1, producto_nombre: 'Yakimeshi', precio_unitario: 18000, subtotal: 18000, iva_porcentaje: 10 }],
    saludo_final: '谢谢光临'
  });

  const rasterPrefix = Buffer.from([0x1d, 0x76, 0x30]);
  assert.ok(withChineseGreeting.includes(rasterPrefix));
  assert.equal(withChineseGreeting.toString('latin1').includes('Gracias por tu compra!'), false);
});

test('generateParaguayInvoice item detail omits duplicated amounts and IVA percentage', () => {
  const ticket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '906',
    total_a_pagar: 99999,
    detalle: [{ cantidad: 1, producto_nombre: 'Arroz blanco c/curry', precio_unitario: 40000, subtotal: 40000, iva_porcentaje: 10 }],
    saludo_final: 'Gracias'
  }).toString('latin1');

  assert.equal(ticket.includes('40.000 40.000'), false);
  assert.equal(ticket.includes('(10%)'), false);
});

test('generateParaguayInvoice prints total in two fixed lines to avoid printer wrapping', () => {
  const ticket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-29T01:00:00.000Z',
    numero_pedido: '907',
    total_a_pagar: 95000,
    detalle: [{ cantidad: 1, producto_nombre: 'Arroz', precio_unitario: 95000, subtotal: 95000 }],
    saludo_final: 'Gracias'
  }).toString('latin1');

  assert.ok(ticket.includes('TOTAL A PAGAR'));
  assert.ok(ticket.includes('Gs. 95.000'));
  assert.equal(ticket.includes('TOTAL A PAGAR: Gs.'), false);
});

test('generateParaguayInvoice prints payment method for efectivo and tarjeta', () => {
  const efectivoTicket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-30T01:00:00.000Z',
    numero_pedido: '908',
    total_a_pagar: 20000,
    metodo_cobro: 'efectivo',
    detalle: [{ cantidad: 1, producto_nombre: 'Arroz', precio_unitario: 20000, subtotal: 20000 }]
  }).toString('latin1');

  const tarjetaTicket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-30T01:00:00.000Z',
    numero_pedido: '909',
    total_a_pagar: 20000,
    metodo_cobro: 'tarjeta',
    detalle: [{ cantidad: 1, producto_nombre: 'Arroz', precio_unitario: 20000, subtotal: 20000 }]
  }).toString('latin1');

  assert.ok(efectivoTicket.includes('Cobro: Efectivo'));
  assert.ok(tarjetaTicket.includes('Cobro: Tarjeta'));
});

test('generateParaguayInvoice moves extra note below product without Extra/Nota labels', () => {
  const ticket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-30T01:00:00.000Z',
    numero_pedido: '910',
    total_a_pagar: 15000,
    detalle: [{
      cantidad: 1,
      producto_nombre: 'Arroz blanco (Extra: Nota: extra panceta Gs. 5.000)',
      precio_unitario: 15000,
      subtotal: 15000
    }]
  }).toString('latin1');

  const normalized = ticket.toLowerCase();
  assert.ok(normalized.includes('arroz blanco'));
  assert.ok(normalized.includes('panceta gs. 5.000'));
  assert.equal(normalized.includes('extra: nota:'), false);
});

test('generateParaguayInvoice prints base price first and extra price below', () => {
  const ticket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-30T01:00:00.000Z',
    numero_pedido: '911',
    total_a_pagar: 15000,
    detalle: [{
      cantidad: 1,
      producto_nombre: 'Arroz blanco (Extra: panceta Gs. 5.000)',
      precio_unitario: 15000,
      subtotal: 15000
    }]
  }).toString('latin1');

  assert.ok(ticket.includes('Arroz blanco'));
  assert.ok(ticket.includes('Gs. 15.000'));
  assert.ok(ticket.includes('+ panceta Gs. 5.000'));
  assert.equal(ticket.includes('Plato:'), false);
  assert.equal(ticket.includes('Total ítem:'), false);
});

test('generateParaguayInvoice normalizes extra amount with dot thousands separator', () => {
  const ticket = TicketGenerator.generateParaguayInvoice({
    emisor_razon_social: 'Restaurante Oriental 8',
    fecha_emision: '2026-04-30T01:00:00.000Z',
    numero_pedido: '912',
    total_a_pagar: 15000,
    detalle: [{
      cantidad: 1,
      producto_nombre: 'Arroz blanco (Extra: panceta Gs. 5,000)',
      precio_unitario: 15000,
      subtotal: 15000
    }]
  }).toString('latin1');

  assert.ok(ticket.includes('+ panceta Gs. 5.000'));
  assert.equal(ticket.includes('Gs. 5,000'), false);
});
