# 🖨️ Guía para Configurar la Impresora Epson

## 📋 Información de tu Impresora

Según el panel de configuración de Epson:
- **Nombre**: `EPSON TM-T20III Receipt`
- **Puerto**: `TMUSB001`
- **Tipo**: USB

## 🚀 Métodos de Configuración

### Método 1: Script Automático (Recomendado)

```bash
npm run config-printer
```

Este script:
1. Detecta automáticamente el hostname que funciona (`localhost`, `127.0.0.1`, o `0.0.0.0`)
2. Configura la impresora con el nombre correcto
3. Verifica que todo funcione

### Método 2: Con IP Específica (Si localhost no funciona)

Si el agente está escuchando en `0.0.0.0:3001` y `localhost` no funciona, usa tu IP local:

```powershell
# Obtener tu IP local
ipconfig | findstr IPv4

# Configurar con la IP
.\configurar-impresora-con-ip.ps1 -Host 192.168.1.100
```

O directamente:
```powershell
.\configurar-impresora-con-ip.ps1
```

Este script detecta automáticamente tu IP local.

### Método 3: Manual con cURL o PowerShell

#### Con PowerShell:

```powershell
$body = @{
    printerId = "atlas-burger-printer-1"
    type = "usb"
    printerName = "EPSON TM-T20III Receipt"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/printer/configure" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

#### Con cURL (si tienes Git Bash o WSL):

```bash
curl -X POST http://localhost:3001/api/printer/configure \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "atlas-burger-printer-1",
    "type": "usb",
    "printerName": "EPSON TM-T20III Receipt"
  }'
```

## 🔍 Verificar Configuración

Después de configurar, verifica que todo esté bien:

```bash
# Ver estado de la impresora
curl http://localhost:3001/api/printer/status/atlas-burger-printer-1

# O desde PowerShell
Invoke-WebRequest -Uri "http://localhost:3001/api/printer/status/atlas-burger-printer-1" | ConvertFrom-Json
```

## 📡 Endpoints Importantes

### Configurar Impresora
```
POST http://localhost:3001/api/printer/configure
Content-Type: application/json

{
  "printerId": "atlas-burger-printer-1",
  "type": "usb",
  "printerName": "EPSON TM-T20III Receipt"
}
```

### Imprimir Ticket
```
POST http://localhost:3001/print
Content-Type: application/json

{
  "printerId": "atlas-burger-printer-1",
  "tipo": "cocina",
  "data": {
    "pedido": "123",
    "items": [...],
    ...
  }
}
```

### Ver Estado
```
GET http://localhost:3001/api/printer/status/atlas-burger-printer-1
```

## ⚠️ Solución de Problemas

### Error: "No se puede conectar al agente"

1. **Verifica que el agente esté corriendo:**
   ```bash
   npm run agent:dev
   ```

2. **Verifica el puerto:**
   ```powershell
   netstat -ano | findstr :3001
   ```

3. **Prueba con diferentes hostnames:**
   - `http://localhost:3001/health`
   - `http://127.0.0.1:3001/health`
   - `http://[TU_IP_LOCAL]:3001/health`

4. **Verifica el firewall de Windows:**
   - Asegúrate de que el puerto 3001 esté permitido

### Error: "Impresora no encontrada"

1. **Verifica el nombre exacto:**
   - Abre el panel de configuración de Epson
   - Copia el nombre exacto (incluyendo mayúsculas y espacios)
   - El nombre debe ser exactamente: `EPSON TM-T20III Receipt`

2. **Lista las impresoras USB disponibles:**
   ```bash
   npm run get-printer-id
   ```

3. **Verifica que la impresora esté conectada:**
   - Revisa el cable USB
   - Verifica en Windows: Configuración > Dispositivos > Impresoras

## 💡 Notas Importantes

- El `printerId` es un **ID personalizado** que tú defines (ej: `"atlas-burger-printer-1"`)
- El `printerName` debe ser el **nombre exacto** de Windows (ej: `"EPSON TM-T20III Receipt"`)
- El agente escucha en `0.0.0.0:3001` para permitir acceso desde la red local
- Para conexiones locales, usa `localhost` o `127.0.0.1`
- Para conexiones desde otros dispositivos en la red, usa la IP de tu PC

