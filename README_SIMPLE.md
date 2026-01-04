# 🖨️ Agente de Impresión - README Simple

## 📦 ¿Qué es esto?

Un programa que **imprime automáticamente** los tickets de pedidos en tu impresora térmica cuando confirmas un pedido en la app web.

---

## 👨‍💻 Para el Desarrollador/Distribuidor

### Generar Instalador para Nuevo Cliente

```bash
# 1. Crear configuración del cliente
cp cliente-config.template.json cliente-config-nuevo-cliente.json
# → Edita el archivo con datos del cliente

# 2. Generar SQL personalizado
node generar-sql-cliente.js nuevo-cliente

# 3. Generar instalador completo
node build-installer.js nuevo-cliente

# 4. Los archivos están en ./output/
# → Envía toda la carpeta output/ al cliente
```

### Datos que Debes Configurar

En `cliente-config-[nombre].json`:
- ✅ `cliente.nombre` - Nombre del negocio (aparece en tickets)
- ✅ `cliente.slug` - Identificador único (sin espacios)
- ✅ `supabase.url` - URL de Supabase del cliente
- ✅ `supabase.anonKey` - Anon key de Supabase
- ✅ `impresora.printerId` - ID único (ej: `negocio-printer-1`)
- ✅ `aplicacion.vercelUrl` - URL de la app web

**Lo demás usa valores por defecto.**

---

## 👤 Para el Cliente Final

### Instalación

1. **Conectar impresora** Epson al USB y encenderla
2. **Ejecutar** `Agente de Impresión Setup.exe`
3. **Seguir** el asistente de configuración (3 pasos simples)
4. **Listo** - Presionar botón verde "INICIAR AGENTE"

### Uso Diario

```
Abrir programa → Click botón VERDE → Ver "● ACTIVO" → ¡Listo!
```

Los tickets se imprimen automáticamente. No tocar nada más.

**Manual completo:** Ver `MANUAL_USUARIO_SIMPLE.md`

---

## 📁 Estructura de Archivos

```
agente/
├── cliente-config.template.json    ← Plantilla para nuevos clientes
├── cliente-config-atlas-burger.json ← Ejemplo: Atlas Burger
├── build-installer.js              ← Script para generar instalador
├── generar-sql-cliente.js          ← Script para generar SQL
├── packages/
│   ├── agent/                      ← Servidor del agente
│   └── desktop/                    ← Interfaz gráfica (Electron)
└── output/                         ← Archivos generados (enviar al cliente)
    ├── [Cliente] - Agente Setup.exe
    ├── [Cliente] - Agente Portable.exe
    ├── setup-[cliente].sql
    ├── MANUAL-[cliente].txt
    └── .env
```

---

## 🎯 Flujo Completo

### Tu Lado (Distribuidor)
1. Crear `cliente-config-[nombre].json`
2. Ejecutar `node build-installer.js [nombre]`
3. Enviar carpeta `./output/` al cliente
4. El cliente ejecuta SQL en Supabase

### Lado del Cliente
1. Instalar con el `.exe`
2. Completar wizard (3 pasos)
3. Click en "INICIAR AGENTE"
4. ¡Listo! Imprime automáticamente

---

## 💡 Comandos Útiles

```bash
# Desarrollo
npm run dev                          # Agente + GUI

# Generar para cliente
npm run generar-sql atlas-burger     # Solo SQL
npm run build-instalador atlas-burger # Instalador completo

# Ver preview de ticket
cd packages/agent
node preview-ticket.js               # Ver cómo se ve el ticket
```

---

## ✅ Lo Que Ya Funciona

- ✅ Wizard de configuración inicial
- ✅ Botones grandes INICIAR/DETENER
- ✅ Auto-detección de impresoras Epson
- ✅ Conexión a Supabase Realtime
- ✅ Impresión automática
- ✅ Generación de instalador .exe
- ✅ Generación de SQL por cliente
- ✅ Manual de usuario
- ✅ Tickets optimizados (ahorro de papel)

---

## 📋 Checklist Rápido

Antes de enviar al cliente:
- [ ] Configuración creada en `cliente-config-[nombre].json`
- [ ] SQL generado con datos correctos
- [ ] Instalador generado sin errores
- [ ] Manual revisado
- [ ] Probado en VM limpia (opcional)

---

¿Dudas? Lee `INSTRUCCIONES_DISTRIBUCION.md` para más detalles.

