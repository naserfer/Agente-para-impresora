# 🖨️ Agente de Impresión - Sistema de Lomiterías

Agente de impresión local para sistema de gestión de lomiterías. Permite la comunicación entre tu aplicación Next.js y impresoras térmicas (USB o Red) para imprimir tickets de cocina y facturas de cliente.

## 📋 Características

- ✅ Soporte para impresoras térmicas USB y de red
- ✅ Impresión de tickets de cocina con formato optimizado
- ✅ Impresión de facturas/recibos de cliente
- ✅ API REST para integración con Next.js
- ✅ Arquitectura multi-tenant (una impresora por lomitería)
- ✅ Logging completo de operaciones
- ✅ Manejo de errores robusto

## 🚀 Instalación

### Requisitos Previos

- Node.js 16+ instalado
- Impresora térmica conectada (USB o red)
- npm o yarn

### Pasos de Instalación

1. **Clonar o descargar el proyecto**

```bash
cd agente
```

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

Copia el archivo `.env.example` a `.env` y ajusta los valores:

```bash
cp .env.example .env
```

Edita `.env` con tus configuraciones:

```env
PORT=8080
ALLOWED_ORIGIN=http://localhost:3000
DEFAULT_PRINTER_TYPE=usb
LOG_LEVEL=info
```

4. **Crear directorio de logs**

```bash
mkdir logs
```

## 🏃 Ejecución

### Modo Desarrollo

```bash
npm run dev
```

### Modo Producción

```bash
npm start
```

### Con PM2 (Recomendado para producción)

PM2 mantiene el proceso corriendo y lo reinicia automáticamente.

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar el agente
npm run pm2:start

# Ver logs
pm2 logs print-agent

# Configurar auto-inicio en el sistema
pm2 startup
pm2 save
```

## 📡 API Endpoints

### Health Check

```http
GET /
GET /health
```

### Configurar Impresora

```http
POST /api/printer/configure
Content-Type: application/json

{
  "printerId": "lomiteria-001",
  "type": "usb",  // o "network"
  "ip": "192.168.1.100",  // solo para network
  "port": 9100  // solo para network
}
```

### Listar Impresoras USB Disponibles

```http
GET /api/printer/list-usb
```

### Imprimir Ticket de Cocina

```http
POST /api/print/kitchen-ticket
Content-Type: application/json

{
  "printerId": "lomiteria-001",
  "orderData": {
    "orderId": "ORD-12345",
    "tableNumber": "5",
    "customerName": "Juan Pérez",
    "lomiteriaName": "Lomitería El Buen Sabor",
    "createdAt": "2024-01-15 14:30:00",
    "items": [
      {
        "name": "Lomo Completo",
        "quantity": 2,
        "notes": "Sin cebolla"
      },
      {
        "name": "Papas Fritas",
        "quantity": 1
      }
    ]
  }
}
```

### Imprimir Factura

```http
POST /api/print/invoice
Content-Type: application/json

{
  "printerId": "lomiteria-001",
  "invoiceData": {
    "invoiceNumber": "FAC-001-00012345",
    "customerName": "Juan Pérez",
    "customerAddress": "Av. Corrientes 1234",
    "customerTaxId": "20-12345678-9",
    "lomiteriaName": "Lomitería El Buen Sabor",
    "lomiteriaAddress": "Av. Principal 456",
    "lomiteriaTaxId": "30-98765432-1",
    "createdAt": "2024-01-15 14:30:00",
    "items": [
      {
        "name": "Lomo Completo",
        "quantity": 2,
        "unitPrice": 1500,
        "subtotal": 3000
      },
      {
        "name": "Papas Fritas",
        "quantity": 1,
        "unitPrice": 500,
        "subtotal": 500
      }
    ],
    "subtotal": 3500,
    "tax": 735,
    "total": 4235,
    "paymentMethod": "Efectivo"
  }
}
```

### Imprimir Texto Personalizado (Pruebas)

```http
POST /api/print/text
Content-Type: application/json

{
  "printerId": "lomiteria-001",
  "text": "Texto de prueba\nSegunda línea"
}
```

### Eliminar Configuración de Impresora

```http
DELETE /api/printer/:printerId
```

## 🔌 Integración con Next.js

### Ejemplo de uso en tu aplicación Next.js

```javascript
// utils/printAgent.js
const PRINT_AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://localhost:8080';

export async function printKitchenTicket(printerId, orderData) {
  try {
    const response = await fetch(`${PRINT_AGENT_URL}/api/print/kitchen-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerId,
        orderData
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al imprimir');
    }

    return await response.json();
  } catch (error) {
    console.error('Error al imprimir ticket de cocina:', error);
    throw error;
  }
}

export async function printInvoice(printerId, invoiceData) {
  try {
    const response = await fetch(`${PRINT_AGENT_URL}/api/print/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerId,
        invoiceData
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al imprimir');
    }

    return await response.json();
  } catch (error) {
    console.error('Error al imprimir factura:', error);
    throw error;
  }
}

export async function configurePrinter(printerConfig) {
  try {
    const response = await fetch(`${PRINT_AGENT_URL}/api/printer/configure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(printerConfig)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al configurar impresora');
    }

    return await response.json();
  } catch (error) {
    console.error('Error al configurar impresora:', error);
    throw error;
  }
}
```

### Uso en un componente React

```javascript
import { printKitchenTicket } from '@/utils/printAgent';

function OrderComponent({ order }) {
  const handlePrint = async () => {
    try {
      // Obtener el printerId desde tu configuración de tenant
      const printerId = `lomiteria-${order.tenantId}`;
      
      await printKitchenTicket(printerId, {
        orderId: order.id,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        lomiteriaName: order.lomiteria.name,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          notes: item.notes
        }))
      });
      
      alert('Ticket enviado a la impresora');
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <button onClick={handlePrint}>
      Imprimir Ticket de Cocina
    </button>
  );
}
```

## 🗄️ Configuración Multi-Tenant

Para manejar múltiples lomiterías, cada una con su propia impresora:

1. **En tu base de datos Supabase**, guarda la configuración de la impresora por tenant:

```sql
-- Tabla de configuración de impresoras por lomitería
CREATE TABLE printer_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  printer_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'usb' o 'network'
  ip TEXT,
  port INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

2. **Al iniciar sesión un usuario**, obtén la configuración de su impresora y configúrala:

```javascript
// En tu app Next.js
const { data: printerConfig } = await supabase
  .from('printer_config')
  .select('*')
  .eq('tenant_id', currentTenantId)
  .single();

if (printerConfig) {
  await configurePrinter({
    printerId: printerConfig.printer_id,
    type: printerConfig.type,
    ip: printerConfig.ip,
    port: printerConfig.port
  });
}
```

## 🔧 Solución de Problemas

### La impresora no se detecta (USB)

1. Verifica que la impresora esté conectada y encendida
2. Lista las impresoras disponibles: `GET /api/printer/list-usb`
3. En Windows, verifica que los drivers estén instalados
4. En Linux, puede necesitar permisos: `sudo usermod -a -G lp $USER`

### Error de conexión desde Next.js

1. Verifica que el agente esté corriendo: `GET http://localhost:8080/health`
2. Verifica la URL en `ALLOWED_ORIGIN` en el archivo `.env`
3. Si el agente está en otra máquina, usa la IP local: `http://192.168.1.100:8080`

### El ticket no se imprime correctamente

1. Verifica que la impresora soporte comandos ESC/POS
2. Revisa los logs en `logs/combined.log`
3. Prueba con el endpoint de texto simple primero

## 📝 Notas

- El agente debe ejecutarse en el mismo equipo donde está conectada la impresora (o en la red local para impresoras de red)
- Para producción, considera usar HTTPS y autenticación adicional
- Los logs se guardan en el directorio `logs/`

## 📄 Licencia

MIT




