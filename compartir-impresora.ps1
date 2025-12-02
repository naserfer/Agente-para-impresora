# Script para compartir la impresora Epson automáticamente
# Esto es necesario para que el agente pueda imprimir

Write-Host "🖨️  Configurando Impresora Epson para el Agente" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host ""

# 1. Iniciar el servicio de spooler
Write-Host "1️⃣  Iniciando servicio de spooler..." -ForegroundColor Yellow
try {
    $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
    if ($spooler.Status -ne 'Running') {
        Start-Service Spooler
        Start-Sleep -Seconds 2
        Write-Host "✅ Servicio de spooler iniciado" -ForegroundColor Green
    } else {
        Write-Host "✅ Servicio de spooler ya está corriendo" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error al iniciar servicio de spooler: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Intenta ejecutar este script como Administrador" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Buscar la impresora Epson
Write-Host "2️⃣  Buscando impresora Epson..." -ForegroundColor Yellow
$printerName = "EPSON TM-T20III Receipt"

try {
    $printer = Get-Printer -Name $printerName -ErrorAction Stop
    Write-Host "✅ Impresora encontrada: $printerName" -ForegroundColor Green
    Write-Host "   Estado: $($printer.PrinterStatus)" -ForegroundColor White
    Write-Host "   Compartida: $($printer.Shared)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Impresora no encontrada: $printerName" -ForegroundColor Red
    Write-Host ""
    Write-Host "Impresoras disponibles:" -ForegroundColor Yellow
    Get-Printer | Select-Object Name, PrinterStatus | Format-Table
    exit 1
}

# 3. Compartir la impresora si no está compartida
Write-Host "3️⃣  Compartiendo impresora..." -ForegroundColor Yellow

if (-not $printer.Shared) {
    try {
        $shareName = "EPSON_TM_T20III"
        Set-Printer -Name $printerName -Shared $true -ShareName $shareName
        Start-Sleep -Seconds 1
        
        $printer = Get-Printer -Name $printerName
        if ($printer.Shared) {
            Write-Host "✅ Impresora compartida exitosamente" -ForegroundColor Green
            Write-Host "   Nombre de compartido: $($printer.ShareName)" -ForegroundColor White
        } else {
            Write-Host "⚠️  No se pudo compartir la impresora" -ForegroundColor Yellow
            Write-Host "   Intenta ejecutar este script como Administrador" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Error al compartir impresora: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Intenta ejecutar este script como Administrador" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Impresora ya está compartida" -ForegroundColor Green
    Write-Host "   Nombre de compartido: $($printer.ShareName)" -ForegroundColor White
}

Write-Host ""
Write-Host "✨ Configuración completada" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Ahora puedes ejecutar: npm run config-printer" -ForegroundColor Cyan

