# Script para verificar que el agente y la impresora estan conectados

$printerId = "atlas-burger-printer-1"

Write-Host "Verificando conexion..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar agente
Write-Host "1. Agente:" -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET | ConvertFrom-Json
    Write-Host "   OK - Activo (corriendo $([math]::Round($health.uptime, 0)) segundos)" -ForegroundColor Green
    Write-Host "   Impresoras configuradas: $($health.printersCount)" -ForegroundColor Gray
} catch {
    Write-Host "   ERROR - NO esta corriendo" -ForegroundColor Red
    Write-Host "   Ejecuta: npm start" -ForegroundColor Yellow
    exit
}

Write-Host ""

# 2. Verificar impresora configurada
Write-Host "2. Impresora configurada:" -ForegroundColor Yellow
try {
    $status = Invoke-WebRequest -Uri "http://localhost:3001/api/printer/status/$printerId" -Method GET | ConvertFrom-Json
    
    if ($status.connected) {
        Write-Host "   OK - Conectada y funcionando" -ForegroundColor Green
        Write-Host "   Nombre: $($status.printerName)" -ForegroundColor Gray
        Write-Host "   Tipo: $($status.type)" -ForegroundColor Gray
    } else {
        Write-Host "   ADVERTENCIA - Configurada pero NO responde" -ForegroundColor Yellow
        Write-Host "   Error: $($status.error)" -ForegroundColor Red
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "   ERROR - NO configurada" -ForegroundColor Red
        Write-Host "   Configura primero: .\probar-impresora.ps1" -ForegroundColor Yellow
    } else {
        Write-Host "   ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
