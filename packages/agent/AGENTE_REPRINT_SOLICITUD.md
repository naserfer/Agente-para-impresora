# Reimpresión: tabla `reprint_solicitud` + agente

## Qué hace el agente (implementado)

- Segundo canal Realtime: **`INSERT`** en `public.reprint_solicitud`.
- **Polling cada 15 s** sobre `reprint_solicitud` (últimos N minutos, igual que `POLLING_FACT_MINUTES` o `POLLING_REPRINT_MINUTES`), por si Realtime no entrega eventos con tu clave.
- **`tipo = 'cocina'`**: vuelve a leer el pedido FACT, `vista_items_ticket_cocina`, `tenants`, `clientes` e imprime **solo ticket de cocina** (no consulta ni imprime factura).
- **`tipo = 'factura'`**: imprime **solo** la factura térmica PY si hay fila en `vista_factura_impresion` (mismo flujo que antes, aislado).
- Deduplicación por **`reprint_solicitud.id`**.
- Filtro opcional multi-PC: variable de entorno **`AGENT_TENANT_IDS`** (UUIDs separados por coma). Si está definida, solo se procesan filas cuyo `tenant_id` esté en la lista.

## Variables de entorno

| Variable | Efecto |
|----------|--------|
| `ENABLE_REPRINT_SOLICITUD=false` | No suscribe al canal `reprint_solicitud`. |
| `AGENT_TENANT_IDS=uuid1,uuid2` | Solo esos tenants (útil si varios locales comparten un proyecto Supabase y cada PC tiene su agente). |

## SQL

Migración de referencia: [`database/14_reprint_solicitud.sql`](database/14_reprint_solicitud.sql).

## Realtime y RLS (importante)

Tu log de API mostró **`role: anon`**: con las políticas solo para `authenticated`, **Realtime no recibe** y un **GET** al REST también devuelve vacío o error.

Opciones:

1. **`SUPABASE_SERVICE_ROLE_KEY`** en el `.env` del agente (solo esa máquina). No uses esa clave en Next público.
2. Ejecutar al final de [`database/14_reprint_solicitud.sql`](database/14_reprint_solicitud.sql) el bloque **`GRANT SELECT ... TO anon`** + política `reprint_solicitud_select_anon` (expone lectura de la cola a quien tenga la anon key; evaluar si te sirve).

Con anon + sin política SELECT, verás en logs solo el polling de **`pedidos`**, nunca filas de **`reprint_solicitud`**, y no se reimprime.

Comprobá en el Dashboard que **`reprint_solicitud`** esté en la publication **`supabase_realtime`**.

## Reimpresión solo factura (KaruBox: `PATCH facturas.updated_at`)

El agente también:

- Se suscribe a **`UPDATE`** en `public.facturas`.
- Hace **polling** de filas con `updated_at` reciente (misma ventana que pedidos / `POLLING_FACTURA_BUMP_MINUTES`).
- Si `updated_at` es casi igual a `created_at` (< 3 s), **no** imprime (evita duplicar al dar de alta la factura).
- Carga el **pedido** y llama a `printOrder(..., { invoiceOnly: true })` (vista `vista_factura_impresion`).

SQL opcional (anon + publication): [`database/15_facturas_agent_realtime.sql`](database/15_facturas_agent_realtime.sql).  
Desactivar: `ENABLE_FACTURA_BUMP_LISTENER=false`.

## Contrato desde la app

Insert (o RPC `bump_pedido_reprint_cocina`) con `tenant_id`, `pedido_id`, `tipo` `'cocina'` | `'factura'`. El trigger valida pedido FACT y, si es factura, factura no anulada.
