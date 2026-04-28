# Contrato Mesas: Cocina Inmediata, Factura Diferida

Este documento define el contrato operativo entre Karubox (origen de eventos) y el Agente de impresion (ejecutor de tickets) para pedidos con mesa.

## Objetivo

- Cuando el pedido viene de mesa (`mesa_id` con valor), al confirmar (`EDIT -> FACT`) se imprime solo cocina.
- La factura de ese pedido se difiere hasta una accion explicita de cierre de cuenta.
- Sin mesa (`mesa_id = null`), se mantiene el flujo normal de emision (cocina + factura segun configuracion).

## Reglas del Agente

1. Emision inicial (`pedidos` UPDATE a `FACT`):
   - `mesa_id` presente: `kitchenOnly=true`.
   - `mesa_id` ausente: flujo completo actual.
2. Reimpresion explicita:
   - `reprint_solicitud.tipo='cocina'`: solo cocina.
   - `reprint_solicitud.tipo='factura'`: solo factura.
3. Idempotencia:
   - Mantener control por `pedido_id` para evitar duplicados por reconexion/eventos repetidos.

## Reglas de Karubox

1. Confirmacion de pedido:
   - Mantener transicion `EDIT -> FACT` en `pedidos`.
   - Incluir `mesa_id` cuando el pedido es de mesa.
2. Boton "Imprimir cuenta / Cerrar cuenta":
   - Insertar en `public.reprint_solicitud`:
     - `tenant_id`
     - `pedido_id`
     - `tipo='factura'`
3. Reimpresion manual cocina:
   - Insertar en `public.reprint_solicitud` con `tipo='cocina'`.

## SQL de referencia para cierre de cuenta

```sql
INSERT INTO public.reprint_solicitud (tenant_id, pedido_id, tipo)
VALUES (:tenant_id, :pedido_id, 'factura');
```

## Criterios de aceptacion compartidos

- Pedido con mesa confirmado: imprime cocina, no factura.
- Pedido sin mesa confirmado: imprime cocina y factura (si `ENABLE_INVOICE_PRINTING=true`).
- Cierre de cuenta de mesa: imprime factura pendiente una sola vez por accion.
