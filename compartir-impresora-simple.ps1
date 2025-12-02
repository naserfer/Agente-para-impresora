# Script simple para compartir la impresora Epson
# Ejecuta como Administrador: PowerShell (Administrador)

$printerName = "EPSON TM-T20III Receipt"

Write-Host "🖨️  Compartiendo impresora: $printerName" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar e iniciar el servicio de spooler
Write-Host "1️⃣  Verificando servicio de spooler..." -ForegroundColor Yellow
try {
    $spooler = Get-Service -Name Spooler -ErrorAction Stop
    
    if ($spooler.Status -ne 'Running') {
        Write-Host "   Iniciando servicio de spooler..." -ForegroundColor Yellow
        Start-Service Spooler -ErrorAction Stop
        Start-Sleep -Seconds 3
        Write-Host "✅ Servicio de spooler iniciado" -ForegroundColor Green
    } else {
        Write-Host "✅ Servicio de spooler ya está corriendo" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error al iniciar servicio de spooler: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Asegúrate de ejecutar este script como Administrador" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Verificar que la impresora existe
Write-Host "2️⃣  Buscando impresora..." -ForegroundColor Yellow
try {
    $printer = Get-Printer -Name $printerName -ErrorAction Stop
    Write-Host "✅ Impresora encontrada" -ForegroundColor Green
    
    # 3. Compartir la impresora
    Write-Host ""
    Write-Host "3️⃣  Compartiendo impresora..." -ForegroundColor Yellow
    
    if ($printer.Shared) {
        Write-Host "✅ Impresora ya está compartida" -ForegroundColor Green
        Write-Host "   Nombre de compartido: $($printer.ShareName)" -ForegroundColor White
    } else {
        try {
            Set-Printer -Name $printerName -Shared $true -ShareName "EPSON_TM_T20III" -ErrorAction Stop
            Start-Sleep -Milliseconds 500
            
            # Verificar
            $printer = Get-Printer -Name $printerName
            if ($printer.Shared) {
                Write-Host "✅ Impresora compartida exitosamente" -ForegroundColor Green
                Write-Host "   Nombre de compartido: $($printer.ShareName)" -ForegroundColor White
            } else {
                Write-Host "❌ Error: La impresora no se compartió" -ForegroundColor Red
            }
        } catch {
            Write-Host "❌ Error al compartir: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "   Asegúrate de ejecutar este script como Administrador" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Impresoras disponibles:" -ForegroundColor Yellow
    Get-Printer | Select-Object Name | Format-Table
}

Write-Host ""
Write-Host "💡 Ahora reinicia el agente y prueba imprimir" -ForegroundColor Cyan

