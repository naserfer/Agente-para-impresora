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

// Normaliza el texto de modificaciones: comas estándar y separadores reconocidos
function normalizeModificaciones(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  // Reemplazar comas de ancho completo (，) y otros separadores por coma ASCII
  s = s.replace(/\uFF0C/g, ',');   // ， full-width comma
  s = s.replace(/\u3001/g, ',');   // 、 ideographic comma
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, ','); // comillas que a veces se usan mal
  s = s.replace(/[;\u00B7\u2022]/g, ','); // punto y coma, punto medio, viñeta
  s = s.replace(/[\u300C\u300D\uFF62\uFF63]/g, ','); // brackets japoneses 」 etc
  s = s.replace(/\s*,\s*/g, ', '); // normalizar espacio alrededor de comas
  s = s.replace(/\uFF5C/g, '|');   // ｜ full-width pipe -> pipe ASCII (combos)
  return s.replace(/\s+/g, ' ').trim();
}

// Parte el texto de modificaciones por comas y por pipe | (combos: "Item A | Item B")
// Una línea por parte para que no se encimen ni se corten palabras
function splitModificaciones(raw) {
  const normalized = normalizeModificaciones(raw);
  if (!normalized) return [];
  return normalized
    .split(/\s*[|,]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// --- Factura compacta (Epson TM-T20) ---
// node-escpos: size(1,1) manda GS ! 0x11 (= doble ancho/alto en Epson), NO tamaño normal.
// Tamaño normal = size(0, 0). Font A + interlineado moderado = un poco más grande que Font B.
const INVOICE_LINE_CHARS = 40; // Font A ~42 cols en 80mm; margen para alinear precios

function applyInvoiceCompactLayout(printer) {
  printer.font('a').lineSpace(24).size(0, 0);
}

function resetInvoiceLayout(printer) {
  printer.font('a').lineSpace().size(0, 0);
}

function formatInvoiceDetailLine(item, width) {
  const line = `${item.quantity}x ${item.name}`;
  const price = `$${Number(item.subtotal).toFixed(2)}`;
  if (line.length + price.length + 1 <= width) {
    const pad = ' '.repeat(width - line.length - price.length);
    return `${line}${pad}${price}\n`;
  }
  const second = `${' '.repeat(Math.max(0, width - price.length))}${price}\n`;
  return `${line}\n${second}`;
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
        } else if (tipo === 'takeaway' || tipo === 'para llevar' || tipo === 'para_llevar' || tipo === 'retiro') {
          tipoPedido = 'PARA LLEVAR';
        } else if (tipo === 'dine-in' || tipo === 'local' || tipo === 'salon') {
          tipoPedido = 'COMER AQUI';
        } else {
          tipoPedido = tipo.toUpperCase().replace(/_/g, ' ');
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
        
        // Modificaciones por ítem: una línea por modificación (evita que se corten palabras)
        const modificacionesRaw = item.modificaciones || item.personalizaciones || item.notasItem || item.notes;
        const modifList = splitModificaciones(modificacionesRaw);
        if (modifList.length > 0) {
          printer.text(toCP850('   Modif:\n'));
          modifList.forEach((mod) => {
            printer.text(toCP850(`   - ${mod}\n`));
          });
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
   * Ticket mínimo ESC/POS solo para verificar conexión (test desde UI).
   */
  static generateConnectionTest() {
    const device = new VirtualDevice();
    const printer = new escpos.Printer(device);
    const t = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    device.open(() => {
      const esc = Buffer.from([0x1B, 0x74, 0x01]);
      device.write(esc, () => {});
      printer
        .encode('CP850')
        .align('ct')
        .style('B')
        .text(toCP850('PRUEBA OK\n'))
        .style('NORMAL')
        .text(toCP850(`${t}\n`))
        .feed(1)
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

      printer.encode('CP850');
      applyInvoiceCompactLayout(printer);

      printer
        .align('ct')
        .style('B')
        .text(toCP850(`${invoiceData.lomiteriaName || 'LOMITERIA'}\n`))
        .style('NORMAL');

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
        printer.text(toCP850(formatInvoiceDetailLine(item, INVOICE_LINE_CHARS)));
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
        .style('B')
        .text(toCP850(`TOTAL: $${invoiceData.total.toFixed(2)}\n`))
        .style('NORMAL')
        .align('lt');

      if (invoiceData.paymentMethod) {
        printer.text(toCP850(`\nPago: ${invoiceData.paymentMethod}\n`));
      }

      printer
        .feed(1)
        .text(toCP850('================================\n'))  // Usar = en lugar de ━
        .align('ct')
        .text(toCP850('KaruBox\n'))
        .feed(2);
      resetInvoiceLayout(printer);
      printer.feed(1).cut().close();
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

      printer.encode('CP850');
      applyInvoiceCompactLayout(printer);

      printer
        .align('ct')
        .style('B')
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
        .text(toCP850('KaruBox\n'))
        .feed(1);
      resetInvoiceLayout(printer);
      printer.feed(1).cut().close();
    });

    return device.getBuffer();
  }
}

module.exports = TicketGenerator;
