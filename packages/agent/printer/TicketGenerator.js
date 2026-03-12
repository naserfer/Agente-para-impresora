const escpos = require('escpos');
const iconv = require('iconv-lite');

// Eliminar acentos para evitar caracteres raros en impresoras
function stripAccents(str) {
  if (!str) return '';
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return str;
  }
}

// Función helper para convertir UTF-8 a CP850 (codificación de impresoras térmicas)
function toCP850(str) {
  if (str == null) return '';
  const plain = stripAccents(String(str));
  try {
    const buffer = iconv.encode(plain, 'cp850');
    return buffer.toString('latin1');
  } catch (e) {
    console.warn('Error al convertir a CP850:', e);
    return plain;
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
        
        // Modificaciones por ítem (extras, sin X, etc.): siempre visibles con prefijo "Modif:"
        const modificaciones = item.modificaciones || item.personalizaciones || item.notasItem || item.notes;
        if (modificaciones && String(modificaciones).trim()) {
          printer
            .text(toCP850(`   Modif: ${String(modificaciones).trim()}\n`));
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

  /**
   * Genera comandos ESC/POS para una factura paraguaya (80mm) usando vista_factura_impresion.
   * @param {Object} factura - Fila de vista_factura_impresion
   */
  static generateParaguayInvoice(factura) {
    const device = new VirtualDevice();
    const printer = new escpos.Printer(device);

    const items = Array.isArray(factura.detalle) ? factura.detalle : [];

    const formatearFechaHora = (fecha) => {
      try {
        const d = fecha ? new Date(fecha) : new Date();
        const dia = d.getDate().toString().padStart(2, '0');
        const mes = (d.getMonth() + 1).toString().padStart(2, '0');
        const anio = d.getFullYear();
        const horas = d.getHours().toString().padStart(2, '0');
        const minutos = d.getMinutes().toString().padStart(2, '0');
        return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
      } catch {
        return new Date().toLocaleString('es-PY');
      }
    };

    const numeroFactura = factura.numero_factura || '';
    const timbrado = factura.timbrado || '';
    const vigInicio = formatearFechaHora(factura.timbrado_vigencia_inicio).split(' ')[0];
    const vigFin = formatearFechaHora(factura.timbrado_vigencia_fin).split(' ')[0];
    const fechaEmision = formatearFechaHora(factura.fecha_emision);

    const totalIva10 = Number(factura.total_iva_10 || 0);
    const totalIva5 = Number(factura.total_iva_5 || 0);
    const totalExento = Number(factura.total_exento || 0);
    const totalAPagar = Number(factura.total_a_pagar || 0);
    const totalIva = totalIva10 + totalIva5;
    const totalLetras = factura.total_letras || '';

    device.open(() => {
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // CP850
      device.write(esc, () => {});

      // Usar siempre tamaño mínimo (1,1) para ahorrar papel
      printer
        .encode('CP850')
        .align('ct')
        .style('B')
        .size(1, 1)
        .text(toCP850(`${factura.emisor_razon_social || 'LOMITERIA'}\n`))
        .style('NORMAL');

      if (factura.emisor_direccion) {
        printer.text(toCP850(`${factura.emisor_direccion}\n`));
      }
      if (factura.emisor_telefono) {
        printer.text(toCP850(`Tel: ${factura.emisor_telefono}\n`));
      }
      if (factura.emisor_ruc) {
        printer.text(toCP850(`RUC: ${factura.emisor_ruc}\n`));
      }

      printer
        .text(toCP850('-------------------------------\n'))
        .align('lt')
        .text(toCP850(`TIMBRADO Nº ${timbrado}\n`))
        .text(toCP850(`Vigencia: ${vigInicio} al ${vigFin}\n`))
        .text(toCP850(`Factura Nro: ${numeroFactura}\n`))
        .text(toCP850(`Fecha: ${fechaEmision}\n`))
        .text(toCP850('Condición de Venta: Contado\n'))
        .text(toCP850('-------------------------------\n'));

      const docIdent = factura.receptor_ruc || factura.receptor_ci || '';
      const nombreCli = factura.receptor_nombre || 'Consumidor final';
      printer
        .style('B')
        .text(toCP850('Cliente:\n'))
        .style('NORMAL')
        .text(toCP850(`RUC/CI: ${docIdent}\n`))
        .text(toCP850(`Nombre: ${nombreCli}\n`));
      if (factura.receptor_direccion) {
        printer.text(toCP850(`Dirección: ${factura.receptor_direccion}\n`));
      }
      printer.text(toCP850('-------------------------------\n'));

      // Detalle de items
      printer
        .style('B')
        .text(toCP850('Cant  Descripción\n'))
        .style('NORMAL');

      items.forEach((it) => {
        const cant = Number(it.cantidad || 1);
        const nombre = it.producto_nombre || 'Producto';
        const precio = Number(it.precio_unitario || 0);
        const subtotal = Number(it.subtotal || 0);
        const ivaPorc = it.iva_porcentaje != null ? `${it.iva_porcentaje}%` : '';

        printer.text(toCP850(`${cant}  ${nombre}\n`));
        const precioStr = subtotal.toLocaleString('es-PY');
        const linea2 = `    ${precio.toLocaleString('es-PY')}   ${precioStr}   (${ivaPorc})`;
        printer.text(toCP850(`${linea2}\n`));
      });

      printer.text(toCP850('-------------------------------\n'));

      // Totales
      printer
        .align('rt')
        .text(toCP850(`Exentas: Gs. ${totalExento.toLocaleString('es-PY')}\n`))
        .text(toCP850(`IVA 5% : Gs. ${totalIva5.toLocaleString('es-PY')}\n`))
        .text(toCP850(`IVA 10%: Gs. ${totalIva10.toLocaleString('es-PY')}\n`))
        .text(toCP850(`Total IVA: Gs. ${totalIva.toLocaleString('es-PY')}\n`))
        .style('B')
        .text(toCP850(`TOTAL A PAGAR: Gs. ${totalAPagar.toLocaleString('es-PY')}\n`))
        .style('NORMAL')
        .align('lt');

      if (totalLetras) {
        printer
          .text(toCP850('\nEn letras:\n'))
          .text(toCP850(`${totalLetras}\n`));
      }

      printer
        .feed(1)
        .align('ct')
        .text(toCP850('Software: Agente de Impresión\n'))
        .text(toCP850('Gracias por su preferencia\n'))
        .feed(2)
        .cut()
        .close();
    });

    return device.getBuffer();
  }
}

module.exports = TicketGenerator;
