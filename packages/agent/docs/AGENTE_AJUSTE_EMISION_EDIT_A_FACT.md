# Ajuste del agente de impresión: emisión inicial por `UPDATE` (EDIT → FACT)

Documento pensado para **copiar al repo del agente** o pegarlo en el asistente que modifique el listener. Resume el cambio del POS web y qué tenés que implementar en el agente para que la impresión siga funcionando y sea coherente con modificaciones de receta y facturas.

---

## 1. Contexto: qué cambió en la app web (Ka’u Manager / Lomiteria)

**Antes**, al confirmar un pedido el web hacía un solo `INSERT` en `public.pedidos` con `estado_pedido = 'FACT'`. Eso disparaba Realtime **demasiado pronto**: a veces el agente leía `vista_items_ticket_cocina` antes de que existieran las filas de `items_pedido_customizacion` (modificaciones “sin X / extra Y” desde BD), o antes de la fila en `facturas`. El agente terminaba **esperando, reintentando o haciendo polling** → sensación de lentitud y tickets incompletos.

**Ahora**, el flujo es:

1. `INSERT` en `pedidos` con `estado_pedido = 'EDIT'` (aún **no** es emisión inicial para vos).
2. Se guardan `items_pedido`, puntos, descuento de stock, **`items_pedido_customizacion`**, etc.
3. Si corresponde, se inserta la **factura** y se actualiza numeración.
4. **Un solo `UPDATE`** en `pedidos`: `estado_pedido = 'FACT'`.

El **único** evento Realtime de “pedido listo para imprimir en emisión inicial” es ese **`UPDATE`**, cuando el dato ya está consistente en la base.

**Importante:** la lógica de recetas, extras, removidos y descuento de materias primas **no se movió**; solo cambió **cuándo** se pasa a `FACT`. Por eso no perdés modificaciones: cuando imprimís tras ese `UPDATE`, la vista ya puede armar bien la columna `modificaciones`.

---

## 2. Qué tenés que cambiar en el agente (obligatorio)

### 2.1 Suscripción a `pedidos`

- **Ya no alcanza** con escuchar solo `INSERT` en `public.pedidos` esperando `estado_pedido = 'FACT'` en la fila nueva.
- Tenés que incluir **`UPDATE`** (o `event: '*'` en la suscripción, según el SDK).

Sugerencia de filtro por tenant (igual que hoy):

- `schema`: `public`
- `table`: `pedidos`
- `filter`: `tenant_id=eq.<UUID_de_esta_instalación>` (o el criterio que ya uses).

### 2.2 Cuándo disparar **emisión inicial** (cocina + factura según reglas)

Tratar **solo** transiciones a FACT:

- `eventType === 'UPDATE'`
- `record.estado_pedido === 'FACT'` (o `new` en el payload que use tu cliente)
- y **antes no era FACT**: por ejemplo `old.estado_pedido !== 'FACT'` (o `old` equivalente).

**No** uses solo “fila con FACT” en INSERT: en emisión inicial el INSERT viene con `EDIT`.

### 2.3 Comportamiento de impresión (sin cambiar reglas de negocio)

Igual que la documentación previa del proyecto web:

- **Ticket de cocina:** datos desde `vista_items_ticket_cocina` filtrando por `pedido_id` (incluye `modificaciones` + `notas_item`).
- **Factura en emisión inicial:** si existe fila para ese `pedido_id` en `facturas` / `vista_factura_impresion`, imprimir **dos copias** (cliente + archivo local). Ver [`AGENTE_FACTURA_EMISION_DOS_COPIAS.md`](AGENTE_FACTURA_EMISION_DOS_COPIAS.md).
- **Canje / sin factura:** solo cocina, **cero** facturas.

### 2.4 Idempotencia

Reconexiones o reenvíos pueden repetir eventos. Mantené (o agregá) deduplicación por `pedido_id` para **emisión inicial** (caché en memoria o persistida), para no imprimir dos veces cocina + 2 facturas.

### 2.5 Reimpresión (no mezclar)

La reimpresión desde el POS sigue siendo por **`INSERT` en `public.reprint_solicitud`**. Ese listener **no** lo reemplazás con el cambio de `pedidos`; conviven los dos.

---

## 3. Pseudocódigo (listener Supabase JS)

Ajustá nombres (`payload`, `new`, `old`) a la versión de `@supabase/supabase-js` que uses:

```text
channel.on('postgres_changes', {
  event: 'UPDATE',           // o '*' y filtrar adentro
  schema: 'public',
  table: 'pedidos',
  filter: `tenant_id=eq.${TENANT_ID}`,
}, (payload) => {
  const oldRow = payload.old
  const newRow = payload.new
  if (!newRow || newRow.estado_pedido !== 'FACT') return
  if (oldRow && oldRow.estado_pedido === 'FACT') return  // evitar doble trabajo en updates posteriores

  const pedidoId = newRow.id
  // 1) Fetch vista_items_ticket_cocina WHERE pedido_id = pedidoId
  // 2) Fetch factura / vista_factura_impresion si aplica
  // 3) Imprimir cocina; si hay factura, 2 copias según AGENTE_FACTURA_EMISION_DOS_COPIAS
  // 4) Marcar pedidoId como impreso (emisión inicial) para idempotencia
})
```

Si todavía tenés un handler de `INSERT` en `pedidos` que buscaba `estado_pedido === 'FACT'`, **no** vas a recibir la emisión inicial por ahí con el nuevo flujo: mové esa lógica al `UPDATE` como arriba (o unificá con `event: '*'` y la misma condición de transición).

---

## 4. Supabase (dashboard)

- Confirmá que **Realtime** esté habilitado para la tabla `pedidos` (publicación `supabase_realtime` o equivalente en tu proyecto).
- Si solo publicabas `INSERT`, verificá que **`UPDATE`** también esté incluido para `pedidos`.

---

## 5. Checklist de prueba manual

- [ ] Pedido normal con factura: tras confirmar, **un** ticket cocina y **dos** facturas (según tu spec).
- [ ] Pedido con modificaciones de receta (extras / sin ingrediente): texto de **`modificaciones`** en cocina correcto **a la primera**, sin depender de esperas largas.
- [ ] Canje sin factura: solo cocina.
- [ ] Reimpresión cocina / factura desde POS: sigue funcionando vía `reprint_solicitud`.
- [ ] Reconectar el agente: no duplica emisión inicial gracias a idempotencia.

---

## 6. Documentos relacionados en este repo web

| Documento | Contenido |
|-----------|-----------|
| [`INSTRUCCIONES_AGENTE_IMPRESION.md`](INSTRUCCIONES_AGENTE_IMPRESION.md) | Contrato general, formato HTTP opcional, sección **3c** (EDIT → FACT). |
| [`AGENTE_FACTURA_EMISION_DOS_COPIAS.md`](AGENTE_FACTURA_EMISION_DOS_COPIAS.md) | 2 copias en emisión inicial vs 1 en reimpresión. |
| [`AGENTE_REPRINT_SOLICITUD.md`](AGENTE_REPRINT_SOLICITUD.md) | Cola `reprint_solicitud`. |
| [`PROMPT_AGENTE_REIMPRESION.md`](PROMPT_AGENTE_REIMPRESION.md) | Prompt largo para el agente (incluye nota sobre UPDATE). |

---

## 7. RPC opcional en el servidor (solo contexto)

El proyecto web puede llamar a la función SQL `aplicar_salidas_ingredientes_pedido` (script `database/19_aplicar_salidas_ingredientes_pedido.sql`) para acortar round-trips de stock. **No sustituye** el ajuste del listener: el agente igual debe reaccionar al `UPDATE` EDIT → FACT.
