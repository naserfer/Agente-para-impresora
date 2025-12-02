# 📖 Guía Simple - Cómo Funciona el Agente de Impresión

## 🎯 ¿Qué es esto y para qué sirve?

Imagina que tienes una aplicación web (tu sistema de lomiterías) que corre en internet, y una impresora térmica conectada a una computadora en tu local. El problema es que **una página web no puede hablar directamente con una impresora**.

**El agente de impresión es como un "traductor" o "mensajero"** que:
- Se instala en la computadora donde está la impresora
- Recibe órdenes de impresión desde tu aplicación web
- Le dice a la impresora qué imprimir

---

## 🏗️ ¿Cómo Funciona Todo el Sistema?

### El Flujo Completo (Paso a Paso)

```
┌─────────────────┐
│  Tu App Web     │  ← El usuario (lomitero) hace clic en "Imprimir Ticket"
│  (Next.js)      │
└────────┬────────┘
         │
         │ 1. Envía los datos del ticket
         │    (número de orden, items, etc.)
         ▼
┌─────────────────┐
│  Agente de      │  ← Recibe la orden y prepara el ticket
│  Impresión      │
│  (este programa)│
└────────┬────────┘
         │
         │ 2. Convierte los datos en comandos
         │    que la impresora entiende
         ▼
┌─────────────────┐
│  Impresora      │  ← Imprime el ticket físico
│  Térmica        │
└─────────────────┘
```

---

## 🏪 ¿Cómo Sabe Qué Lomitería Es? (Multi-Tenant)

### El Concepto

Cada lomitería tiene su propia impresora. Cuando un lomitero inicia sesión en tu aplicación web, el sistema sabe:
- **Quién es el usuario** (ejemplo: "Juan - Lomitería El Buen Sabor")
- **A qué lomitería pertenece** (ejemplo: "Lomitería ID: 001")

### Cómo Funciona en la Práctica

#### Paso 1: Configuración Inicial (Una sola vez por lomitería)

Cuando instalas el agente en una lomitería, le das un **ID único** a su impresora:

```
Lomitería "El Buen Sabor" → Impresora ID: "lomiteria-001"
Lomitería "La Esquina"    → Impresora ID: "lomiteria-002"
Lomitería "Don Pepe"      → Impresora ID: "lomiteria-003"
```

**Ejemplo de configuración:**
```javascript
// Esto se hace una vez cuando se instala el agente
{
  "printerId": "lomiteria-001",  // ← Este ID identifica la lomitería
  "type": "usb"                  // ← Tipo de impresora (USB o red)
}
```

#### Paso 2: Cuando un Usuario Imprime

1. **El usuario inicia sesión** en tu app web
   - Tu app sabe: "Este usuario pertenece a la Lomitería 001"

2. **El usuario hace clic en "Imprimir Ticket"**
   - Tu app envía al agente:
     ```javascript
     {
       "printerId": "lomiteria-001",  // ← Le dice al agente qué impresora usar
       "orderData": {
         "orderId": "ORD-12345",
         "items": [...]
       }
     }
     ```

3. **El agente busca la impresora correcta**
   - Busca en su lista: "¿Tengo configurada la impresora 'lomiteria-001'?"
   - Si la encuentra → imprime
   - Si no la encuentra → devuelve un error

---

## 🔧 ¿Dónde se Guarda la Información de Cada Lomitería?

### En tu Base de Datos (Supabase)

Tu aplicación web tiene una tabla que guarda:

| Usuario | Lomitería ID | Printer ID (del Agente) | IP del Agente |
|---------|--------------|-------------------------|---------------|
| Juan    | 001          | lomiteria-001           | 192.168.1.50  |
| María   | 002          | lomiteria-002           | 192.168.1.51  |
| Pedro   | 003          | lomiteria-003           | 192.168.1.52  |

**Cuando un usuario imprime:**
1. Tu app busca en la base de datos: "¿Qué printerId tiene la lomitería de este usuario?"
2. Envía la orden al agente con ese `printerId`
3. El agente imprime en la impresora correcta

---

## 💻 ¿Cómo Funciona el Agente Técnicamente? (Simplificado)

### El Agente Tiene 3 Partes Principales:

#### 1. **El Servidor (server.js)**
- Es como un "teléfono" que escucha peticiones
- Cuando tu app web le dice "imprime esto", el servidor recibe el mensaje
- **Puerto 8080**: Es como el "número de teléfono" del agente

#### 2. **El Gestor de Impresoras (PrinterManager.js)**
- Mantiene una lista de todas las impresoras configuradas
- Cuando llega una orden, busca la impresora correcta usando el `printerId`
- Se comunica con la impresora (USB o red)

#### 3. **El Generador de Tickets (TicketGenerator.js)**
- Toma los datos de la orden (items, precios, etc.)
- Los convierte en un formato que la impresora entiende (comandos ESC/POS)
- Crea el diseño del ticket (encabezado, items, totales, etc.)

---

## 📋 Ejemplo Real Paso a Paso

### Escenario: Juan quiere imprimir un ticket de cocina

#### En tu App Web (Next.js):

```javascript
// 1. El usuario Juan está logueado
const usuario = {
  id: "user-123",
  nombre: "Juan",
  lomiteriaId: "lomiteria-001"  // ← Su lomitería
};

// 2. Juan crea una orden
const orden = {
  orderId: "ORD-12345",
  items: [
    { name: "Lomo Completo", quantity: 2 },
    { name: "Papas Fritas", quantity: 1 }
  ]
};

// 3. Juan hace clic en "Imprimir Ticket de Cocina"
// Tu app busca en la base de datos:
const configImpresora = await buscarConfigImpresora("lomiteria-001");
// Resultado: { printerId: "lomiteria-001", ipAgente: "192.168.1.50" }

// 4. Tu app envía la orden al agente
await fetch(`http://192.168.1.50:8080/api/print/kitchen-ticket`, {
  method: 'POST',
  body: JSON.stringify({
    printerId: "lomiteria-001",  // ← Le dice al agente qué impresora usar
    orderData: orden
  })
});
```

#### En el Agente de Impresión:

```javascript
// 1. El agente recibe la petición
POST /api/print/kitchen-ticket
{
  printerId: "lomiteria-001",
  orderData: { ... }
}

// 2. El agente busca la impresora
const impresora = printerManager.printers.get("lomiteria-001");
// ¿Existe? → Sí, está configurada

// 3. El agente genera el ticket
const ticketBuffer = TicketGenerator.generateKitchenTicket(orderData);
// Convierte los datos en comandos que la impresora entiende

// 4. El agente envía a la impresora
await printerManager.print("lomiteria-001", ticketBuffer);
// La impresora imprime el ticket físico
```

---

## 🗺️ Mapa Visual del Sistema Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    TU APLICACIÓN WEB                        │
│                    (Next.js + Supabase)                      │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │   Usuario    │      │   Base de    │                     │
│  │   Juan       │─────▶│   Datos      │                     │
│  │ (Lomitería   │      │ (Supabase)   │                     │
│  │   001)       │      │              │                     │
│  └──────┬───────┘      └──────┬───────┘                     │
│         │                     │                             │
│         │ Crea orden          │ Busca config                │
│         │                     │ de impresora                 │
│         ▼                     ▼                             │
│  ┌─────────────────────────────────────┐                   │
│  │  Botón "Imprimir Ticket de Cocina"   │                   │
│  └──────────────┬──────────────────────┘                    │
│                 │                                            │
│                 │ Envía: printerId + datos                  │
└─────────────────┼────────────────────────────────────────────┘
                  │
                  │ HTTP Request
                  │ (Internet o Red Local)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              AGENTE DE IMPRESIÓN                             │
│              (En la PC del local)                            │
│                                                              │
│  ┌──────────────────────────────────────┐                   │
│  │  Servidor (Escucha en puerto 8080)   │                   │
│  │  - Recibe la orden de impresión      │                   │
│  └──────────────┬───────────────────────┘                    │
│                 │                                            │
│                 ▼                                            │
│  ┌──────────────────────────────────────┐                   │
│  │  PrinterManager                      │                   │
│  │  - Busca impresora "lomiteria-001"   │                   │
│  │  - Encuentra la impresora configurada│                   │
│  └──────────────┬───────────────────────┘                    │
│                 │                                            │
│                 ▼                                            │
│  ┌──────────────────────────────────────┐                   │
│  │  TicketGenerator                     │                   │
│  │  - Convierte datos en formato        │                   │
│  │    que la impresora entiende         │                   │
│  └──────────────┬───────────────────────┘                    │
│                 │                                            │
└─────────────────┼────────────────────────────────────────────┘
                  │
                  │ Comandos ESC/POS
                  │ (USB o Red)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    IMPRESORA TÉRMICA                         │
│                    (Física en el local)                      │
│                                                              │
│  ┌──────────────────────────────────────┐                   │
│  │  Imprime el ticket físico            │                   │
│  │  - Encabezado                        │                   │
│  │  - Items de la orden                 │                   │
│  │  - Corta el papel                    │                   │
│  └──────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Conceptos Clave (Glosario Simple)

### **Printer ID (ID de Impresora)**
- Es como el "nombre" único de cada impresora
- Ejemplo: `"lomiteria-001"`, `"lomiteria-002"`
- Se usa para identificar qué impresora debe imprimir

### **Multi-Tenant (Multi-Inquilino)**
- Significa que el sistema puede manejar múltiples lomiterías
- Cada lomitería tiene su propia configuración
- Los datos de una lomitería no se mezclan con los de otra

### **Agente de Impresión**
- Es el programa que corre en la computadora del local
- Actúa como "puente" entre tu app web y la impresora
- Debe estar corriendo para que funcione la impresión

### **API REST**
- Es como un "menú de opciones" que el agente ofrece
- Tu app web puede pedir: "imprime ticket", "imprime factura", etc.
- Cada opción tiene una "dirección" (URL) diferente

### **ESC/POS**
- Es el "idioma" que entienden las impresoras térmicas
- Son comandos especiales para: imprimir texto, cortar papel, abrir cajón, etc.
- El agente convierte tus datos a este "idioma"

---

## ❓ Preguntas Frecuentes

### ¿Qué pasa si dos lomiterías usan el mismo agente?

**No es común**, pero si pasa:
- Cada lomitería debe tener su propio `printerId` único
- El agente puede tener múltiples impresoras configuradas
- Cuando llega una orden, el agente busca la impresora correcta por su ID

### ¿El agente debe estar en la misma computadora que la impresora?

**Sí, generalmente:**
- Si la impresora es USB → el agente debe estar en esa misma PC
- Si la impresora es de red → el agente puede estar en cualquier PC de la red local

### ¿Cómo sabe mi app web dónde está el agente?

**En tu base de datos guardas:**
- La dirección IP de la computadora donde está el agente
- Ejemplo: `192.168.1.50:8080`
- Cuando un usuario imprime, tu app busca esta dirección y envía la orden ahí

### ¿Qué pasa si el agente no está corriendo?

**La impresión falla:**
- Tu app web intenta enviar la orden
- No hay respuesta del agente
- Se muestra un error al usuario: "No se pudo conectar con la impresora"

---

## 🎓 Resumen en 3 Puntos

1. **El agente es un "traductor"** entre tu app web y la impresora física
2. **Cada lomitería tiene un ID único** (`printerId`) que identifica su impresora
3. **Tu app web busca en la base de datos** qué impresora usar para cada lomitería y envía la orden al agente

---

¿Tienes más preguntas? Esta guía explica los conceptos básicos. Si necesitas entender algo más específico, avísame y lo explico con más detalle.




