# 🔧 Solución: Problemas de Reconocimiento del Puerto

## Problema

El agente está corriendo pero el desktop no puede conectarse al puerto expuesto.

## Posibles Causas

### 1. Firewall de Windows
El firewall puede estar bloqueando el puerto 3001.

**Solución:**
```powershell
# Permitir el puerto en el firewall
netsh advfirewall firewall add rule name="Node.js Agent Port 3001" dir=in action=allow protocol=TCP localport=3001

# O desde la interfaz gráfica:
# 1. Abre "Firewall de Windows Defender"
# 2. Configuración avanzada
# 3. Reglas de entrada > Nueva regla
# 4. Puerto > TCP > 3001 > Permitir
```

### 2. El agente escucha en 0.0.0.0 pero se conecta a localhost
Aunque `0.0.0.0` debería funcionar, a veces hay problemas en Windows.

**Solución:**
- El código ya intenta con `localhost` y `127.0.0.1`
- Verifica que el agente realmente esté escuchando

### 3. El agente no inició correctamente
El proceso puede estar corriendo pero el servidor HTTP no inició.

**Verificación:**
```powershell
# Ejecuta el diagnóstico
powershell -File diagnostico-puerto.ps1

# O verifica manualmente
netstat -ano | findstr :3001
```

### 4. Puerto ocupado por otro proceso
Otro proceso puede estar usando el puerto 3001.

**Solución:**
```powershell
# Ver qué está usando el puerto
netstat -ano | findstr :3001

# Detener procesos
npm run stop
```

## Diagnóstico

Ejecuta el script de diagnóstico:

```powershell
powershell -File diagnostico-puerto.ps1
```

Este script verifica:
1. ✅ Si hay procesos en el puerto
2. ✅ Si se puede conectar vía HTTP
3. ✅ Reglas de firewall
4. ✅ Procesos de Node.js
5. ✅ Configuración del agente

## Soluciones Rápidas

### Opción 1: Verificar que el agente esté escuchando

```powershell
# Desde el navegador o PowerShell
Invoke-WebRequest -Uri "http://localhost:3001/" -Method GET
```

Si funciona, el problema está en el código de conexión del desktop.

### Opción 2: Cambiar el host del agente

Edita `packages/agent/.env`:
```env
HOST=127.0.0.1  # En lugar de 0.0.0.0
PORT=3001
```

Luego reinicia el agente.

### Opción 3: Verificar logs del agente

Revisa los logs para ver si hay errores al iniciar:
- `packages/agent/logs/combined.log`
- `packages/agent/logs/error.log`

## Verificación Manual

1. **Verificar que el puerto esté escuchando:**
```powershell
netstat -ano | findstr :3001 | findstr LISTENING
```

2. **Probar conexión HTTP:**
```powershell
curl http://localhost:3001/
# O
Invoke-WebRequest -Uri "http://localhost:3001/health"
```

3. **Verificar procesos de Node.js:**
```powershell
Get-Process -Name node
```

## Configuración Recomendada

Para desarrollo local, usa:

**`packages/agent/.env`:**
```env
PORT=3001
HOST=0.0.0.0  # Permite acceso desde red local
# O para solo local:
# HOST=127.0.0.1
```

**`packages/desktop/.env`:**
```env
VITE_PORT=5173
VITE_AGENT_URL=http://localhost:3001
```

## Notas Importantes

- `0.0.0.0` escucha en todas las interfaces (localhost + red local)
- `127.0.0.1` o `localhost` solo escucha en localhost
- En Windows, a veces `0.0.0.0` puede tener problemas con el firewall
- El código del desktop intenta con `localhost` y `127.0.0.1` automáticamente

