# Script para probar la impresora Epson TM-T20

Write-Host "🖨️  Configurando impresora..." -ForegroundColor Cyan

# Paso 1: Configurar la impresora
$configBody = @{
    printerId = "atlas-burger-printer-1"
    type = "usb"
} | ConvertTo-Json

try {
    $configResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/printer/configure" `
        -Method POST `
        -ContentType "application/json" `
        -Body $configBody
    
    $configResult = $configResponse.Content | ConvertFrom-Json
    Write-Host "✅ Impresora configurada: $($configResult.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error al configurar: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "📄 Imprimiendo ticket de prueba..." -ForegroundColor Cyan

# Paso 2: Probar impresión
$printBody = @{
    printerId = "atlas-burger-printer-1"
    tipo = "cocina"
    data = @{
        numeroPedido = 1
        tipoPedido = "local"
        lomiteriaNombre = "Atlas Burger"
        items = @(
            @{
                nombre = "Smash Bacon"
                cantidad = 1
                personalizaciones = "sin cebolla"
            },
            @{
                nombre = "Papas Grandes"
                cantidad = 1
            }
        )
        total = 35000
        fecha = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
} | ConvertTo-Json -Depth 10

try {
    $printResponse = Invoke-WebRequest -Uri "http://localhost:3001/print" `
        -Method POST `
        -ContentType "application/json" `
        -Body $printBody
    
    $printResult = $printResponse.Content | ConvertFrom-Json
    Write-Host "✅ $($printResult.message)" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 ¡Revisa la impresora! Debería haber impreso el ticket." -ForegroundColor Green
} catch {
    Write-Host "❌ Error al imprimir: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Detalles: $responseBody" -ForegroundColor Yellow
    }
}

