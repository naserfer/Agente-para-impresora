# Script para crear archivos .env desde los ejemplos

Write-Host "🔧 Configurando archivos .env..." -ForegroundColor Cyan
Write-Host ""

# Crear .env para el agente
$agentEnvExample = "packages/agent/.env.example"
$agentEnv = "packages/agent/.env"

if (Test-Path $agentEnvExample) {
    if (-not (Test-Path $agentEnv)) {
        Copy-Item $agentEnvExample $agentEnv
        Write-Host "✅ Creado: $agentEnv" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Ya existe: $agentEnv (no se sobrescribió)" -ForegroundColor Yellow
    }
} else {
    # Crear .env.example si no existe
    $envContent = @"
# Configuración del Agente de Impresión
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGIN=*
DEFAULT_PRINTER_TYPE=usb
DEFAULT_PRINTER_IP=192.168.1.100
DEFAULT_PRINTER_PORT=9100
LOG_LEVEL=info
"@
    New-Item -ItemType File -Path $agentEnvExample -Force | Out-Null
    Set-Content -Path $agentEnvExample -Value $envContent
    Write-Host "📝 Creado: $agentEnvExample" -ForegroundColor Cyan
    
    if (-not (Test-Path $agentEnv)) {
        Copy-Item $agentEnvExample $agentEnv
        Write-Host "✅ Creado: $agentEnv" -ForegroundColor Green
    }
}

# Crear .env para el desktop
$desktopEnvExample = "packages/desktop/.env.example"
$desktopEnv = "packages/desktop/.env"

if (Test-Path $desktopEnvExample) {
    if (-not (Test-Path $desktopEnv)) {
        Copy-Item $desktopEnvExample $desktopEnv
        Write-Host "✅ Creado: $desktopEnv" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Ya existe: $desktopEnv (no se sobrescribió)" -ForegroundColor Yellow
    }
} else {
    # Crear .env.example si no existe
    $envContent = @"
# Configuración del Desktop App
VITE_PORT=5173
VITE_AGENT_URL=http://localhost:3001
"@
    New-Item -ItemType File -Path $desktopEnvExample -Force | Out-Null
    Set-Content -Path $desktopEnvExample -Value $envContent
    Write-Host "📝 Creado: $desktopEnvExample" -ForegroundColor Cyan
    
    if (-not (Test-Path $desktopEnv)) {
        Copy-Item $desktopEnvExample $desktopEnv
        Write-Host "✅ Creado: $desktopEnv" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "✨ Configuración completada!" -ForegroundColor Green
Write-Host ""
Write-Host "Puertos configurados:" -ForegroundColor Cyan
Write-Host "  - Agente: 3001 (configurable en packages/agent/.env)" -ForegroundColor White
Write-Host "  - Desktop: 5173 (configurable en packages/desktop/.env)" -ForegroundColor White
Write-Host ""
Write-Host "Para cambiar los puertos, edita los archivos .env correspondientes." -ForegroundColor Yellow

