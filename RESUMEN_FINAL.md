# ✅ Configuración Completa de Impresora

## 🎉 Estado Actual

### ✅ Impresora Configurada
- **Printer ID**: `atlas-burger-printer-1`
- **Nombre**: `EPSON TM-T20III Receipt`
- **Tipo**: USB
- **Compartida**: ✅ Sí
- **Estado**: Normal

### ✅ Código Mejorado
- Intenta compartir automáticamente la impresora
- Múltiples métodos de impresión
- Mensajes de error mejorados

## 🧪 Probar la Impresora

### Opción 1: Script Node.js (Recomendado)

```bash
npm run test-print
```

O directamente:
```bash
node test-impresion.js
```

### Opción 2: Script PowerShell

```powershell
npm run test-print-ps
```

O directamente:
```powershell
powershell -ExecutionPolicy Bypass -File test-impresion.ps1
```

### Opción 3: Manualmente con cURL/PowerShell

```powershell
# Verificar estado
Invoke-WebRequest -Uri "http://localhost:3001/api/printer/status/atlas-burger-printer-1" | ConvertFrom-Json

# Test de impresión
$body = @{
    printerId = "atlas-burger-printer-1"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/printer/test/atlas-burger-printer-1" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body | ConvertFrom-Json
```

## 📋 Checklist Final

- ✅ Impresora configurada en el agente
- ✅ Impresora compartida en Windows
- ✅ Servicio de spooler corriendo
- ⏳ Agente corriendo (verifica con `npm run agent:dev`)
- ⏳ Test de impresión ejecutado

## 🚀 Próximos Pasos

1. **Asegúrate de que el agente esté corriendo:**
   ```bash
   npm run agent:dev
   ```

2. **En otra terminal, ejecuta el test:**
   ```bash
   npm run test-print
   ```

3. **Verifica que la impresora imprima el ticket de prueba**

## 📡 Usar la Impresora en Producción

Una vez que el test funcione, puedes usar la impresora así:

```json
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

## 🎯 Archivos Creados

- ✅ `test-impresion.js` - Script de test en Node.js
- ✅ `test-impresion.ps1` - Script de test en PowerShell
- ✅ `configurar-impresora.js` - Script de configuración
- ✅ `compartir-impresora-simple.ps1` - Script para compartir
- ✅ `iniciar-spooler.ps1` - Script para iniciar servicio

## 💡 Comandos Útiles

```bash
# Configurar impresora
npm run config-printer

# Ver estado
npm run get-printer-id

# Test de impresión
npm run test-print

# Iniciar agente
npm run agent:dev
```

¡Todo listo! 🖨️✨

