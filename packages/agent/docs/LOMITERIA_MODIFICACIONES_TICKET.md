# Qué debe hacer la lomitería (app) para que las modificaciones salgan en el ticket

Para que en el ticket de cocina aparezcan **extras**, **ingredientes quitados** y demás cambios por ítem, la app (Next.js / POS) tiene que guardar ese texto en la base de datos donde el agente lo lee.

---

## 1. Dónde se lee hoy (agente)

- El agente obtiene los ítems desde la vista **`vista_items_ticket_cocina`**.
- Esa vista usa la columna **`items_pedido.notas`** como texto de modificaciones.

Por tanto: **si la app no escribe en `items_pedido.notas`, el ticket no mostrará modificaciones.**

---

## 2. Qué debe hacer la app al guardar cada ítem del pedido

Al crear o actualizar una fila en **`items_pedido`**, la app debe:

1. **Armar un único texto** con todas las modificaciones del ítem, por ejemplo:
   - Extras: `"Extra Queso Cheddar (+1)"`
   - Quitados: `"Sin cebolla"`
   - Combinado: `"Sin cebolla · Extra Queso Cheddar (+1)"` (o el formato que prefieran)

2. **Guardar ese texto en `items_pedido.notas`** para ese ítem.

Ejemplo de inserción/actualización (conceptual):

```js
// Al guardar un ítem del pedido
await supabase.from('items_pedido').insert({
  pedido_id: pedidoId,
  producto_id: producto.id,
  producto_nombre: producto.nombre,
  cantidad: 2,
  precio_unitario: 12.5,
  subtotal: 25,
  notas: modificacionesTexto   // ← "Sin cebolla · Extra Bacon (+1)"
});
```

Si las modificaciones vienen de otra tabla (por ejemplo customizaciones por ítem), la app debe **construir ese string** y guardarlo en `notas` al persistir el ítem (o en un trigger que actualice `items_pedido.notas`).

---

## 3. Resumen en una frase

**La lomitería debe escribir en `items_pedido.notas` el texto de las modificaciones de cada ítem (extras, sin X, etc.) cuando guarda el pedido; así la vista y el agente lo mostrarán en el ticket.**

---

## 4. Cómo comprobar que está bien

En Supabase (o con SQL):

```sql
SELECT id, pedido_id, producto_nombre, cantidad, notas
FROM items_pedido
WHERE pedido_id = 'TU_PEDIDO_ID';
```

- Si `notas` tiene el texto de las modificaciones para cada ítem, el ticket lo imprimirá.
- Si `notas` está siempre NULL o vacío, hay que ajustar la app para que llene ese campo.

---

## 5. Si la app guarda modificaciones en otro lugar

Si en el futuro las modificaciones se guardan en otra tabla (por ejemplo `item_pedido_modificaciones` o un JSON en otra columna), se puede cambiar la definición de la vista **`vista_items_ticket_cocina`** para que la columna `modificaciones` se arme desde ahí (por ejemplo con `string_agg` o lógica en SQL). Mientras tanto, usar **`items_pedido.notas`** es suficiente y es lo que el agente espera hoy.
