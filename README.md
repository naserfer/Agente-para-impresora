# 🖨️ Agente de Impresión Térmica - Sistema Multi-Tenant

Sistema de impresión automática para lomiterías que detecta pedidos confirmados desde Supabase Realtime e imprime automáticamente en impresoras térmicas.

## ✨ Características

- ✅ **Impresión Automática**: Detecta pedidos confirmados vía Supabase Realtime
- ✅ **Multi-Tenant**: Soporta múltiples lomiterías con configuraciones independientes
- ✅ **Sin Túneles**: Conexión directa a Supabase (no requiere túneles públicos)
- ✅ **Auto-Configuración**: Detecta automáticamente impresoras Epson TM-T20III
- ✅ **Interfaz Gráfica**: Aplicación desktop con Electron + React para configuración y monitoreo
- ✅ **Windows/Linux/Mac**: Compatible con múltiples sistemas operativos
- ✅ **USB y Red**: Soporta impresoras USB y de red

## 🏗️ Arquitectura

```
┌─────────────────┐
│   App Web       │  (Next.js en Vercel)
│   (Móvil)       │
└────────┬────────┘
         │
         │ 1. Vendedor confirma pedido
         │    UPDATE pedidos SET estado_pedido = 'FACT'
         ▼
┌─────────────────┐
│   Supabase      │  (Base de datos + Realtime)
│   Realtime      │
└────────┬────────┘
         │
         │ 2. WebSocket detecta cambio
         │    (estado_pedido = 'FACT')
         ▼
┌─────────────────┐
│   Agente        │  (Node.js en PC local)
│   localhost:3001│
└────────┬────────┘
         │
         │ 3. Consulta printer_config
         │    Obtiene items_pedido
         │    Genera ticket ESC/POS
         │
         ▼
┌─────────────────┐
│   Impresora     │  (Epson TM-T20III)
│   Térmica       │
└─────────────────┘
```

## 🚀 Instalación Rápida

### 1. Requisitos

- **Node.js 20+** (LTS recomendado)
- **Windows/Linux/Mac**
- **Impresora térmica** compatible con ESC/POS (Epson TM-T20III recomendada)

### 2. Instalar Dependencias

```bash
# Desde la raíz del proyecto
npm install

# O instalar por workspace
cd packages/agent
npm install

cd ../desktop
npm install
```

### 3. Configurar Variables de Entorno

```bash
# En packages/agent
cd packages/agent
cp .env.example .env

# Editar .env con tus credenciales de Supabase:
# SUPABASE_URL=https://tu-proyecto.supabase.co
# SUPABASE_ANON_KEY=tu-anon-key
```

### 4. Iniciar el Sistema

**Opción A: Todo junto (Agente + Interfaz Gráfica)**
```bash
# Desde la raíz del proyecto
npm run dev
```

**Opción B: Solo el Agente**
```bash
cd packages/agent
npm run dev
```

**Opción C: Solo la Interfaz Gráfica**
```bash
cd packages/desktop
npm run dev
```

El agente:
- ✅ Se conecta a Supabase Realtime
- ✅ Detecta automáticamente la impresora Epson TM-T20III
- ✅ Escucha cambios en la tabla `pedidos`
- ✅ Imprime automáticamente cuando `estado_pedido = 'FACT'`

## 📋 Configuración Inicial

### Paso 1: Habilitar Realtime en Supabase

Ejecuta en Supabase SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
```

Verifica que esté habilitado:

```sql
SELECT tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos';
```

### Paso 2: Configurar Impresora en Supabase

Cada lomitería necesita una entrada en `printer_config`:

```sql
INSERT INTO printer_config (
  lomiteria_id,
  printer_id,
  agent_ip,
  agent_port,
  tipo_impresora,
  nombre_impresora,
  ubicacion,
  activo
) VALUES (
  (SELECT id FROM tenants WHERE slug = 'atlas-burger'),
  'atlas-burger-printer-1',  -- ID único
  'localhost',                -- No se usa con Realtime, pero requerido
  3001,                       -- No se usa con Realtime, pero requerido
  'usb',
  'EPSON TM-T20III Receipt',
  'Cocina',
  true
);
```

**Nota**: Con Realtime, `agent_ip` y `agent_port` no se usan, pero son campos requeridos.

### Paso 3: Verificar que Funciona

1. **Verifica que el agente esté corriendo:**
   ```bash
   curl http://127.0.0.1:3001/health
   ```

2. **Deberías ver en los logs:**
   ```
   ✅ Realtime activo - Escuchando tabla: pedidos
   ✅ Impresora configurada automáticamente: atlas-burger-printer-1
   ```

3. **Prueba con un pedido:**
   - Ejecuta el script SQL de prueba: `packages/agent/database/TEST_IMPRESION_AUTOMATICA.sql`
   - Deberías ver: `✅ Pedido #X impreso automáticamente`

## 🖥️ Interfaz Gráfica (Desktop)

El proyecto incluye una interfaz gráfica desarrollada con Electron + React para facilitar la configuración y monitoreo.

### Características de la Interfaz

- ✅ **Estado del Sistema**: Visualización en tiempo real del estado del agente y conexiones
- ✅ **Configuración de Supabase**: Formularios para ingresar credenciales
- ✅ **Configuración de Impresora**: Listar y seleccionar impresoras del sistema
- ✅ **Prueba de Impresión**: Botón para probar la impresora configurada
- ✅ **Historial de Impresiones**: Ver últimos pedidos impresos
- ✅ **Logs en Tiempo Real**: Monitorear logs del agente
- ✅ **Control del Agente**: Iniciar/detener el agente desde la interfaz

### Iniciar Interfaz Gráfica

```bash
# Desde la raíz del proyecto
npm run dev
# Esto inicia tanto el agente como la interfaz gráfica

# O solo la interfaz gráfica
cd packages/desktop
npm run dev
```

### Construir Instalador

```bash
cd packages/desktop
npm run build
```

Genera un instalador `.exe` para Windows en `packages/desktop/dist/`

## 🔧 Configuración para Nuevo Cliente

### En Supabase

1. **Crear tenant:**
   ```sql
   INSERT INTO tenants (nombre, slug, activo)
   VALUES ('Nueva Lomitería', 'nueva-lomiteria', true);
   ```

2. **Configurar impresora:**
   ```sql
   INSERT INTO printer_config (
     lomiteria_id, printer_id, agent_ip, agent_port,
     tipo_impresora, nombre_impresora, ubicacion, activo
   ) VALUES (
     (SELECT id FROM tenants WHERE slug = 'nueva-lomiteria'),
     'nueva-lomiteria-printer-1',
     'localhost', 3001, 'usb', 'EPSON TM-T20III Receipt', 'Cocina', true
   );
   ```

### En el Agente

El agente detecta automáticamente la impresora al iniciar. Si necesitas configurarla manualmente:

**Opción 1: Desde la Interfaz Gráfica**
1. Abre la pestaña "Impresora"
2. Selecciona la impresora de la lista
3. Ingresa el Printer ID
4. Haz clic en "Guardar Configuración"

**Opción 2: Desde API**
```bash
POST http://127.0.0.1:3001/api/printer/configure
{
  "printerId": "nueva-lomiteria-printer-1",
  "type": "usb",
  "printerName": "EPSON TM-T20III Receipt"
}
```

## 📡 Endpoints del Agente

### `GET /health`
Estado del agente e impresoras configuradas.

**Respuesta:**
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "printers": [{
    "printerId": "atlas-burger-printer-1",
    "type": "usb",
    "printerName": "EPSON TM-T20III Receipt",
    "configured": true
  }],
  "printersCount": 1
}
```

### `GET /api/history`
Historial de pedidos impresos (últimos 100).

**Respuesta:**
```json
{
  "success": true,
  "data": [{
    "orderId": "uuid",
    "orderNumber": "123",
    "printerId": "atlas-burger-printer-1",
    "itemsCount": 3,
    "total": 1500.00,
    "printedAt": "2025-12-08T12:00:00Z"
  }],
  "count": 1
}
```

### `GET /api/printers`
Lista de impresoras configuradas.

**Respuesta:**
```json
{
  "success": true,
  "data": [{
    "id": "atlas-burger-printer-1",
    "name": "EPSON TM-T20III Receipt",
    "type": "usb",
    "connected": true
  }],
  "count": 1
}
```

### `POST /api/printer/configure`
Configurar una impresora en el agente.

**Request:**
```json
{
  "printerId": "atlas-burger-printer-1",
  "type": "usb",
  "printerName": "EPSON TM-T20III Receipt"
}
```

### `POST /api/printer/test/:printerId`
Imprimir un ticket de prueba.

**Ejemplo:**
```bash
POST http://127.0.0.1:3001/api/printer/test/atlas-burger-printer-1
```

## 🔍 Solución de Problemas

### Realtime no se conecta

1. **Verifica Node.js 20+:**
   ```bash
   node --version  # Debe ser v20.x.x o superior
   ```

2. **Verifica que Realtime esté habilitado:**
   ```sql
   SELECT tablename FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos';
   ```

3. **Verifica credenciales en `.env`:**
   - `SUPABASE_URL` debe estar configurado
   - `SUPABASE_ANON_KEY` debe estar configurado

4. **Verifica que el paquete `ws` esté instalado:**
   ```bash
   cd packages/agent
   npm install ws
   ```

### Impresora no se detecta

1. **Verifica que la impresora esté instalada en Windows:**
   ```powershell
   Get-Printer | Select-Object Name, PortName
   ```

2. **El agente detecta automáticamente** impresoras Epson TM-T20III al iniciar

3. **Si no se detecta, configura manualmente desde la interfaz gráfica:**
   - Ve a la pestaña "Impresora"
   - Selecciona la impresora de la lista
   - Ingresa el Printer ID
   - Guarda la configuración

### No imprime cuando se confirma un pedido

1. **Verifica que Realtime esté conectado:**
   - Busca en logs: `✅ Realtime activo`
   - O en la interfaz gráfica: Estado debe mostrar "Conectado"

2. **Verifica que el pedido tenga `estado_pedido = 'FACT'`:**
   ```sql
   SELECT id, estado_pedido, estado FROM pedidos 
   WHERE id = 'tu-pedido-id';
   ```

3. **Verifica que exista `printer_config` para el tenant:**
   ```sql
   SELECT * FROM printer_config 
   WHERE lomiteria_id = (SELECT id FROM tenants WHERE slug = 'atlas-burger');
   ```

### Interfaz Gráfica no muestra el estado del agente

1. **Verifica que el agente esté corriendo:**
   ```bash
   curl http://127.0.0.1:3001/health
   ```

2. **Verifica que no haya problemas de IPv6:**
   - El código usa `127.0.0.1` en lugar de `localhost` para evitar problemas con IPv6
   - Si persiste, verifica que el puerto 3001 esté libre

3. **Recarga la interfaz gráfica:**
   - Presiona `Ctrl+R` en Electron
   - O cierra y vuelve a abrir la aplicación

### Error "ECONNREFUSED ::1:3001"

Este error ocurre cuando Node.js intenta conectarse a IPv6. La solución ya está aplicada usando `127.0.0.1` en lugar de `localhost`. Si persiste:

1. Verifica que el agente esté corriendo en el puerto 3001
2. Verifica que no haya firewall bloqueando la conexión
3. Reinicia el agente y la interfaz gráfica

## 📁 Estructura del Proyecto

```
agente/
├── packages/
│   ├── agent/                 # Servidor del agente
│   │   ├── server.js          # Servidor principal
│   │   ├── supabase-listener.js  # Listener de Realtime
│   │   ├── printer/
│   │   │   ├── PrinterManager.js
│   │   │   └── TicketGenerator.js
│   │   └── database/         # Scripts SQL
│   │       ├── 00_initial_schema.sql
│   │       ├── 01_impresion_automatica.sql
│   │       └── TEST_IMPRESION_AUTOMATICA.sql
│   └── desktop/               # Interfaz gráfica (Electron + React)
│       ├── electron/          # Proceso principal Electron
│       │   ├── main.js
│       │   └── preload.cjs
│       ├── src/               # Aplicación React
│       │   ├── components/
│       │   │   ├── StatusPanel.tsx
│       │   │   ├── SupabaseConfig.tsx
│       │   │   ├── PrinterConfig.tsx
│       │   │   └── LogsViewer.tsx
│       │   └── App.tsx
│       └── package.json
├── printers-config.json       # Configuración de impresoras
└── README.md                  # Este archivo
```

## 🎯 Flujo de Impresión Automática

1. **Vendedor confirma pedido** en la app móvil
2. **App actualiza** `pedidos.estado_pedido = 'FACT'` en Supabase
3. **Supabase Realtime** detecta el cambio y notifica al agente (WebSocket)
4. **Agente consulta** `printer_config` por `lomiteria_id`
5. **Agente obtiene** items desde `items_pedido`
6. **Agente genera** ticket en formato ESC/POS
7. **Agente imprime** automáticamente en la impresora física
8. **Agente registra** la impresión en el historial

## ⚙️ Variables de Entorno

| Variable | Descripción | Requerido | Default |
|----------|-------------|-----------|---------|
| `SUPABASE_URL` | URL de tu proyecto Supabase | ✅ Sí | - |
| `SUPABASE_ANON_KEY` | Anon key de Supabase | ✅ Sí | - |
| `SUPABASE_ORDERS_TABLE` | Nombre de la tabla de pedidos | ❌ No | `pedidos` |
| `ENABLE_SUPABASE_LISTENER` | Habilitar impresión automática | ❌ No | `true` |
| `PORT` | Puerto del agente | ❌ No | `3001` |
| `HOST` | Host del agente | ❌ No | `0.0.0.0` |
| `LOG_LEVEL` | Nivel de logs | ❌ No | `info` |

## 📝 Notas Importantes

- **Node.js 20+ es requerido** para Supabase Realtime
- **Realtime debe estar habilitado** en Supabase para la tabla `pedidos`
- **La impresora se detecta automáticamente** al iniciar el agente
- **Cada tenant necesita** una entrada en `printer_config`
- **El `printer_id` debe coincidir** entre Supabase y el agente
- **La interfaz gráfica usa `127.0.0.1`** en lugar de `localhost` para evitar problemas con IPv6
- **El historial de impresiones** se mantiene en memoria (últimos 100 pedidos)

## 🎉 ¡Listo!

El sistema está configurado y funcionando. Cuando un vendedor confirme un pedido desde la app móvil, se imprimirá automáticamente en la impresora térmica.

---

**¿Necesitas ayuda?** Revisa los logs del agente, la interfaz gráfica, o verifica la configuración en Supabase.
