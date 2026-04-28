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
