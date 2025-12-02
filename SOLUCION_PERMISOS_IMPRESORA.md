# 🔧 Solución: Permisos de Impresora

## ✅ Estado Actual

Tu impresora **YA ESTÁ CONFIGURADA** en el agente:
- **Printer ID**: `atlas-burger-printer-1`
- **Nombre**: `EPSON TM-T20III Receipt`
- **Tipo**: USB

## ⚠️ Problema Detectado

El servicio de spooler de Windows no está corriendo o no tienes permisos para accederlo. Esto es necesario para que el agente pueda imprimir.

## 🚀 Soluciones

### Opción 1: Ejecutar el Agente como Administrador (Recomendado)

1. **Cierra el agente actual** (Ctrl+C en la terminal donde está corriendo)

2. **Abre PowerShell como Administrador:**
   - Presiona `Win + X`
   - Selecciona "Windows PowerShell (Administrador)" o "Terminal (Administrador)"

3. **Navega a la carpeta del proyecto:**
   ```powershell
   cd "C:\Users\Naser\OneDrive\Escritorio\agente"
   ```

4. **Inicia el servicio de spooler:**
   ```powershell
   Start-Service Spooler
   ```

5. **Comparte la impresora:**
   ```powershell
   Set-Printer -Name "EPSON TM-T20III Receipt" -Shared $true -ShareName "EPSON_TM_T20III"
   ```

6. **Inicia el agente:**
   ```powershell
   npm run agent:dev
   ```

### Opción 2: Compartir la Impresora Manualmente

1. **Abre Configuración de Windows:**
   - Presiona `Win + I`
   - Ve a "Dispositivos" > "Impresoras y escáneres"

2. **Encuentra tu impresora:**
   - Busca "EPSON TM-T20III Receipt"
   - Haz clic en ella

3. **Comparte la impresora:**
   - Haz clic en "Administrar"
   - Haz clic en "Propiedades de la impresora"
   - Ve a la pestaña "Compartir"
   - Marca "Compartir esta impresora"
   - Nombre de compartido: `EPSON_TM_T20III`
   - Haz clic en "Aceptar"

### Opción 3: Usar el Script Automático (Como Administrador)

1. **Abre PowerShell como Administrador**

2. **Ejecuta:**
   ```powershell
   cd "C:\Users\Naser\OneDrive\Escritorio\agente"
   .\compartir-impresora.ps1
   ```

## 🧪 Verificar que Funciona

Después de compartir la impresora, prueba:

```powershell
# Verificar que la impresora está compartida
Get-Printer -Name "EPSON TM-T20III Receipt" | Select-Object Name, Shared, ShareName

# Probar el estado en el agente
Invoke-WebRequest -Uri "http://localhost:3001/api/printer/status/atlas-burger-printer-1" | ConvertFrom-Json
```

## 📝 Notas Importantes

- **El agente NO necesita ejecutarse como administrador** si la impresora está compartida
- **La impresora debe estar compartida** para que el método alternativo funcione
- **El servicio de spooler debe estar corriendo** (normalmente se inicia automáticamente)

## 🔍 Verificar Estado del Servicio

```powershell
Get-Service Spooler | Select-Object Name, Status, StartType
```

Si el estado no es "Running", inícialo como administrador:
```powershell
Start-Service Spooler
```

