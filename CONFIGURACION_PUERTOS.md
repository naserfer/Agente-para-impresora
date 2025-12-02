# 🔧 Configuración de Puertos

Este proyecto usa puertos distintos para el agente y el desktop para evitar conflictos.

## 📍 Puertos por Defecto

| Servicio | Puerto | Configuración |
|----------|--------|---------------|
| **Agente** | `3001` | Variable `PORT` en `packages/agent/.env` |
| **Desktop (Vite)** | `5173` | Variable `VITE_PORT` en `packages/desktop/.env` |

## ⚙️ Configuración

### Agente (Puerto 3001)

1. Crea el archivo `.env` en `packages/agent/`:

```bash
cd packages/agent
cp .env.example .env
```

2. Edita `packages/agent/.env`:

```env
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGIN=*
```

**Para cambiar el puerto del agente:**
```env
PORT=3002  # Cambia a 3002
```

### Desktop (Puerto 5173)

1. Crea el archivo `.env` en `packages/desktop/`:

```bash
cd packages/desktop
cp .env.example .env
```

2. Edita `packages/desktop/.env`:

```env
VITE_PORT=5173
VITE_AGENT_URL=http://localhost:3001
```

**Para cambiar el puerto del desktop:**
```env
VITE_PORT=5174  # Cambia a 5174
```

## 🔄 Cambiar Puertos

### Cambiar puerto del agente a 3002:

1. Edita `packages/agent/.env`:
```env
PORT=3002
```

2. Actualiza `packages/desktop/.env`:
```env
VITE_AGENT_URL=http://localhost:3002
```

3. Reinicia ambos servicios.

### Cambiar puerto del desktop a 5174:

1. Edita `packages/desktop/.env`:
```env
VITE_PORT=5174
```

2. El código de Electron se actualizará automáticamente.

## 🛠️ Solución de Problemas

### Puerto ocupado

Si el puerto 3001 está ocupado:

```bash
# Opción 1: Usar el script npm
npm run stop

# Opción 2: Usar PowerShell directamente
powershell -File stop-agent.ps1

# Opción 3: Especificar otro puerto
powershell -File stop-agent.ps1 -Port 3002
```

### Verificar puertos en uso

**Windows:**
```powershell
netstat -ano | findstr :3001
netstat -ano | findstr :5173
```

**Linux/Mac:**
```bash
lsof -i :3001
lsof -i :5173
```

## 📝 Notas

- El agente escucha en `0.0.0.0` para permitir acceso desde la red local
- El desktop solo escucha en `localhost` (desarrollo local)
- En producción, el desktop se empaqueta y no necesita el servidor Vite

## 🔗 URLs de Acceso

- **Agente API**: `http://localhost:3001` (o el puerto configurado)
- **Desktop Dev**: `http://localhost:5173` (o el puerto configurado)
- **Health Check**: `http://localhost:3001/health`

