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

/** Corta por espacios para que la impresora no parta palabras a mitad de línea. */
function wrapWords(text, maxChars) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return [];
  const w = Math.max(8, Number(maxChars) || 40);
  const words = s.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= w) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      if (word.length > w) {
        let rest = word;
        while (rest.length > w) {
          lines.push(rest.slice(0, w));
          rest = rest.slice(w);
        }
        line = rest;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Primera línea "Nx nombre"; siguientes líneas alineadas bajo el nombre (indent fijo). */
function wrapQuantityNameLine(cantidad, nombre, maxChars) {
  const head = `${cantidad}x `;
  const name = String(nombre || '').trim() || 'Item';
  const firstMax = Math.max(4, maxChars - head.length);
  const nameLines = wrapWords(name, firstMax);
  if (nameLines.length === 0) return [`${head}${name}`];
  const indent = ' '.repeat(head.length);
  const out = [`${head}${nameLines[0]}`];
  for (let i = 1; i < nameLines.length; i += 1) {
    out.push(`${indent}${nameLines[i]}`);
  }
  return out;
}

/** Línea ítem factura PY: "N  nombre" con continuación indentada (sin cortar palabras). */
function wrapCantSpaceNombreLine(cant, nombre, maxChars) {
  const head = `${cant}  `;
  const name = String(nombre || '').trim() || 'Producto';
  const firstMax = Math.max(4, maxChars - head.length);
  const nameLines = wrapWords(name, firstMax);
  if (nameLines.length === 0) return [`${head}${name}`];
  const indent = ' '.repeat(head.length);
  const out = [`${head}${nameLines[0]}`];
  for (let i = 1; i < nameLines.length; i += 1) {
    out.push(`${indent}${nameLines[i]}`);
  }
  return out;
}

/** Separador ~80 mm: Font A normal ≈48 cols; con doble ancho ESC/POS (p. ej. size 1,0) ≈24 cols. */
function kitchenSepFull(char, doubleWidthMode) {
  const c = String(char || '-').charAt(0);
  const cols = doubleWidthMode ? 24 : 48;
  return `${c.repeat(cols)}\n`;
}

/** Extrae montos tipo (+1,00) o (+1.00) y los muestra como unidades enteras (+1). */
function formatModifExtraAmounts(str) {
  return String(str == null ? '' : str).replace(
    /\(\s*([+-]?\d+)[,.](\d+)\s*\)/g,
    (match, intPart, decPart) => {
      const num = parseFloat(`${intPart}.${decPart}`);
      if (Number.isNaN(num)) return match;
      const n = Math.round(num);
      if (n < 0) return `(-${Math.abs(n)})`;
      return `(+${n})`;
    }
  );
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
    // Cuerpo: size(1,0) = doble ancho, alto normal → mucha menos altura que (1,1), ~20 cols en 80 mm
    const BODY_W = 1;
    const BODY_H = 0;
    const WRAP_ITEM = 24;
    const WRAP_MODIF = 24;
    const WRAP_NOTES = 24;
    const MOD_LABEL = '   Modif:\n';
    const MOD_BULLET = '   - ';
    const MOD_CONT = '     ';
    /** true = mismo modo que BODY (1,0), ~24 caracteres = ancho útil 80 mm */
    const sepBody = (ch) => kitchenSepFull(ch, true);
    /** Interlineado algo más apretado en el cuerpo (menos papel); se restaura antes del corte */
    const LINE_SPACE_TIGHT = 22;

    device.open(() => {
      // Seleccionar tabla de caracteres CP850 (ESC t 1)
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // ESC t 1 = CP850
      device.write(esc, () => {});
      
      // ========================================
      // ENCABEZADO: Nombre del local centrado (compacto)
      // ========================================
      const lomiteriaName = orderData.lomiteriaName || 'COCINA';
      printer
        .encode('CP850')
        .font('a')
        .align('ct')
        .size(2, 2)
        .style('B')
        .text(toCP850(`${lomiteriaName}\n`))
        .style('NORMAL')
        .size(0, 0)
        .text(toCP850(kitchenSepFull('=', false)));

      // ========================================
      // NÚMERO DE ORDEN (2,2 en lugar de 3,3 = menos altura, sigue muy visible)
      // ========================================
      printer
        .align('ct')
        .size(2, 2)
        .style('B')
        .text(toCP850(`#${orderData.orderId || orderData.numeroPedido || 'N/A'}\n`))
        .style('NORMAL')
        .size(0, 0);

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
        .font('a')
        .lineSpace(LINE_SPACE_TIGHT)
        .size(BODY_W, BODY_H)
        .text(toCP850(sepBody('-')))
        .align('lt');

      // ========================================
      // INFORMACIÓN ADICIONAL (Hora, Mesa, Cliente) — mismo tamaño grande
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
      // Una sola línea por dato (sin alternar B/N) + columna fija tras la etiqueta para alinear
      const INFO_LAB = 10;
      const infoRow = (label, value) => `${String(label).padEnd(INFO_LAB)}${String(value)}\n`;

      printer
        .font('a')
        .size(BODY_W, BODY_H)
        .style('B')
        .text(toCP850(infoRow('Hora:', hora)));

      if (orderData.tableNumber || orderData.mesa) {
        printer.text(toCP850(infoRow('Mesa:', orderData.tableNumber || orderData.mesa)));
      }

      if (orderData.customerName || orderData.cliente?.nombre) {
        const cliente = orderData.customerName || orderData.cliente?.nombre;
        printer.text(toCP850(infoRow('Cliente:', cliente)));
      }

      printer
        .style('NORMAL')
        .align('ct')
        .text(toCP850(sepBody('-')))
        .align('lt');

      // ========================================
      // ITEMS — doble tamaño; saltos de línea por palabra
      // ========================================
      
      const items = orderData.items || [];

      items.forEach((item) => {
        const cantidad = (item.cantidad || item.quantity || 1);
        const nombre = item.nombre || item.name || 'Item';

        printer.font('a').size(BODY_W, BODY_H).style('B');
        const itemLines = wrapQuantityNameLine(cantidad, nombre, WRAP_ITEM);
        itemLines.forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
        printer.style('NORMAL');

        // Modificaciones: mismo tamaño grande (font A), cortes solo entre palabras
        const modificacionesRaw = item.modificaciones || item.personalizaciones || item.notasItem || item.notes;
        const modifList = splitModificaciones(modificacionesRaw);
        if (modifList.length > 0) {
          printer.font('a').size(BODY_W, BODY_H).text(toCP850(MOD_LABEL));
          const innerW = WRAP_MODIF - MOD_BULLET.length;
          modifList.forEach((mod) => {
            const wrapped = wrapWords(formatModifExtraAmounts(mod), innerW);
            wrapped.forEach((part, idx) => {
              const prefix = idx === 0 ? MOD_BULLET : MOD_CONT;
              printer.text(toCP850(`${prefix}${part}\n`));
            });
          });
        }
      });

      printer
        .font('a')
        .align('ct')
        .size(BODY_W, BODY_H)
        .text(toCP850(sepBody('=')))
        .align('lt');

      // ========================================
      // NOTAS GENERALES DEL PEDIDO
      // ========================================
      if (orderData.orderNotes || orderData.notas) {
        const notasRaw = String(orderData.orderNotes || orderData.notas || '');
        printer
          .font('a')
          .size(BODY_W, BODY_H)
          .style('B')
          .text(toCP850('NOTAS\n'))
          .style('NORMAL');
        wrapWords(notasRaw, WRAP_NOTES).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }

      // Pie: marca más visible que el texto normal; interlineado estándar antes del corte
      printer
        .align('ct')
        .font('a')
        .lineSpace()
        .size(1, 1)
        .style('B')
        .text(toCP850('KaruBox.com.py\n'))
        .style('NORMAL')
        .align('lt')
        .feed(1)
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
   * @param {Object} factura - Fila de vista_factura_impresion (puede incluir `numero_pedido` para referencia interna)
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
    const PY_COLS = 48;
    const numeroPedido =
      factura.numero_pedido != null && String(factura.numero_pedido).trim() !== ''
        ? String(factura.numero_pedido).trim()
        : null;

    device.open(() => {
      const esc = Buffer.from([0x1B, 0x74, 0x01]); // CP850
      device.write(esc, () => {});

      const emitSep = (ch) => {
        printer.align('ct').text(toCP850(kitchenSepFull(ch, false))).align('lt');
      };

      printer.encode('CP850');
      applyInvoiceCompactLayout(printer);

      printer
        .align('ct')
        .font('a')
        .size(1, 1)
        .style('B')
        .text(toCP850(`${factura.emisor_razon_social || 'LOMITERIA'}\n`))
        .style('NORMAL')
        .size(0, 0);

      if (factura.emisor_direccion) {
        wrapWords(String(factura.emisor_direccion), PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }
      if (factura.emisor_telefono) {
        wrapWords(`Tel: ${factura.emisor_telefono}`, PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }
      if (factura.emisor_ruc) {
        wrapWords(`RUC: ${factura.emisor_ruc}`, PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }

      emitSep('=');
      wrapWords(`TIMBRADO Nº ${timbrado}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      wrapWords(`Vigencia: ${vigInicio} al ${vigFin}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      wrapWords(`Factura Nro: ${numeroFactura}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      wrapWords(`Fecha: ${fechaEmision}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      if (numeroPedido) {
        wrapWords(`Pedido Nº: ${numeroPedido}`, PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }
      wrapWords('Condición de Venta: Contado', PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      emitSep('-');

      const docIdent = factura.receptor_ruc || factura.receptor_ci || '';
      const nombreCli = factura.receptor_nombre || 'Consumidor final';
      printer
        .style('B')
        .text(toCP850('Cliente:\n'))
        .style('NORMAL');
      wrapWords(`RUC/CI: ${docIdent}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      wrapWords(`Nombre: ${nombreCli}`, PY_COLS).forEach((ln) => {
        printer.text(toCP850(`${ln}\n`));
      });
      if (factura.receptor_direccion) {
        wrapWords(`Dirección: ${factura.receptor_direccion}`, PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }
      emitSep('-');

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

        const itemHead = `${cant}  `;
        const sangriaPrecio = ' '.repeat(itemHead.length);
        wrapCantSpaceNombreLine(cant, nombre, PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
        const precioStr = subtotal.toLocaleString('es-PY');
        const precioDetalle = `${precio.toLocaleString('es-PY')}   ${precioStr}   (${ivaPorc})`;
        const innerPrecio = Math.max(8, PY_COLS - itemHead.length);
        wrapWords(precioDetalle, innerPrecio).forEach((part) => {
          printer.text(toCP850(`${sangriaPrecio}${part}\n`));
        });
      });

      emitSep('=');

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
        printer.feed(1).text(toCP850('En letras:\n'));
        wrapWords(String(totalLetras), PY_COLS).forEach((ln) => {
          printer.text(toCP850(`${ln}\n`));
        });
      }

      printer
        .feed(2)
        .align('ct')
        .font('a')
        .lineSpace()
        .size(1, 0)
        .style('B')
        .text(toCP850('KaruBox.com.py\n'))
        .style('NORMAL')
        .align('lt');
      resetInvoiceLayout(printer);
      printer.feed(1).cut().close();
    });

    return device.getBuffer();
  }
}

module.exports = TicketGenerator;
