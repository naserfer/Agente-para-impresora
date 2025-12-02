# 🔧 Solución: Error de Impresión

## ❌ Error Actual

```
Error: No se pudo imprimir en EPSON TM-T20III Receipt. 
Asegúrate de que la impresora esté compartida o ejecuta el agente como administrador.
```

## ✅ Solución Rápida

### Opción 1: Compartir la Impresora (Recomendado)

**Ejecuta este comando como Administrador:**

1. Abre **PowerShell como Administrador**:
   - Presiona `Win + X`
   - Selecciona "Windows PowerShell (Administrador)" o "Terminal (Administrador)"

2. Ejecuta:
   ```powershell
   cd "C:\Users\Naser\OneDrive\Escritorio\agente"
   .\compartir-impresora-simple.ps1
   ```

O manualmente:
```powershell
Set-Printer -Name "EPSON TM-T20III Receipt" -Shared $true -ShareName "EPSON_TM_T20III"
```

### Opción 2: Compartir Manualmente desde Windows

1. Abre **Configuración de Windows** (`Win + I`)
2. Ve a **Dispositivos** > **Impresoras y escáneres**
3. Haz clic en **"EPSON TM-T20III Receipt"**
4. Haz clic en **"Administrar"**
5. Haz clic en **"Propiedades de la impresora"**
6. Ve a la pestaña **"Compartir"**
7. Marca **"Compartir esta impresora"**
8. Nombre de compartido: `EPSON_TM_T20III`
9. Haz clic en **"Aceptar"**

### Opción 3: Ejecutar el Agente como Administrador

Si no quieres compartir la impresora:

1. Cierra el agente actual (Ctrl+C)
2. Abre PowerShell como Administrador
3. Navega a la carpeta del proyecto
4. Ejecuta: `npm run agent:dev`

## 🔄 Después de Compartir

1. **Reinicia el agente** (si está corriendo):
   - Presiona `Ctrl+C` en la terminal del agente
   - Ejecuta: `npm run agent:dev`

2. **Prueba imprimir** de nuevo

## 🧪 Verificar que Funciona

```powershell
# Verificar que está compartida
Get-Printer -Name "EPSON TM-T20III Receipt" | Select-Object Name, Shared, ShareName

# Probar estado en el agente
Invoke-WebRequest -Uri "http://localhost:3001/api/printer/status/atlas-burger-printer-1" | ConvertFrom-Json
```

## 📝 Cambios Realizados

He mejorado el código para que:

1. ✅ **Intente compartir automáticamente** la impresora si no está compartida
2. ✅ **Mensajes de error más claros** que indican exactamente qué hacer
3. ✅ **Múltiples métodos de impresión** antes de fallar

## ⚠️ Nota Importante

El código ahora intenta compartir automáticamente, pero puede fallar si no tienes permisos. En ese caso, usa una de las opciones arriba.

