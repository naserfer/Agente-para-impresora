# 📦 GUÍA DE DISTRIBUCIÓN DEL AGENTE DE IMPRESIÓN

## 🎯 Para TI (Desarrollador/Distribuidor)

### Proceso para Crear Instalador para Nuevo Cliente

#### Paso 1: Crear Configuración del Cliente

```bash
# 1. Copia el template
cp cliente-config.template.json cliente-config-nuevo-cliente.json

# 2. Edita el archivo con los datos del cliente
```

**Datos que DEBES configurar por cliente:**

```json
{
  "cliente": {
    "nombre": "Nombre del Negocio",      // ← Aparece en tickets
    "slug": "nombre-negocio",             // ← Identificador único (sin espacios)
    "ruc": "80012345-6",                  // ← RUC del cliente (opcional)
    "telefono": "+595981234567",          // ← Opcional
    "email": "contacto@negocio.com"       // ← Opcional
  },
  
  "supabase": {
    "url": "https://abc.supabase.co",     // ← URL de Supabase del cliente
    "anonKey": "eyJhbGc...",              // ← Anon key de Supabase
    "ordersTable": "pedidos"              // ← Normalmente no cambiar
  },
  
  "impresora": {
    "printerId": "negocio-printer-1",     // ← ID único para Supabase
    "tipo": "usb",                        // ← usb, network, o bluetooth
    "nombreEsperado": "EPSON TM-T20III Receipt",  // ← Nombre exacto de la impresora
    "ubicacion": "Cocina"                 // ← Dónde está la impresora
  },
  
  "aplicacion": {
    "nombreApp": "Agente - Mi Negocio",   // ← Nombre del instalador
    "version": "1.0.0",                   // ← Versión del instalador
    "vercelUrl": "https://app.vercel.app", // ← URL de la app web (CORS)
    "autoInicio": false                   // ← Iniciar con Windows (true/false)
  }
}
```

#### Paso 2: Generar SQL Personalizado

```bash
node generar-sql-cliente.js nombre-cliente

# Ejemplo:
node generar-sql-cliente.js atlas-burger
```

Esto genera: `setup-nombre-cliente.sql`

#### Paso 3: Generar Instalador Completo

```bash
node build-installer.js nombre-cliente

# Ejemplo:
node build-installer.js atlas-burger
```

Esto genera en `./output/`:
- ✅ `Nombre del Negocio - Agente Setup.exe` (Instalador)
- ✅ `Nombre del Negocio - Agente Portable.exe` (Versión portable)
- ✅ `setup-nombre-cliente.sql` (SQL personalizado)
- ✅ `MANUAL-nombre-cliente.txt` (Manual de usuario)
- ✅ `.env` (Pre-configurado, por si acaso)

#### Paso 4: Enviar al Cliente

Envía la carpeta `./output/` completa al cliente con estas instrucciones:

---

## 👤 Para EL CLIENTE (Usuario Final)

### Instalación Simple (5 minutos)

#### 1️⃣ Conectar la Impresora
- Conecta la impresora Epson al USB
- Enciéndela
- Windows instalará drivers automáticamente (espera 1-2 minutos)

#### 2️⃣ Instalar el Programa
- Ejecuta: `[Nombre del Negocio] - Agente Setup.exe`
- Acepta todo (siguiente, siguiente, instalar)
- Se abrirá automáticamente al terminar

#### 3️⃣ Configuración Inicial (Solo Primera Vez)

El programa mostrará un asistente:

**Pantalla 1: Nombre del Negocio**
- Ya está pre-cargado ✅
- Click "Siguiente"

**Pantalla 2: Conexión a Supabase**
- Copia y pega:
  - URL de Supabase (te la enviaremos)
  - Clave de Supabase (te la enviaremos)
- Click "Probar Conexión" (debe decir ✅)
- Click "Siguiente"

**Pantalla 3: Impresora**
- Selecciona tu impresora de la lista
- Debería aparecer: "EPSON TM-T20III Receipt"
- El ID ya está configurado ✅
- Click "Siguiente"

**Pantalla 4: Listo**
- Click "Finalizar"

#### 4️⃣ Usar Todos los Días

1. Abre el programa "Agente de Impresión"
2. Presiona el botón **VERDE GRANDE** que dice **"INICIAR AGENTE"**
3. Espera a que diga: **"● ACTIVO - Imprimiendo automáticamente"**
4. ¡Listo! Deja el programa abierto

**Los tickets se imprimirán automáticamente** cuando confirmes un pedido en la app.

Para cerrar:
- Presiona el botón **ROJO** que dice **"DETENER AGENTE"**

---

## 🔧 Datos que Cambian por Cliente

| Dato | ¿Qué es? | ¿Dónde se usa? | Ejemplo |
|------|----------|----------------|---------|
| **Nombre del negocio** | Nombre comercial | Tickets, interfaz | "Atlas Burger" |
| **Slug** | Identificador único | Base de datos | "atlas-burger" |
| **Supabase URL** | Conexión a DB | Automático | "https://abc.supabase.co" |
| **Supabase Anon Key** | Autenticación | Automático | "eyJhbGc..." |
| **Printer ID** | ID en DB | Supabase config | "atlas-burger-printer-1" |
| **Nombre impresora** | Modelo físico | Auto-detección | "EPSON TM-T20III Receipt" |
| **URL Vercel** | App web | CORS | "https://app.vercel.app" |

---

## 📋 Checklist Pre-Distribución

Antes de enviar al cliente, verifica:

- [ ] `cliente-config-[nombre].json` creado y completo
- [ ] Supabase URL y Key configurados (si los tienes)
- [ ] Printer ID único y correcto
- [ ] URL de Vercel correcta
- [ ] SQL generado con `node generar-sql-cliente.js [nombre]`
- [ ] Instalador generado con `node build-installer.js [nombre]`
- [ ] Manual revisado y personalizado
- [ ] Probado el instalador en una VM limpia (opcional)

---

## 🚀 Script Rápido (Todo en Uno)

```bash
# Crear configuración
cp cliente-config.template.json cliente-config-mi-cliente.json
# → Edita cliente-config-mi-cliente.json

# Generar todo
node build-installer.js mi-cliente

# Enviar ./output/ al cliente
```

---

## 💡 Tips

1. **Nombre único del slug**: Usa el nombre del negocio sin espacios ni caracteres especiales
2. **Printer ID único**: Cada cliente debe tener un printer_id diferente
3. **Prueba antes de enviar**: Instala en una PC limpia para verificar
4. **Manual personalizado**: El manual se genera automáticamente con los datos del cliente
5. **Versión portable**: Si el cliente no quiere instalar, usa la versión portable

---

## 📞 Soporte

Si tienes dudas sobre la distribución, revisa:
- `cliente-config.template.json` - Template con comentarios
- `build-installer.js` - Script de empaquetado
- `generar-sql-cliente.js` - Generador de SQL

