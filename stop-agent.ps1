# Script para detener el agente y liberar el puerto
# Por defecto libera el puerto 3001, pero puedes especificar otro con: .\stop-agent.ps1 -Port 3002

param(
    [int]$Port = 3001
)

Write-Host "🛑 Deteniendo procesos en el puerto $Port..." -ForegroundColor Yellow
Write-Host ""

# Función para obtener PIDs que usan un puerto
function Get-ProcessIdsByPort {
    param([int]$PortNumber)
    
    $processIds = @()
    $netstatOutput = netstat -ano | findstr ":$PortNumber" | findstr "LISTENING"
    
    foreach ($line in $netstatOutput) {
        if ($line -match '\s+(\d+)$') {
            $processIds += [int]$matches[1]
        }
    }
    
    return $processIds | Select-Object -Unique
}

# Obtener todos los PIDs que usan el puerto
$processIds = Get-ProcessIdsByPort -PortNumber $Port

if ($processIds.Count -gt 0) {
    Write-Host "Procesos encontrados usando el puerto $Port:" -ForegroundColor Cyan
    foreach ($processId in $processIds) {
        try {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                $processName = $process.ProcessName
                Write-Host "  - PID: $processId | Nombre: $processName" -ForegroundColor White
                
                # Intentar detener con Stop-Process primero
                try {
                    Stop-Process -Id $processId -Force -ErrorAction Stop
                    Write-Host "    ✅ Detenido con Stop-Process" -ForegroundColor Green
                } catch {
                    # Si falla, usar taskkill (más agresivo)
                    Write-Host "    ⚠️  Stop-Process falló, usando taskkill..." -ForegroundColor Yellow
                    $killResult = taskkill /F /PID $processId 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "    ✅ Detenido con taskkill" -ForegroundColor Green
                    } else {
                        Write-Host "    ❌ Error al detener: $killResult" -ForegroundColor Red
                    }
                }
            }
        } catch {
            Write-Host "  - PID: $processId (proceso no encontrado o ya terminado)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "No hay procesos usando el puerto $Port" -ForegroundColor Gray
}

# También detener todos los procesos de Node.js que puedan estar relacionados
Write-Host ""
Write-Host "Deteniendo procesos de Node.js..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    foreach ($nodeProcess in $nodeProcesses) {
        try {
            Stop-Process -Id $nodeProcess.Id -Force -ErrorAction Stop
            Write-Host "  ✅ Node.js PID $($nodeProcess.Id) detenido" -ForegroundColor Green
        } catch {
            try {
                taskkill /F /PID $nodeProcess.Id | Out-Null
                Write-Host "  ✅ Node.js PID $($nodeProcess.Id) detenido (taskkill)" -ForegroundColor Green
            } catch {
                Write-Host "  ⚠️  No se pudo detener Node.js PID $($nodeProcess.Id)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  No hay procesos de Node.js ejecutándose" -ForegroundColor Gray
}

# Esperar un momento para que los puertos se liberen
Start-Sleep -Seconds 1

# Verificar que el puerto esté libre
Write-Host ""
Write-Host "Verificando que el puerto $Port esté libre..." -ForegroundColor Cyan
$remainingProcesses = Get-ProcessIdsByPort -PortNumber $Port

if ($remainingProcesses.Count -eq 0) {
    Write-Host "✅ Puerto $Port liberado correctamente" -ForegroundColor Green
} else {
    Write-Host "⚠️  Advertencia: El puerto $Port aún está en uso por:" -ForegroundColor Yellow
    foreach ($pid in $remainingProcesses) {
        Write-Host "  - PID: $pid" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Intenta ejecutar manualmente:" -ForegroundColor Yellow
    Write-Host "  taskkill /F /PID <PID>" -ForegroundColor White
}

Write-Host ""
Write-Host "✨ Proceso completado. Puedes ejecutar 'npm run dev' ahora." -ForegroundColor Green

