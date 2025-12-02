# Script para probar la impresión
# Verifica que la impresora esté configurada y hace un test de impresión

$printerId = "atlas-burger-printer-1"
$agentUrl = "http://localhost:3001"

Write-Host "🧪 Probando Impresora Epson" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que el agente esté corriendo
Write-Host "1️⃣  Verificando agente..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$agentUrl/health" -Method GET -ErrorAction Stop
    $healthData = $health.Content | ConvertFrom-Json
    Write-Host "✅ Agente está corriendo" -ForegroundColor Green
    Write-Host "   Impresoras configuradas: $($healthData.printers.Count)" -ForegroundColor White
} catch {
    Write-Host "❌ El agente no está corriendo" -ForegroundColor Red
    Write-Host "   Ejecuta: npm run agent:dev" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Verificar estado de la impresora
Write-Host "2️⃣  Verificando estado de la impresora..." -ForegroundColor Yellow
try {
    $status = Invoke-WebRequest -Uri "$agentUrl/api/printer/status/$printerId" -Method GET -ErrorAction Stop
    $statusData = $status.Content | ConvertFrom-Json
    
    Write-Host "   ID: $($statusData.printerId)" -ForegroundColor White
    Write-Host "   Nombre: $($statusData.printerName)" -ForegroundColor White
    Write-Host "   Tipo: $($statusData.type)" -ForegroundColor White
    Write-Host "   Conectada: $($statusData.connected)" -ForegroundColor $(if ($statusData.connected) { "Green" } else { "Yellow" })
    
    if (-not $statusData.connected) {
        Write-Host "   ⚠️  Mensaje: $($statusData.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error al verificar estado: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Hacer test de impresión
Write-Host "3️⃣  Ejecutando test de impresión..." -ForegroundColor Yellow
try {
    $testBody = @{
        printerId = $printerId
    } | ConvertTo-Json
    
    $testResponse = Invoke-WebRequest -Uri "$agentUrl/api/printer/test/$printerId" `
        -Method POST `
        -ContentType "application/json" `
        -Body $testBody `
        -ErrorAction Stop
    
    $testData = $testResponse.Content | ConvertFrom-Json
    
    if ($testData.success) {
        Write-Host "✅ Test de impresión exitoso" -ForegroundColor Green
        Write-Host "   Mensaje: $($testData.message)" -ForegroundColor White
        Write-Host ""
        Write-Host "🎉 ¡La impresora debería haber impreso un ticket de prueba!" -ForegroundColor Green
    } else {
        Write-Host "❌ Test de impresión falló" -ForegroundColor Red
        Write-Host "   Error: $($testData.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error al ejecutar test: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $errorData = $responseBody | ConvertFrom-Json
        Write-Host "   Detalles: $($errorData.error)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✨ Prueba completada" -ForegroundColor Cyan

