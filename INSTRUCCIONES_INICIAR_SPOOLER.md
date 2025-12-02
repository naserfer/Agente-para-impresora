# 🔧 Instrucciones: Iniciar Servicio de Spooler

## ⚠️ Problema

El servicio de spooler de impresoras está detenido y necesita permisos de administrador para iniciarse.

## ✅ Solución: Ejecutar como Administrador

### Opción 1: Usar el Script (Recomendado)

1. **Cierra PowerShell actual**

2. **Abre PowerShell como Administrador:**
   - Presiona `Win + X`
   - Selecciona **"Terminal (Administrador)"** o **"Windows PowerShell (Administrador)"**

3. **Navega a la carpeta:**
   ```powershell
   cd "C:\Users\Naser\OneDrive\Escritorio\agente"
   ```

4. **Ejecuta el script:**
   ```powershell
   .\iniciar-spooler.ps1
   ```

5. **Luego comparte la impresora:**
   ```powershell
   .\compartir-impresora-simple.ps1
   ```

### Opción 2: Manualmente desde PowerShell (Administrador)

```powershell
# Iniciar el servicio
Start-Service Spooler

# Verificar que está corriendo
Get-Service Spooler

# Compartir la impresora
Set-Printer -Name "EPSON TM-T20III Receipt" -Shared $true -ShareName "EPSON_TM_T20III"

# Verificar
Get-Printer -Name "EPSON TM-T20III Receipt" | Select-Object Name, Shared, ShareName
```

### Opción 3: Desde la Interfaz de Windows

1. **Abre el Administrador de Servicios:**
   - Presiona `Win + R`
   - Escribe: `services.msc`
   - Presiona Enter

2. **Busca "Spooler de impresión"** o **"Print Spooler"**

3. **Haz clic derecho** > **Iniciar**

4. **Opcional:** Haz clic derecho > **Propiedades** > **Tipo de inicio: Automático**

5. **Luego comparte la impresora** desde Configuración de Windows

## 🧪 Verificar que Funciona

Después de iniciar el servicio y compartir la impresora:

```powershell
# Verificar servicio
Get-Service Spooler

# Verificar impresora compartida
Get-Printer -Name "EPSON TM-T20III Receipt" | Select-Object Name, Shared, ShareName
```

## 📝 Nota Importante

- El servicio de spooler **debe estar corriendo** para que Windows pueda gestionar impresoras
- Una vez iniciado, normalmente se mantiene corriendo
- Si se detiene frecuentemente, verifica que el tipo de inicio esté en "Automático"

## 🔄 Después de Configurar

1. **Reinicia el agente** (si está corriendo):
   ```powershell
   # En la terminal del agente, presiona Ctrl+C
   # Luego reinicia:
   npm run agent:dev
   ```

2. **Prueba imprimir** de nuevo

