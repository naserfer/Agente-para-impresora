# Script de diagnóstico para verificar el puerto del agente

param(
    [int]$Port = 3001
)

Write-Host "🔍 Diagnóstico del Puerto $Port" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Cyan
Write-Host ""

# 1. Verificar si hay procesos escuchando en el puerto
Write-Host "1. Verificando procesos en el puerto $Port..." -ForegroundColor Yellow
$portInfo = netstat -ano | findstr ":$Port" | findstr "LISTENING"

if ($portInfo) {
    Write-Host "   ✅ Puerto $Port está en uso" -ForegroundColor Green
    foreach ($line in $portInfo) {
        if ($line -match '\s+(\d+)$') {
            $processId = [int]$matches[1]
            try {
                $process = Get-Process -Id $processId -ErrorAction Stop
                Write-Host "   - PID: $processId | Nombre: $($process.ProcessName)" -ForegroundColor White
            } catch {
                Write-Host "   - PID: $processId (proceso no encontrado)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "   ❌ Puerto $Port NO está en uso" -ForegroundColor Red
}
Write-Host ""

# 2. Intentar conexión HTTP
Write-Host "2. Intentando conexión HTTP a localhost:$Port..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port/" -Method GET -TimeoutSec 3 -ErrorAction Stop
    Write-Host "   ✅ Conexión exitosa (Status: $($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Respuesta: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ No se puede conectar: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -like "*conectarse*" -or $_.Exception.Message -like "*refused*") {
        Write-Host "   💡 El servidor no está escuchando o está bloqueado" -ForegroundColor Yellow
    }
}
Write-Host ""

# 3. Verificar firewall
Write-Host "3. Verificando reglas de firewall..." -ForegroundColor Yellow
try {
    $firewallRules = Get-NetFirewallRule | Where-Object { 
        $_.DisplayName -like "*$Port*" -or 
        $_.DisplayName -like "*Node*" -or 
        $_.DisplayName -like "*3001*"
    }
    
    if ($firewallRules) {
        Write-Host "   Reglas de firewall encontradas:" -ForegroundColor White
        foreach ($rule in $firewallRules) {
            Write-Host "   - $($rule.DisplayName) | Estado: $($rule.Enabled)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  No se encontraron reglas específicas para el puerto $Port" -ForegroundColor Yellow
        Write-Host "   💡 Puede que el firewall esté bloqueando la conexión" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  No se pudo verificar firewall: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# 4. Verificar si el agente está corriendo (proceso Node.js)
Write-Host "4. Verificando procesos de Node.js..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   ✅ Procesos de Node.js encontrados:" -ForegroundColor Green
    foreach ($proc in $nodeProcesses) {
        Write-Host "   - PID: $($proc.Id) | Iniciado: $($proc.StartTime)" -ForegroundColor White
    }
} else {
    Write-Host "   ❌ No hay procesos de Node.js corriendo" -ForegroundColor Red
}
Write-Host ""

# 5. Verificar configuración del agente
Write-Host "5. Verificando configuración del agente..." -ForegroundColor Yellow
$envFile = "packages/agent/.env"
if (Test-Path $envFile) {
    Write-Host "   ✅ Archivo .env encontrado" -ForegroundColor Green
    $envContent = Get-Content $envFile
    $portConfig = $envContent | Select-String "PORT"
    $hostConfig = $envContent | Select-String "HOST"
    
    if ($portConfig) {
        Write-Host "   $portConfig" -ForegroundColor White
    }
    if ($hostConfig) {
        Write-Host "   $hostConfig" -ForegroundColor White
    }
} else {
    Write-Host "   ⚠️  Archivo .env no encontrado (usando valores por defecto)" -ForegroundColor Yellow
    Write-Host "   Puerto por defecto: 3001" -ForegroundColor Gray
    Write-Host "   Host por defecto: 0.0.0.0" -ForegroundColor Gray
}
Write-Host ""

# 6. Recomendaciones
Write-Host "📋 Recomendaciones:" -ForegroundColor Cyan
Write-Host "   1. Si el puerto está en uso pero no puedes conectar:" -ForegroundColor White
Write-Host "      - Verifica el firewall de Windows" -ForegroundColor Gray
Write-Host "      - Asegúrate de que el agente esté escuchando en 0.0.0.0 o localhost" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Si el puerto NO está en uso:" -ForegroundColor White
Write-Host "      - El agente no está corriendo o no inició correctamente" -ForegroundColor Gray
Write-Host "      - Revisa los logs del agente" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Para permitir conexiones en Windows Firewall:" -ForegroundColor White
Write-Host "      netsh advfirewall firewall add rule name='Node.js Agent' dir=in action=allow protocol=TCP localport=$Port" -ForegroundColor Gray

