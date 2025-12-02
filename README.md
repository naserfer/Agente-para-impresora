# 🖨️ Print Agent - Monorepo

Agente de impresión térmica con interfaz gráfica para sistema de lomiterías.

## 📁 Estructura del Monorepo

```
.
├── packages/
│   ├── agent/          # Agente de impresión (Node.js/Express)
│   └── desktop/        # Interfaz gráfica (Electron + React)
├── package.json        # Configuración del workspace
└── README.md
```

## 🚀 Inicio Rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
npm run setup
```

Esto creará los archivos `.env` necesarios con los puertos por defecto:
- **Agente**: Puerto `3001`
- **Desktop**: Puerto `5173`

Para cambiar los puertos, edita los archivos `.env` en cada paquete.

### Desarrollo

**Agente solamente:**
```bash
npm run agent:dev
```

**Interfaz gráfica:**
```bash
npm run desktop:dev
```

**Ambos (agente + interfaz):**
```bash
npm run agent:dev
# En otra terminal:
npm run desktop:dev
```

### Producción

**Construir la aplicación:**
```bash
npm run desktop:build
```

**Ejecutar la aplicación construida:**
```bash
npm run desktop:start
```

## 📦 Paquetes

### `packages/agent`

Agente de impresión térmica que se comunica con impresoras ESC/POS.

- **Puerto**: 3001 (configurable con `PORT` en `.env`)
- **Host**: 0.0.0.0 (accesible desde red local)
- **Endpoints**: Ver `packages/agent/README.md`
- **Configuración**: Copia `packages/agent/.env.example` a `packages/agent/.env`

### `packages/desktop`

Interfaz gráfica Electron para controlar el agente.

- **Puerto Vite**: 5173 (configurable con `VITE_PORT` en `.env`)
- **Tecnologías**: Electron + React + Vite
- **Configuración**: Copia `packages/desktop/.env.example` a `packages/desktop/.env`
- **Funcionalidades**:
  - Iniciar/detener el agente
  - Ver logs en tiempo real
  - Test de impresión
  - Estado del agente

## 🔧 Configuración

Ver documentación en cada paquete:
- `packages/agent/README.md`
- `packages/desktop/README.md`

## 📝 Licencia

MIT
