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
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // ESC t 1 = CP850
      device.write(esc, () => {});
      
      // ========================================
      // ENCABEZADO: Nombre del local centrado
      // ========================================
      const lomiteriaName = orderData.lomiteriaName || 'COCINA';
      printer
        .encode('CP850')
        .align('ct')
        .size(2, 2)
        .style('B')
        .text(toCP850(`${lomiteriaName}\n`))
        .style('NORMAL')
        .size(1, 1)
        .text(toCP850('------------------------\n'))
        .feed(1);

      // ========================================
      // NÚMERO DE ORDEN MUY GRANDE
      // ========================================
      printer
        .align('ct')
        .size(3, 3)
        .style('B')
        .text(toCP850(`#${orderData.orderId || orderData.numeroPedido || 'N/A'}\n`))
        .style('NORMAL')
        .size(1, 1)
        .feed(1);

      // ========================================
      // TIPO DE PEDIDO (DESTACADO)
      // ========================================
      let tipoPedido = 'LOCAL';
      if (orderData.orderType || orderData.tipo) {
        const tipo = (orderData.orderType || orderData.tipo || '').toLowerCase();
        if (tipo === 'delivery' || tipo === 'entrega') {
          tipoPedido = 'DELIVERY';
        } else if (tipo === 'takeaway' || tipo === 'para llevar' || tipo === 'retiro') {
          tipoPedido = 'PARA LLEVAR';
        } else if (tipo === 'dine-in' || tipo === 'local' || tipo === 'salon') {
          tipoPedido = 'COMER AQUI';
        } else {
          tipoPedido = tipo.toUpperCase();
        }
      }

      printer
        .align('ct')
        .size(2, 2)
        .style('B')
        .text(toCP850(`[ ${tipoPedido} ]\n`))
        .style('NORMAL')
        .size(1, 1)
        .text(toCP850('------------------------\n'))
        .align('lt')
        .feed(1);

      // ========================================
      // INFORMACIÓN ADICIONAL (Hora, Mesa, Cliente)
      // ========================================
      
      // Formatear hora a HH:MM simple
      const formatearHora = (fecha) => {
        try {
          const date = fecha ? new Date(fecha) : new Date();
          const horas = date.getHours().toString().padStart(2, '0');
          const minutos = date.getMinutes().toString().padStart(2, '0');
          return `${horas}:${minutos}`;
        } catch (e) {
          return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      };

      const hora = formatearHora(orderData.createdAt);
      printer.text(toCP850(`Hora: ${hora}\n`));

      // Mesa o cliente si existe
      if (orderData.tableNumber || orderData.mesa) {
        printer
          .style('B')
          .text(toCP850(`Mesa: ${orderData.tableNumber || orderData.mesa}\n`))
          .style('NORMAL');
      }

      if (orderData.customerName || orderData.cliente?.nombre) {
        const cliente = orderData.customerName || orderData.cliente?.nombre;
        printer.text(toCP850(`Cliente: ${cliente}\n`));
      }

      printer
        .text(toCP850('------------------------\n'))
        .feed(1);

      // ========================================
      // ITEMS - FORMATO TABLA PROFESIONAL
      // Cantidad a la izquierda, Producto a la derecha
      // Todo con mismo tamaño de letra y negrita oscura
      // ========================================
      
      const items = orderData.items || [];

      items.forEach((item) => {
        const cantidad = (item.cantidad || item.quantity || 1);
        const nombre = item.nombre || item.name || 'Item';
        
        // NO truncar - dejar que el texto fluya naturalmente a la siguiente línea
        // Formato: "2x Producto" - todo en negrita oscura
        printer
          .size(1, 1)  // Tamaño normal uniforme
          .style('B')  // TODO en negrita (cantidad y producto)
          .text(toCP850(`${cantidad}x ${nombre}\n`))
          .style('NORMAL');  // Volver a normal después
        
        // Notas/personalizaciones (indentadas, sin negrita)
        const notas = item.personalizaciones || item.notasItem || item.notes;
        if (notas) {
          printer
            .text(toCP850(`   ${notas}\n`));
        }
      });

      printer
        .text(toCP850('========================\n'))
        .feed(1);

      // ========================================
      // NOTAS GENERALES DEL PEDIDO
      // ========================================
      if (orderData.orderNotes || orderData.notas) {
        printer
          .style('B')
          .text(toCP850('NOTAS:\n'))
          .style('NORMAL')
          .text(toCP850(`${orderData.orderNotes || orderData.notas}\n`))
          .feed(1);
      }

      // Cortar papel (mínimo espacio)
      printer
        .feed(2)
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
