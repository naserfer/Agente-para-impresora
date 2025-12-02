const escpos = require('escpos');
const iconv = require('iconv-lite');

// Función helper para convertir UTF-8 a CP850 (codificación de impresoras térmicas)
function toCP850(str) {
  if (!str) return '';
  try {
    // Convertir UTF-8 a CP850 usando iconv-lite
    // iconv.encode devuelve un Buffer, lo convertimos a string con latin1
    const buffer = iconv.encode(str, 'cp850');
    return buffer.toString('latin1');
  } catch (e) {
    // Si falla, devolver el string original
    console.warn('Error al convertir a CP850:', e);
    return str;
  }
}

// Crear un dispositivo virtual para generar comandos
class VirtualDevice {
  constructor() {
    this.buffer = [];
  }

  open(callback) {
    callback(null);
  }

  write(data, callback) {
    if (Buffer.isBuffer(data)) {
      this.buffer.push(data);
    } else {
      this.buffer.push(Buffer.from(data));
    }
    if (callback) callback(null);
  }

  close(callback) {
    if (callback) callback(null);
  }

  getBuffer() {
    return Buffer.concat(this.buffer);
  }

  clear() {
    this.buffer = [];
  }
}

class TicketGenerator {
  /**
   * Genera comandos ESC/POS para un ticket de cocina
   * @param {Object} orderData - Datos de la orden
   */
  static generateKitchenTicket(orderData) {
    const device = new VirtualDevice();
    const printer = new escpos.Printer(device);

    device.open(() => {
      // Seleccionar tabla de caracteres CP850 (ESC t 1)
      // Esto asegura que la impresora use la codificación correcta
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // ESC t 1 = CP850
      device.write(esc, () => {});
      
      // Encabezado: Solo número de orden GRANDE
      printer
        .encode('CP850')
        .align('ct')
        .size(3, 3)  // Texto MUY grande para el número
        .text(toCP850(`#${orderData.orderId || orderData.numeroPedido || 'N/A'}\n`))
        .size(1, 1)
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('lt')
        .feed(1);

      // Items a cocinar - formato simple y claro
      orderData.items.forEach((item, index) => {
        const cantidad = item.cantidad || item.quantity || 1;
        const nombre = item.nombre || item.name || 'Item';
        
        // Cantidad en grande, nombre normal
        printer
          .size(2, 1)  // Texto grande para cantidad
          .text(toCP850(`${cantidad}x `))
          .size(1, 1)  // Texto normal para nombre
          .text(toCP850(`${nombre}\n`));
        
        // Notas/personalizaciones si las hay (más visibles)
        const notas = item.personalizaciones || item.notasItem || item.notes;
        if (notas) {
          printer
            .text(toCP850(`   ! ${notas}\n`));  // Cambiar ⚠ por ! para evitar problemas
        }
        
        // Separador entre items
        if (index < orderData.items.length - 1) {
          printer.text(toCP850('--------------------------------\n'));  // Usar - en lugar de ━
        }
      });

      // Pie simple
      printer
        .feed(2)
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('ct')
        .size(2, 1)
        .text(toCP850('LISTO\n'))
        .feed(3)
        .cut()
        .close();
    });

    return device.getBuffer();
  }

  /**
   * Genera comandos ESC/POS para una factura/recibo de cliente
   * @param {Object} invoiceData - Datos de la factura
   */
  static generateInvoice(invoiceData) {
    const device = new VirtualDevice();
    const printer = new escpos.Printer(device);

    device.open(() => {
      // Seleccionar tabla de caracteres CP850 (ESC t 1)
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // ESC t 1 = CP850
      device.write(esc, () => {});
      
      printer
        .encode('CP850')
        .align('ct')
        .size(2, 2)
        .text(toCP850(`${invoiceData.lomiteriaName || 'LOMITERIA'}\n`))
        .size(1, 1);

      if (invoiceData.lomiteriaAddress) {
        printer.text(toCP850(`${invoiceData.lomiteriaAddress}\n`));
      }

      if (invoiceData.lomiteriaTaxId) {
        printer.text(toCP850(`CUIT: ${invoiceData.lomiteriaTaxId}\n`));
      }

      printer
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('ct')
        .style('B')  // Bold
        .text(toCP850('FACTURA\n'))
        .style('NORMAL')  // Normal
        .text(toCP850(`N° ${invoiceData.invoiceNumber}\n`))
        .align('lt')
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .style('B')  // Bold
        .text(toCP850('Cliente:\n'))
        .style('NORMAL')  // Normal
        .text(toCP850(`${invoiceData.customerName}\n`));

      if (invoiceData.customerAddress) {
        printer.text(toCP850(`${invoiceData.customerAddress}\n`));
      }

      if (invoiceData.customerTaxId) {
        printer.text(toCP850(`CUIT/DNI: ${invoiceData.customerTaxId}\n`));
      }

      printer
        .text(toCP850(`Fecha: ${invoiceData.createdAt || new Date().toLocaleString('es-AR')}\n`))
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .style('B')  // Bold
        .text(toCP850('DETALLE:\n'))
        .style('NORMAL')  // Normal
        .feed(1);

      invoiceData.items.forEach((item) => {
        const line = `${item.quantity}x ${item.name}`;
        const price = `$${item.subtotal.toFixed(2)}`;
        const padding = ' '.repeat(Math.max(1, 32 - line.length - price.length));
        printer.text(toCP850(`${line}${padding}${price}\n`));
      });

      printer
        .feed(1)
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('rt')
        .text(toCP850(`Subtotal: $${invoiceData.subtotal.toFixed(2)}\n`));

      if (invoiceData.tax > 0) {
        printer.text(toCP850(`IVA: $${invoiceData.tax.toFixed(2)}\n`));
      }

      printer
        .style('B')  // Bold
        .size(2, 1)
        .text(toCP850(`TOTAL: $${invoiceData.total.toFixed(2)}\n`))
        .size(1, 1)
        .style('NORMAL')  // Normal
        .align('lt');

      if (invoiceData.paymentMethod) {
        printer.text(toCP850(`\nPago: ${invoiceData.paymentMethod}\n`));
      }

      printer
        .feed(1)
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('ct')
        .text(toCP850('!Gracias por su compra!\n'))
        .feed(3)
        .cut()
        .close();
    });

    return device.getBuffer();
  }
}

module.exports = TicketGenerator;
