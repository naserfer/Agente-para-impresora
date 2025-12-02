# 📡 Endpoints del Agente de Impresión

## 🔍 Endpoints de Verificación

### `GET /`
**Descripción**: Verifica que el agente esté funcionando

**Respuesta**:
```json
{
  "status": "ok",
  "service": "Print Agent - Lomitería",
  "version": "1.0.0",
  "timestamp": "2025-11-30T20:48:41.149Z"
}
```

**Ejemplo**:
```bash
curl http://localhost:3001/
```

---

### `GET /health`
**Descripción**: Muestra el estado del agente y las impresoras configuradas

**Respuesta**:
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "printers": [
    {
      "printerId": "lomiteria-001",
      "type": "usb",
      "printerName": "EPSON TM-T20",
      "configured": true
    }
  ],
  "printersCount": 1,
  "timestamp": "2025-11-30T20:48:41.149Z"
}
```

**Ejemplo**:
```bash
curl http://localhost:3001/health
```

---

## 🖨️ Endpoints de Impresora

### `GET /api/printer/status/:printerId`
**Descripción**: Verifica el estado de una impresora específica

**Parámetros**:
- `printerId` (en la URL): ID de la impresora

**Ejemplo**:
```bash
curl http://localhost:3001/api/printer/status/lomiteria-001
```

**Respuesta exitosa**:
```json
{
  "connected": true,
  "printerId": "lomiteria-001",
  "type": "usb",
  "printerName": "EPSON TM-T20",
  "message": "Impresora conectada y funcionando correctamente",
  "lastTest": "2025-11-30T20:48:41.149Z"
}
```

---

### `POST /api/printer/configure`
**Descripción**: Configura una impresora

**Body**:
```json
{
  "printerId": "lomiteria-001",
  "type": "usb",
  "printerName": "EPSON TM-T20"
}
```

**Para impresora de red**:
```json
{
  "printerId": "lomiteria-001",
  "type": "network",
  "ip": "192.168.1.100",
  "port": 9100
}
```

**Ejemplo**:
```bash
curl -X POST http://localhost:3001/api/printer/configure \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "type": "usb",
    "printerName": "EPSON TM-T20"
  }'
```

---

### `POST /api/printer/test/:printerId`
**Descripción**: Imprime un ticket de prueba

**Parámetros**:
- `printerId` (en la URL): ID de la impresora

**Ejemplo**:
```bash
curl -X POST http://localhost:3001/api/printer/test/lomiteria-001
```

---

## 🎫 Endpoints de Impresión

### `POST /print`
**Descripción**: Endpoint principal para imprimir tickets

**Body**:
```json
{
  "printerId": "lomiteria-001",
  "tipo": "cocina",
  "data": {
    "numero": "001",
    "fecha": "2025-11-30",
    "hora": "20:48",
    "items": [
      {
        "nombre": "Lomo Completo",
        "cantidad": 2,
        "precio": 1500
      }
    ],
    "total": 3000
  }
}
```

**Tipos disponibles**:
- `"cocina"`: Ticket de cocina
- `"factura"`: Factura para el cliente

**Ejemplo**:
```bash
curl -X POST http://localhost:3001/print \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "tipo": "cocina",
    "data": {
      "numero": "001",
      "items": [{"nombre": "Lomo", "cantidad": 1}]
    }
  }'
```

---

### `POST /api/print/text`
**Descripción**: Imprime texto plano

**Body**:
```json
{
  "printerId": "lomiteria-001",
  "text": "Texto a imprimir\nLínea 2"
}
```

**Ejemplo**:
```bash
curl -X POST http://localhost:3001/api/print/text \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "text": "Prueba de impresión"
  }'
```

---

## 📋 Resumen de Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/` | Estado básico del agente |
| `GET` | `/health` | Estado completo con impresoras |
| `GET` | `/api/printer/status/:printerId` | Estado de una impresora |
| `POST` | `/api/printer/configure` | Configurar impresora |
| `POST` | `/api/printer/test/:printerId` | Test de impresión |
| `POST` | `/print` | Imprimir ticket (principal) |
| `POST` | `/api/print/text` | Imprimir texto plano |

---

## 🧪 Probar desde el Navegador

Puedes probar los endpoints GET directamente en el navegador:

- **Estado básico**: http://localhost:3001/
- **Health check**: http://localhost:3001/health
- **Estado impresora**: http://localhost:3001/api/printer/status/lomiteria-001

---

## 📝 Notas

- Todos los endpoints devuelven JSON
- El agente escucha en `0.0.0.0:3001` (accesible desde red local)
- Los endpoints POST requieren `Content-Type: application/json`
- El `printerId` debe configurarse primero con `/api/printer/configure`

