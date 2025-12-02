# Script para iniciar el servicio de spooler
# DEBE ejecutarse como Administrador

Write-Host "🔄 Iniciando servicio de spooler de impresoras..." -ForegroundColor Cyan
Write-Host ""

try {
    $spooler = Get-Service -Name Spooler -ErrorAction Stop
    
    Write-Host "Estado actual: $($spooler.Status)" -ForegroundColor Yellow
    
    if ($spooler.Status -eq 'Running') {
        Write-Host "✅ El servicio ya está corriendo" -ForegroundColor Green
    } else {
        Write-Host "Iniciando servicio..." -ForegroundColor Yellow
        Start-Service Spooler -ErrorAction Stop
        Start-Sleep -Seconds 2
        
        $spooler = Get-Service -Name Spooler
        if ($spooler.Status -eq 'Running') {
            Write-Host "✅ Servicio iniciado exitosamente" -ForegroundColor Green
        } else {
            Write-Host "❌ Error: El servicio no se inició" -ForegroundColor Red
            Write-Host "   Estado: $($spooler.Status)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Configuración:" -ForegroundColor Cyan
    Write-Host "  - Tipo de inicio: $($spooler.StartType)" -ForegroundColor White
    
    if ($spooler.StartType -eq 'Disabled') {
        Write-Host ""
        Write-Host "⚠️  El servicio está deshabilitado" -ForegroundColor Yellow
        Write-Host "   Para habilitarlo permanentemente:" -ForegroundColor Yellow
        Write-Host "   Set-Service -Name Spooler -StartupType Automatic" -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Soluciones:" -ForegroundColor Yellow
    Write-Host "   1. Ejecuta este script como Administrador" -ForegroundColor White
    Write-Host "   2. Verifica que el servicio Spooler existe" -ForegroundColor White
    Write-Host "   3. Intenta iniciarlo manualmente desde Servicios (services.msc)" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "✨ Listo. Ahora puedes ejecutar compartir-impresora-simple.ps1" -ForegroundColor Green

