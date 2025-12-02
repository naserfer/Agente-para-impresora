# Script para verificar qué proceso está usando un puerto

param(
    [int]$Port = 3001
)

Write-Host "🔍 Verificando qué proceso usa el puerto $Port..." -ForegroundColor Cyan
Write-Host ""

$portInfo = netstat -ano | findstr ":$Port" | findstr "LISTENING"

if ($portInfo) {
    Write-Host "Puerto $Port está en uso:" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($line in $portInfo) {
        if ($line -match '\s+(\d+)$') {
            $processId = [int]$matches[1]
            
            try {
                $process = Get-Process -Id $processId -ErrorAction Stop
                Write-Host "  PID: $processId" -ForegroundColor White
                Write-Host "  Nombre: $($process.ProcessName)" -ForegroundColor White
                Write-Host "  Ruta: $($process.Path)" -ForegroundColor Gray
                Write-Host "  Iniciado: $($process.StartTime)" -ForegroundColor Gray
                Write-Host ""
            } catch {
                Write-Host "  PID: $processId (proceso no encontrado)" -ForegroundColor Yellow
                Write-Host ""
            }
        }
    }
    
    Write-Host "Para detener estos procesos, ejecuta:" -ForegroundColor Cyan
    Write-Host "  npm run stop" -ForegroundColor White
    Write-Host "  o" -ForegroundColor White
    Write-Host "  powershell -File stop-agent.ps1" -ForegroundColor White
} else {
    Write-Host "✅ Puerto $Port está libre" -ForegroundColor Green
}

