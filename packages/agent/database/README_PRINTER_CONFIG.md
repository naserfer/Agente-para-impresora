# 📋 Tabla `printer_config` - Configuración de Impresoras

## ✅ ¿Qué Falta en tu Base de Datos?

**Falta la tabla `printer_config`** que conecta cada lomitería con su impresora física.

Esta tabla es **ESENCIAL** para que funcione el flujo de impresión.

## 🔄 Flujo Completo con la Tabla

```
1. Usuario inicia sesión
   ↓
2. App obtiene: lomiteriaId = "atlas-burger-id"
   ↓
3. App consulta printer_config:
   SELECT * FROM printer_config 
   WHERE lomiteria_id = 'atlas-burger-id'
   ↓
4. App obtiene:
   - printer_id: "atlas-burger-printer-1"
   - agent_ip: "192.168.1.50"
   - agent_port: 3001
   ↓
5. App envía orden al agente:
   POST http://192.168.1.50:3001/print
   {
     "printerId": "atlas-burger-printer-1",
     "tipo": "cocina",
     "data": {...}
   }
   ↓
6. Agente busca impresora por printerId
   ↓
7. Agente imprime en la impresora física
```

## 📝 Pasos para Agregar la Tabla

### Paso 1: Ejecutar el Script SQL

Ejecuta el archivo `database/printer_config.sql` en Supabase:

1. Abre Supabase Dashboard
2. Ve a SQL Editor
3. Copia y pega el contenido de `printer_config.sql`
4. **IMPORTANTE**: Antes de ejecutar, ajusta la IP en la línea ~60:
   ```sql
   v_agent_ip TEXT := '192.168.1.50';  -- ⚠️ CAMBIA ESTA IP
   ```
5. Ejecuta el script

### Paso 2: Obtener la IP de tu PC

En PowerShell de Windows:

```powershell
ipconfig
```

Busca la sección "Adaptador de LAN inalámbrica Wi-Fi" y copia la "Dirección IPv4".

Ejemplo: `192.168.1.50`

### Paso 3: Actualizar la Configuración

Si ya ejecutaste el script pero necesitas cambiar la IP:

```sql
UPDATE printer_config
SET 
  agent_ip = '192.168.1.50',  -- Tu IP real
  updated_at = NOW()
WHERE lomiteria_id = (
  SELECT id FROM tenants WHERE slug = 'atlas-burger'
);
```

### Paso 4: Verificar la Configuración

```sql
-- Ver configuración actual
SELECT 
  t.nombre as lomiteria,
  pc.printer_id,
  pc.agent_ip,
  pc.agent_port,
  CONCAT('http://', pc.agent_ip, ':', pc.agent_port, '/print') as url_agente
FROM printer_config pc
JOIN tenants t ON pc.lomiteria_id = t.id
WHERE t.slug = 'atlas-burger';
```

## 📊 Estructura de la Tabla

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | ID único |
| `lomiteria_id` | UUID | FK a `tenants` (qué lomitería) |
| `printer_id` | TEXT | ID único de la impresora en el agente |
| `agent_ip` | TEXT | IP de la PC donde corre el agente |
| `agent_port` | INTEGER | Puerto del agente (default: 3001) |
| `tipo_impresora` | TEXT | 'usb', 'network', 'bluetooth' |
| `nombre_impresora` | TEXT | Nombre descriptivo (opcional) |
| `ubicacion` | TEXT | Dónde está (Cocina, Caja, etc) |
| `activo` | BOOLEAN | Si está activa o no |

## 🔑 Campos Clave

### `lomiteria_id`
- Conecta con la tabla `tenants`
- Una configuración por lomitería (UNIQUE)

### `printer_id`
- ID único que identifica la impresora en el agente
- Este es el valor que se envía en `printerId` al agente
- Ejemplo: `"atlas-burger-printer-1"`

### `agent_ip` y `agent_port`
- Dónde está corriendo el agente de impresión
- La app web usa estos valores para enviar las órdenes
- Ejemplo: `http://192.168.1.50:3001/print`

## 💡 Ejemplo de Uso en tu App Next.js

```javascript
// Cuando un usuario confirma un pedido
async function imprimirTicket(pedidoData) {
  // 1. Obtener el lomiteriaId del usuario logueado
  const lomiteriaId = usuarioActual.lomiteriaId;
  
  // 2. Consultar printer_config en Supabase
  const { data: printerConfig } = await supabase
    .from('printer_config')
    .select('*')
    .eq('lomiteria_id', lomiteriaId)
    .eq('activo', true)
    .single();
  
  if (!printerConfig) {
    console.warn('No hay impresora configurada para esta lomitería');
    return; // El pedido se guarda igual, solo no imprime
  }
  
  // 3. Enviar orden al agente
  const response = await fetch(
    `http://${printerConfig.agent_ip}:${printerConfig.agent_port}/print`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printerId: printerConfig.printer_id,
        tipo: 'cocina',
        data: {
          numeroPedido: pedidoData.numero_pedido,
          items: pedidoData.items,
          // ... más datos
        }
      })
    }
  );
  
  if (!response.ok) {
    console.error('Error al imprimir:', await response.json());
    // El pedido se guarda igual, solo falla la impresión
  }
}
```

## ✅ Checklist

- [ ] Tabla `printer_config` creada
- [ ] Datos de ejemplo insertados para Atlas Burger
- [ ] IP de tu PC configurada correctamente
- [ ] Verificación ejecutada (query de verificación)
- [ ] Agente corriendo en la IP y puerto configurados
- [ ] Impresora configurada en el agente con el mismo `printer_id`

## 🎯 Resumen

**Sin esta tabla, el flujo NO puede funcionar** porque:
- ❌ La app web no sabe qué `printerId` usar
- ❌ La app web no sabe dónde está el agente (IP y puerto)
- ❌ No hay conexión entre lomitería e impresora

**Con esta tabla, el flujo funciona** porque:
- ✅ La app web consulta y obtiene toda la info necesaria
- ✅ Puede enviar las órdenes al agente correcto
- ✅ El agente sabe qué impresora usar por el `printerId`

---

**¿Listo?** Ejecuta el script `printer_config.sql` y ajusta la IP. ¡Eso es todo lo que falta!

