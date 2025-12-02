# Script para configurar la impresora usando la IP de la máquina
# Útil cuando localhost no funciona pero el agente está en 0.0.0.0

param(
    [string]$PrinterId = "atlas-burger-printer-1",
    [string]$PrinterName = "EPSON TM-T20III Receipt",
    [string]$Host = "localhost"
)

Write-Host "🖨️  Configurando Impresora Epson en el Agente" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host ""

# Si no se especifica host, intentar obtener la IP local
if ($Host -eq "localhost") {
    Write-Host "Obteniendo IP local de la máquina..." -ForegroundColor Yellow
    try {
        $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
            $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" 
        } | Select-Object -First 1).IPAddress
        
        if ($ipAddress) {
            Write-Host "   IP encontrada: $ipAddress" -ForegroundColor Green
            $Host = $ipAddress
        } else {
            Write-Host "   No se encontró IP, usando localhost" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   Error al obtener IP, usando localhost" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Configuración:" -ForegroundColor Yellow
Write-Host "  - Host: $Host" -ForegroundColor White
Write-Host "  - Puerto: 3001" -ForegroundColor White
Write-Host "  - Printer ID: $PrinterId" -ForegroundColor White
Write-Host "  - Nombre: $PrinterName" -ForegroundColor White
Write-Host "  - Tipo: USB" -ForegroundColor White
Write-Host ""

# Verificar que el agente esté corriendo
Write-Host "Verificando que el agente esté corriendo..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://${Host}:3001/health" -Method GET -ErrorAction Stop
    Write-Host "✅ Agente está corriendo en http://${Host}:3001" -ForegroundColor Green
} catch {
    Write-Host "❌ El agente no está corriendo o no es accesible desde $Host" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Prueba con:" -ForegroundColor Yellow
    Write-Host "   - localhost" -ForegroundColor White
    Write-Host "   - 127.0.0.1" -ForegroundColor White
    Write-Host "   - Tu IP local (ej: 192.168.1.100)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Ejemplo: .\configurar-impresora-con-ip.ps1 -Host 192.168.1.100" -ForegroundColor Cyan
    exit 1
}

Write-Host ""
Write-Host "Configurando impresora..." -ForegroundColor Yellow

# Crear el body de la petición
$body = @{
    printerId = $PrinterId
    type = "usb"
    printerName = $PrinterName
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://${Host}:3001/api/printer/configure" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    $result = $response.Content | ConvertFrom-Json
    
    Write-Host "✅ Impresora configurada exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Detalles:" -ForegroundColor Cyan
    Write-Host "  - ID: $($result.printerId)" -ForegroundColor White
    Write-Host "  - Mensaje: $($result.message)" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Ahora puedes usar este printerId en tus peticiones de impresión:" -ForegroundColor Yellow
    Write-Host "   POST http://${Host}:3001/print" -ForegroundColor White
    Write-Host "   Body: { `"printerId`": `"$PrinterId`", ... }" -ForegroundColor White
    
} catch {
    Write-Host "❌ Error al configurar la impresora" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Detalles: $responseBody" -ForegroundColor Yellow
    }
    
    exit 1
}

Write-Host ""
Write-Host "🧪 Probando la conexión..." -ForegroundColor Yellow
try {
    $statusResponse = Invoke-WebRequest -Uri "http://${Host}:3001/api/printer/status/$PrinterId" -Method GET -ErrorAction Stop
    $status = $statusResponse.Content | ConvertFrom-Json
    
    if ($status.connected) {
        Write-Host "✅ Impresora conectada y funcionando" -ForegroundColor Green
        Write-Host "   Nombre: $($status.printerName)" -ForegroundColor White
    } else {
        Write-Host "⚠️  Impresora configurada pero no responde" -ForegroundColor Yellow
        Write-Host "   Verifica que esté encendida y conectada" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  No se pudo verificar el estado de la impresora" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Configuración completada" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Endpoint de impresión:" -ForegroundColor Cyan
Write-Host "   POST http://${Host}:3001/print" -ForegroundColor White

