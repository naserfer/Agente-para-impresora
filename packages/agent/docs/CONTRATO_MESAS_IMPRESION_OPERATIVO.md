# Contrato Mesas Impresion Operativo

## 1. Objetivo

- Pedidos con `mesa_id`: cocina inmediata y factura diferida.
- Pedidos sin `mesa_id`: flujo normal (cocina + factura segun configuracion).

## 2. Flujo base

1. Karubox confirma pedido (`EDIT -> FACT`).
2. El agente procesa emision inicial.
3. Si aplica cierre de cuenta, Karubox encola `reprint_solicitud`.

## 3. Reglas operativas

### 3a. Emision inicial

- Evento: `UPDATE` de `pedidos` con transicion a `FACT`.
- Se mantiene idempotencia por `pedido_id` para evitar duplicados.

### 3b. Reimpresion cocina

- Karubox inserta en `reprint_solicitud` con `tipo='cocina'`.
- El agente imprime solo ticket cocina.

### 3c. Reimpresion factura

- Karubox inserta en `reprint_solicitud` con `tipo='factura'`.
- El agente imprime solo factura.

### 3d. Regla especial para Mesas (cocina inmediata, factura diferida)

Para pedidos con `mesa_id`:

- En emision inicial (`EDIT -> FACT`): imprimir **solo cocina**.
- La factura se difiere a la accion "Imprimir cuenta / Cerrar cuenta".
- Karubox crea la fila en `facturas` y luego encola `reprint_solicitud` con `tipo = 'factura'`.
- En esa cola, cada `INSERT` de factura imprime **una sola** copia.

## 4. Criterios de aceptacion

- Pedido con `mesa_id` confirmado: cocina si, factura no.
- Pedido sin `mesa_id` confirmado: cocina si, factura si (si esta habilitada).
- Cierre de cuenta de mesa: factura una sola vez por accion.
