# 📋 Instrucciones para Integrar el Agente de Impresión

## Para la IA del Sistema Next.js

### Contexto
Tenemos un **agente de impresión local** (Node.js/Express) que corre en la PC del local donde está la impresora Epson TM-T20. Este agente recibe órdenes de impresión desde la app web Next.js y las envía a la impresora física.

### Arquitectura
- **Agente**: Servicio Node.js corriendo en `http://[IP_PC]:3001`
- **Endpoint principal**: `POST http://[IP_PC]:3001/print`
- **Base de datos**: Tabla `printer_config` en Supabase conecta cada lomitería con su impresora

### Flujo de Impresión

1. **Usuario confirma pedido** → Guardar pedido en Supabase (tabla `pedidos`)
2. **Consultar configuración de impresora**:
   ```sql
   SELECT * FROM printer_config 
   WHERE lomiteria_id = [lomiteriaId del usuario]
   ```
3. **Si existe configuración** → Enviar orden al agente
4. **Si no existe o falla** → El pedido se guarda igual (sin imprimir)

### Endpoint del Agente

**URL**: `POST http://[agent_ip]:[agent_port]/print`

**Body**:
```json
{
  "printerId": "atlas-burger-printer-1",  // Del campo printer_id de printer_config
  "tipo": "cocina",  // o "factura"
  "data": {
    "numeroPedido": 42,
    "tipoPedido": "local",  // "local", "delivery", "para_llevar"
    "lomiteriaNombre": "Atlas Burger",
    "items": [
      {
        "nombre": "Smash Bacon",
        "cantidad": 1,
        "personalizaciones": "sin cebolla"  // opcional
      }
    ],
    "total": 23000,
    "fecha": "2025-11-30T05:00:00Z",
    "cliente": {  // opcional, solo si aplica
      "nombre": "Juan Pérez"
    }
  }
}
```

### Implementación en Next.js

#### 1. Función para Imprimir Ticket de Cocina

```javascript
// utils/printAgent.js o similar

export async function imprimirTicketCocina(pedidoData, lomiteriaId) {
  try {
    // 1. Consultar configuración de impresora
    const { data: printerConfig, error: configError } = await supabase
      .from('printer_config')
      .select('*')
      .eq('lomiteria_id', lomiteriaId)
      .eq('activo', true)
      .single();

    // Si no hay configuración, no imprimir (pero el pedido ya está guardado)
    if (configError || !printerConfig) {
      console.warn('No hay impresora configurada para esta lomitería');
      return { success: false, message: 'Impresora no configurada' };
    }

    // 2. Preparar datos para el agente
    const printData = {
      printerId: printerConfig.printer_id,
      tipo: 'cocina',
      data: {
        numeroPedido: pedidoData.numero_pedido,
        tipoPedido: pedidoData.tipo,  // "local", "delivery", "para_llevar"
        lomiteriaNombre: pedidoData.lomiteria?.nombre || 'Lomitería',
        items: pedidoData.items.map(item => ({
          nombre: item.producto_nombre,
          cantidad: item.cantidad,
          personalizaciones: item.notas || null
        })),
        total: pedidoData.total,
        fecha: pedidoData.created_at || new Date().toISOString(),
        cliente: pedidoData.cliente ? {
          nombre: pedidoData.cliente.nombre
        } : null
      }
    };

    // 3. Enviar al agente
    const agentUrl = `http://${printerConfig.agent_ip}:${printerConfig.agent_port}/print`;
    
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(printData),
      // Timeout aumentado a 15 segundos (la impresión puede tardar en Windows)
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al imprimir');
    }

    return { success: true, message: 'Ticket enviado a la impresora' };

  } catch (error) {
    // IMPORTANTE: No lanzar error, solo loguear
    // El pedido ya está guardado, la impresión es opcional
    console.error('Error al imprimir ticket:', error);
    return { 
      success: false, 
      message: error.message || 'Error al conectar con la impresora' 
    };
  }
}
```

#### 2. Función para Imprimir Factura

```javascript
export async function imprimirFactura(facturaData, lomiteriaId) {
  try {
    // 1. Consultar configuración (igual que arriba)
    const { data: printerConfig } = await supabase
      .from('printer_config')
      .select('*')
      .eq('lomiteria_id', lomiteriaId)
      .eq('activo', true)
      .single();

    if (!printerConfig) {
      return { success: false, message: 'Impresora no configurada' };
    }

    // 2. Preparar datos
    const printData = {
      printerId: printerConfig.printer_id,
      tipo: 'factura',
      data: {
        numeroFactura: facturaData.numero_factura,
        cliente: {
          nombre: facturaData.cliente.nombre,
          direccion: facturaData.cliente.direccion,
          ci: facturaData.cliente.ci
        },
        items: facturaData.items.map(item => ({
          nombre: item.producto_nombre,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          subtotal: item.subtotal
        })),
        subtotal: facturaData.subtotal,
        impuestos: facturaData.impuestos,
        total: facturaData.total,
        metodoPago: facturaData.metodo_pago,
        fecha: facturaData.created_at || new Date().toISOString(),
        lomiteriaName: facturaData.lomiteria?.nombre,
        lomiteriaAddress: facturaData.lomiteria?.direccion,
        lomiteriaTaxId: facturaData.lomiteria?.cuit
      }
    };

    // 3. Enviar al agente
    const agentUrl = `http://${printerConfig.agent_ip}:${printerConfig.agent_port}/print`;
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printData),
      // Timeout aumentado a 15 segundos
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error('Error al imprimir');
    }

    return { success: true };

  } catch (error) {
    console.error('Error al imprimir factura:', error);
    return { success: false, message: error.message };
  }
}
```

#### 3. Uso al Confirmar Pedido

```javascript
// En tu componente o función que confirma el pedido

async function confirmarPedido(pedidoData) {
  try {
    // 1. PRIMERO: Guardar el pedido en Supabase
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert(pedidoData)
      .select()
      .single();

    if (pedidoError) {
      throw pedidoError;
    }

    // 2. DESPUÉS: Intentar imprimir (no bloquea si falla)
    const printResult = await imprimirTicketCocina(
      pedido, 
      usuarioActual.lomiteriaId
    );

    // 3. Mostrar resultado al usuario
    if (printResult.success) {
      toast.success('Pedido confirmado e impreso');
    } else {
      toast.warning('Pedido confirmado, pero no se pudo imprimir');
    }

    return pedido;

  } catch (error) {
    console.error('Error al confirmar pedido:', error);
    throw error;
  }
}
```

### Puntos Importantes

1. **El pedido se guarda PRIMERO**, luego se intenta imprimir
2. **Si falla la impresión, el pedido NO se cancela**
3. **Usar timeout de 15 segundos** (la impresión en Windows puede tardar)
4. **Manejar errores silenciosamente** - solo mostrar aviso al usuario
5. **La tabla `printer_config` debe existir** en Supabase (ver `database/printer_config.sql`)

### Estructura de Datos Esperada

**Para ticket de cocina**:
- `numeroPedido`: número del pedido
- `tipoPedido`: "local", "delivery", "para_llevar"
- `items`: array con `nombre`, `cantidad`, `personalizaciones` (opcional)
- `lomiteriaNombre`: nombre de la lomitería
- `total`: total del pedido
- `fecha`: ISO string

**Para factura**:
- `numeroFactura`: número de factura
- `cliente`: objeto con `nombre`, `direccion`, `ci`
- `items`: array con `nombre`, `cantidad`, `precioUnitario`, `subtotal`
- `subtotal`, `impuestos`, `total`: valores numéricos
- `metodoPago`: string
- `lomiteriaName`, `lomiteriaAddress`, `lomiteriaTaxId`: datos de la lomitería

### Manejo de Errores

- **Agente no disponible**: Timeout después de 5 segundos
- **Impresora no configurada**: No intentar imprimir, solo loguear
- **Error de impresión**: Mostrar aviso pero mantener pedido guardado
- **Red local no disponible**: Timeout, pedido se guarda igual

### Testing

Para probar la integración:
1. Verificar que el agente esté corriendo: `GET http://[agent_ip]:3001/health`
2. Probar impresión desde la app Next.js
3. Verificar logs del agente en `logs/combined.log`

---

**Resumen**: El agente está listo y funcionando. Solo necesitas implementar las funciones de impresión en Next.js que consulten `printer_config` y envíen las órdenes al endpoint `/print` del agente.

