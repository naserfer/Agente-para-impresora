# Script para listar todas las impresoras instaladas en Windows

Write-Host "🖨️  Impresoras Instaladas en Windows" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host ""

$printers = Get-Printer | Where-Object { $_.PrinterStatus -ne $null }

if ($printers) {
    Write-Host "Impresoras encontradas:" -ForegroundColor Green
    Write-Host ""
    
    $index = 1
    foreach ($printer in $printers) {
        Write-Host "$index. Nombre: $($printer.Name)" -ForegroundColor White
        Write-Host "   Estado: $($printer.PrinterStatus)" -ForegroundColor Gray
        Write-Host "   Tipo: $($printer.Type)" -ForegroundColor Gray
        Write-Host "   Puerto: $($printer.PortName)" -ForegroundColor Gray
        Write-Host "   Driver: $($printer.DriverName)" -ForegroundColor Gray
        Write-Host ""
        $index++
    }
    
    Write-Host "💡 Para usar una impresora en el agente:" -ForegroundColor Yellow
    Write-Host "   1. Copia el 'Nombre' de la impresora Epson" -ForegroundColor White
    Write-Host "   2. Configúrala usando el endpoint /api/printer/configure" -ForegroundColor White
    Write-Host "   3. O usa el script: node packages/agent/examples/test-print.js" -ForegroundColor White
} else {
    Write-Host "❌ No se encontraron impresoras instaladas" -ForegroundColor Red
    Write-Host "   Asegúrate de que la impresora esté instalada en Windows" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 También puedes listar impresoras USB desde el agente:" -ForegroundColor Cyan
Write-Host "   Invoke-WebRequest -Uri 'http://localhost:3001/api/printer/list-usb' -Method GET" -ForegroundColor White

