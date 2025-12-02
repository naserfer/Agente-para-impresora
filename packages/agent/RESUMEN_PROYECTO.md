# 📋 Resumen del Proyecto - Agente de Impresión para Lomiterías

## Resumen Ejecutivo (Para otra IA)

Estamos desarrollando un **agente de impresión local** (servicio Node.js/Express) que actúa como intermediario entre una aplicación web Next.js (sistema de gestión de lomiterías con arquitectura multi-tenant en Supabase) y impresoras térmicas físicas (USB o red). El sistema funciona así: cuando un usuario (lomitero) inicia sesión en la app web, el sistema identifica su lomitería mediante un `lomiteriaId` almacenado en Supabase; al imprimir un ticket de cocina o factura, la app busca en una tabla `printer_config` de Supabase la configuración de impresora asociada a ese `lomiteriaId` (obteniendo el `printerId` único y la IP del agente), luego envía una petición HTTP POST al agente de impresión (que corre en la PC del local donde está la impresora) incluyendo el `printerId` y los datos del ticket/factura; el agente mantiene un Map en memoria con todas las impresoras configuradas (clave: `printerId`, valor: dispositivo físico), busca la impresora correspondiente usando el `printerId` recibido, genera los comandos ESC/POS mediante un `TicketGenerator` que formatea los datos en el diseño del ticket, y finalmente envía esos comandos a la impresora térmica física (USB o red) para imprimir el documento. La identificación multi-tenant se logra porque cada lomitería tiene su propio `printerId` único (generalmente igual al `lomiteriaId`), y el agente puede manejar múltiples impresoras simultáneamente, cada una asociada a un `printerId` diferente, permitiendo que múltiples lomiterías usen el mismo agente o que cada una tenga su propio agente en su local.

## Resumen Técnico Detallado

**Stack Tecnológico:**
- Backend del agente: Node.js + Express
- Comunicación con impresoras: `node-escpos`, `escpos-usb`, `escpos-network`
- Logging: Winston
- Frontend/App web: Next.js (no incluida en este repo)
- Base de datos: Supabase (no incluida en este repo)

**Arquitectura:**
1. **App Web (Next.js + Supabase)**: Sistema multi-tenant donde cada usuario pertenece a una lomitería. Guarda en Supabase la relación `lomiteriaId → printerId → agent_ip`.
2. **Agente de Impresión (este proyecto)**: Servicio Express que corre en la PC del local, expone API REST (`/api/print/kitchen-ticket`, `/api/print/invoice`, `/api/printer/configure`), mantiene un Map de impresoras configuradas por `printerId`, y convierte datos JSON en comandos ESC/POS.
3. **Impresora Térmica**: Hardware físico (USB o red) que recibe comandos ESC/POS e imprime tickets/facturas.

**Flujo de Identificación Multi-Tenant:**
- Usuario inicia sesión → App obtiene `lomiteriaId` del usuario
- Usuario imprime → App consulta `printer_config` en Supabase usando `lomiteriaId`
- App obtiene `printerId` y `agent_ip` → Envía petición al agente con `printerId`
- Agente busca impresora en su Map usando `printerId` → Imprime en esa impresora específica

**Endpoints Principales:**
- `POST /api/printer/configure`: Configura una nueva impresora con su `printerId`
- `POST /api/print/kitchen-ticket`: Imprime ticket de cocina (recibe `printerId` + `orderData`)
- `POST /api/print/invoice`: Imprime factura (recibe `printerId` + `invoiceData`)
- `GET /api/printer/list-usb`: Lista impresoras USB disponibles

**Archivos Clave:**
- `server.js`: Servidor Express con rutas API
- `printer/PrinterManager.js`: Gestiona impresoras por `printerId` (Map en memoria)
- `printer/TicketGenerator.js`: Genera comandos ESC/POS desde datos JSON


