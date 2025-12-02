# 🖨️ Guía de Instalación - Epson TM-T20

## 📋 Pasos para Configurar tu Impresora

### Paso 1: Conectar la Impresora

1. **Conecta la impresora a tu PC:**
   - Si es USB: Conecta el cable USB a tu PC
   - Si es Red: Conecta el cable de red y configura la IP

2. **Enciende la impresora:**
   - Asegúrate de que esté encendida y con papel cargado

3. **Instala los drivers (si es necesario):**
   - Windows generalmente detecta la impresora automáticamente
   - Si no, descarga los drivers desde el sitio de Epson
   - Busca "Epson TM-T20 drivers" en Google

---

### Paso 2: Instalar Dependencias del Proyecto

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

Esto instalará todas las dependencias necesarias (Express, node-escpos, etc.)

---

### Paso 3: Configurar Variables de Entorno

1. **Crea el archivo `.env`** (si no existe):

```bash
# En Windows PowerShell
Copy-Item .env.example .env

# O crea el archivo manualmente
```

2. **Edita el archivo `.env`** con estos valores:

```env
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGIN=*
DEFAULT_PRINTER_TYPE=usb
LOG_LEVEL=info
```

---

### Paso 4: Listar Impresoras USB Disponibles

Primero, vamos a ver si tu impresora es detectada:

1. **Inicia el agente** (en una terminal):

```bash
npm start
```

2. **En otra terminal**, ejecuta (o usa Postman/Thunder Client):

```bash
# Windows PowerShell
Invoke-WebRequest -Uri "http://localhost:3001/api/printer/list-usb" -Method GET

# O abre en el navegador:
# http://localhost:3001/api/printer/list-usb
```

**Deberías ver algo como:**
```json
{
  "success": true,
  "devices": [
    {
      "vendorId": "...",
      "productId": "...",
      "deviceName": "EPSON TM-T20"
    }
  ]
}
```

**Si no aparece ninguna impresora:**
- Verifica que esté conectada y encendida
- En Windows, puede necesitar permisos de administrador
- Prueba desconectar y reconectar el cable USB

---

### Paso 5: Configurar la Impresora en el Agente

Una vez que veas la impresora en la lista, configúrala:

**Opción A: Usando PowerShell/CMD**

```bash
# Windows PowerShell
$body = @{
    printerId = "epson-tm-t20-001"
    type = "usb"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/printer/configure" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Opción B: Usando Postman o Thunder Client**

- URL: `POST http://localhost:3001/api/printer/configure`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "printerId": "epson-tm-t20-001",
  "type": "usb"
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Impresora epson-tm-t20-001 configurada correctamente",
  "config": {
    "printerId": "epson-tm-t20-001",
    "type": "usb"
  }
}
```

---

### Paso 6: Probar la Impresión

Ahora vamos a hacer una prueba de impresión:

**Opción A: Usando PowerShell**

```bash
# Windows PowerShell
$body = @{
    printerId = "epson-tm-t20-001"
    tipo = "cocina"
    data = @{
        numeroPedido = 1
        tipoPedido = "local"
        items = @(
            @{
                nombre = "Lomo Completo"
                cantidad = 2
                personalizaciones = "sin cebolla"
            },
            @{
                nombre = "Papas Fritas"
                cantidad = 1
            }
        )
        total = 5000
        cliente = @{
            nombre = "Cliente de Prueba"
        }
        fecha = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri "http://localhost:3001/print" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

**Opción B: Usando Postman/Thunder Client**

- URL: `POST http://localhost:3001/print`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "printerId": "epson-tm-t20-001",
  "tipo": "cocina",
  "data": {
    "numeroPedido": 1,
    "tipoPedido": "local",
    "items": [
      {
        "nombre": "Lomo Completo",
        "cantidad": 2,
        "personalizaciones": "sin cebolla"
      },
      {
        "nombre": "Papas Fritas",
        "cantidad": 1
      }
    ],
    "total": 5000,
    "cliente": {
      "nombre": "Cliente de Prueba"
    },
    "fecha": "2025-01-15T14:30:00Z"
  }
}
```

**Si todo funciona:**
- ✅ Deberías ver el ticket impreso en la impresora
- ✅ La respuesta será: `{ "success": true, ... }`

---

### Paso 7: Probar Impresión de Texto Simple (Alternativa)

Si el paso anterior no funciona, prueba primero con texto simple:

```bash
# PowerShell
$body = @{
    printerId = "epson-tm-t20-001"
    text = "Prueba de impresion`nSegunda linea`nTercera linea"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/print/text" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## 🔧 Solución de Problemas

### Error: "No se encontró ninguna impresora USB conectada"

**Soluciones:**
1. Verifica que la impresora esté encendida y conectada
2. En Windows, puede necesitar permisos de administrador:
   - Abre PowerShell como Administrador
   - Ejecuta: `npm start`
3. Prueba desconectar y reconectar el cable USB
4. Verifica en el Administrador de Dispositivos de Windows que la impresora esté reconocida

### Error: "Impresora no encontrada. Configúrala primero"

**Solución:**
- Asegúrate de haber ejecutado el Paso 5 (configurar la impresora)
- Verifica que el `printerId` sea exactamente el mismo en ambos pasos

### Error: "Error al abrir impresora"

**Soluciones:**
1. Cierra cualquier otra aplicación que esté usando la impresora
2. Reinicia el agente: `Ctrl+C` y luego `npm start` de nuevo
3. Verifica que los drivers estén instalados correctamente

### La impresora no imprime nada

**Soluciones:**
1. Verifica que tenga papel cargado
2. Verifica que no esté en modo "pausa" o con algún error
3. Prueba imprimir desde otra aplicación (Word, Bloc de notas) para verificar que funciona
4. Revisa los logs del agente (en la terminal donde corre `npm start`)

---

## 📝 Notas Importantes

1. **El agente debe estar corriendo** para que funcione la impresión
2. **Mantén la terminal abierta** donde corre `npm start`
3. **El printerId puede ser cualquier nombre** que quieras, pero úsalo consistente
4. **Para producción**, considera usar PM2 para mantener el agente corriendo

---

## ✅ Checklist de Verificación

- [ ] Impresora conectada y encendida
- [ ] Drivers instalados (si es necesario)
- [ ] `npm install` ejecutado
- [ ] Archivo `.env` configurado
- [ ] Agente corriendo (`npm start`)
- [ ] Impresora detectada en `/api/printer/list-usb`
- [ ] Impresora configurada en `/api/printer/configure`
- [ ] Prueba de impresión exitosa

---

## 🎯 Siguiente Paso

Una vez que funcione la impresión local, el siguiente paso es:
1. Configurar la IP de tu PC en la red local
2. Probar desde otro dispositivo (celular/tablet) en la misma WiFi
3. Integrar con tu app Next.js

¿Necesitas ayuda con algún paso específico?

