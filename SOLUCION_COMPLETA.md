# ✅ Solución Completa: Error de Impresión

## 📋 Resumen del Problema

Tu impresora está configurada correctamente en el agente, pero hay dos problemas:

1. ❌ **Servicio de spooler detenido** - Necesita iniciarse como administrador
2. ❌ **Impresora no compartida** - Necesita compartirse para que el agente pueda imprimir

## 🚀 Solución Paso a Paso

### Paso 1: Iniciar el Servicio de Spooler

**IMPORTANTE: Debes ejecutar esto como Administrador**

1. **Cierra PowerShell actual**

2. **Abre PowerShell como Administrador:**
   - Presiona `Win + X`
   - Selecciona **"Terminal (Administrador)"**

3. **Ejecuta:**
   ```powershell
   cd "C:\Users\Naser\OneDrive\Escritorio\agente"
   .\iniciar-spooler.ps1
   ```

   O manualmente:
   ```powershell
   Start-Service Spooler
   Get-Service Spooler  # Verificar que está Running
   ```

### Paso 2: Compartir la Impresora

**Sigue en PowerShell como Administrador:**

```powershell
Set-Printer -Name "EPSON TM-T20III Receipt" -Shared $true -ShareName "EPSON_TM_T20III"
```

O ejecuta el script:
```powershell
.\compartir-impresora-simple.ps1
```

### Paso 3: Verificar

```powershell
# Verificar servicio
Get-Service Spooler | Select-Object Status

# Verificar impresora compartida
Get-Printer -Name "EPSON TM-T20III Receipt" | Select-Object Name, Shared, ShareName
```

Deberías ver:
- **Status**: Running
- **Shared**: True
- **ShareName**: EPSON_TM_T20III

### Paso 4: Reiniciar el Agente

1. **En la terminal donde corre el agente**, presiona `Ctrl+C`

2. **Reinicia el agente:**
   ```powershell
   npm run agent:dev
   ```

3. **Prueba imprimir** de nuevo

## 🎯 Solución Alternativa: Compartir Manualmente

Si prefieres no usar PowerShell:

1. **Iniciar servicio:**
   - `Win + R` > `services.msc` > Buscar "Spooler" > Iniciar

2. **Compartir impresora:**
   - `Win + I` > Dispositivos > Impresoras y escáneres
   - Clic en "EPSON TM-T20III Receipt"
   - Administrar > Propiedades de la impresora
   - Pestaña "Compartir"
   - Marcar "Compartir esta impresora"
   - Nombre: `EPSON_TM_T20III`
   - Aceptar

## ✅ Estado Actual

- ✅ Impresora configurada en el agente: `atlas-burger-printer-1`
- ✅ Código mejorado para compartir automáticamente
- ⚠️ Pendiente: Iniciar servicio de spooler (requiere admin)
- ⚠️ Pendiente: Compartir impresora (requiere admin)

## 📝 Notas

- Una vez iniciado, el servicio de spooler normalmente se mantiene corriendo
- La impresora solo necesita compartirse una vez
- El agente ahora intenta compartir automáticamente, pero necesita permisos

## 🆘 Si Sigue Fallando

1. Verifica que el servicio esté corriendo: `Get-Service Spooler`
2. Verifica que la impresora esté compartida: `Get-Printer -Name "EPSON TM-T20III Receipt"`
3. Verifica que la impresora esté encendida y conectada
4. Prueba ejecutar el agente como administrador (no es necesario si la impresora está compartida)

