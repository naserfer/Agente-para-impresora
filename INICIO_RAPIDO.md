# 🚀 Inicio Rápido - Print Agent

## Comandos Principales

### Desarrollo (Agente + Desktop en paralelo)
```bash
npm run dev
```

Este comando ejecuta:
- **AGENT**: Servidor del agente en `http://localhost:3001`
- **DESKTOP**: Interfaz gráfica Electron + Vite en `http://localhost:5173`

### Solo Agente
```bash
npm run agent:dev
```

### Solo Desktop
```bash
npm run desktop:dev
```

### Producción
```bash
npm run start
```

## Primera Vez

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar todo:**
   ```bash
   npm run dev
   ```

3. **La interfaz Electron se abrirá automáticamente**

## Estructura

```
packages/
├── agent/      # Agente de impresión (Node.js/Express)
└── desktop/    # Interfaz gráfica (Electron + React)
```

## Puertos

- **Agente**: `http://localhost:3001`
- **Desktop (Vite)**: `http://localhost:5173`
- **Electron**: Se abre automáticamente

