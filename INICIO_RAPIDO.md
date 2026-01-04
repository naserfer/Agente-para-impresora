# ⚡ INICIO RÁPIDO

## 🎯 Para Nuevo Cliente (5 minutos)

### 1. Crear Configuración

```bash
# Copia el template
cp cliente-config.template.json cliente-config-mi-cliente.json
```

Edita `cliente-config-mi-cliente.json` y completa:
- `cliente.nombre` → "Mi Lomitería"
- `cliente.slug` → "mi-lomiteria"
- `supabase.url` → URL de Supabase
- `supabase.anonKey` → Anon key
- `impresora.printerId` → "mi-lomiteria-printer-1"
- `aplicacion.vercelUrl` → URL de Vercel

### 2. Generar Todo

```bash
node build-installer.js mi-cliente
```

### 3. Enviar al Cliente

Envía la carpeta `./output/` con:
- ✅ Instalador .exe
- ✅ SQL personalizado
- ✅ Manual de usuario

---

## 📋 Ejemplo Real: Atlas Burger

```bash
# Ya está creado: cliente-config-atlas-burger.json
node build-installer.js atlas-burger

# Archivos en ./output/:
# - Atlas Burger - Agente Setup.exe
# - Atlas Burger - Agente Portable.exe  
# - setup-atlas-burger.sql
# - MANUAL-atlas-burger.txt
```

---

## 🏃 Para Desarrollo

```bash
# Ejecutar agente + interfaz
npm run dev

# Solo interfaz
npm run desktop:dev

# Solo agente
npm run agent:dev

# Ver preview de ticket
cd packages/agent
node preview-ticket.js
```

---

## ✅ TODO LISTO

El sistema está completo con:
- ✅ Wizard de configuración inicial
- ✅ Botones grandes INICIAR/DETENER
- ✅ Auto-detección de impresoras
- ✅ Generador de instalador por cliente
- ✅ SQL personalizado por cliente
- ✅ Manual de usuario automático
- ✅ Tickets optimizados

**¡Solo falta generar los instaladores y distribuir!** 🚀

