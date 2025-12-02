# 🚀 Inicio Rápido - Agente de Impresión

## Instalación Rápida

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
PORT=8080
ALLOWED_ORIGIN=http://localhost:3000
DEFAULT_PRINTER_TYPE=usb
LOG_LEVEL=info
```

### 3. Iniciar el agente

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

El agente estará disponible en `http://localhost:8080`

## Configurar una Impresora

### Para Impresora USB

```bash
# Primero, lista las impresoras USB disponibles
curl http://localhost:8080/api/printer/list-usb

# Luego configura la impresora
curl -X POST http://localhost:8080/api/printer/configure \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "type": "usb"
  }'
```

### Para Impresora de Red

```bash
curl -X POST http://localhost:8080/api/printer/configure \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "type": "network",
    "ip": "192.168.1.100",
    "port": 9100
  }'
```

## Probar la Impresión

### Imprimir un Ticket de Cocina de Prueba

```bash
curl -X POST http://localhost:8080/api/print/kitchen-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "orderData": {
      "orderId": "TEST-001",
      "tableNumber": "5",
      "customerName": "Cliente de Prueba",
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
  }'
```

### Imprimir una Factura de Prueba

```bash
curl -X POST http://localhost:8080/api/print/invoice \
  -H "Content-Type: application/json" \
  -d '{
    "printerId": "lomiteria-001",
    "invoiceData": {
      "invoiceNumber": "FAC-001-00012345",
      "customerName": "Cliente de Prueba",
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
  }'
```

## Usar el Script de Prueba

También puedes usar el script de prueba incluido:

```bash
node examples/test-print.js
```

## Integración con Next.js

En tu aplicación Next.js, crea un archivo de utilidades:

```javascript
// utils/printAgent.js
const PRINT_AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://localhost:8080';

export async function printKitchenTicket(printerId, orderData) {
  const response = await fetch(`${PRINT_AGENT_URL}/api/print/kitchen-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerId, orderData })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al imprimir');
  }
  
  return await response.json();
}

export async function printInvoice(printerId, invoiceData) {
  const response = await fetch(`${PRINT_AGENT_URL}/api/print/invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerId, invoiceData })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al imprimir');
  }
  
  return await response.json();
}
```

## Solución de Problemas

### La impresora USB no se detecta

1. Verifica que la impresora esté conectada y encendida
2. En Windows, asegúrate de que los drivers estén instalados
3. En Linux, puede necesitar permisos: `sudo usermod -a -G lp $USER`

### Error de conexión desde Next.js

1. Verifica que el agente esté corriendo: `curl http://localhost:8080/health`
2. Verifica la URL en `ALLOWED_ORIGIN` en el archivo `.env`
3. Si el agente está en otra máquina, usa la IP local en lugar de localhost

### El ticket no se imprime correctamente

1. Verifica que la impresora soporte comandos ESC/POS
2. Revisa los logs en `logs/combined.log`
3. Prueba con el endpoint de texto simple primero: `/api/print/text`




