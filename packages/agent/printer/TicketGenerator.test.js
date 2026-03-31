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
