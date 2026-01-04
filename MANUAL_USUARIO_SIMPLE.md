# 📖 MANUAL DE USUARIO - AGENTE DE IMPRESIÓN

## 🚀 INSTALACIÓN (Solo Primera Vez)

### 1. Conectar la Impresora
1. Conecta la impresora térmica Epson al USB de la computadora
2. Enciende la impresora (botón de encendido)
3. Espera 1-2 minutos a que Windows instale los drivers automáticamente

### 2. Instalar el Programa
1. Ejecuta el archivo: `Agente de Impresión Setup.exe`
2. Click en "Siguiente" → "Siguiente" → "Instalar"
3. Espera a que termine la instalación
4. El programa se abrirá automáticamente

### 3. Configuración Inicial (Wizard)

El programa te mostrará un asistente de 3 pasos:

#### Pantalla 1: Nombre del Negocio
- El nombre ya debería estar cargado
- Click en "Siguiente"

#### Pantalla 2: Conexión a Supabase
Necesitarás 2 datos (te los proporcionará soporte técnico):
- **URL de Supabase**: `https://tu-proyecto.supabase.co`
- **Clave de acceso**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

Pasos:
1. Copia y pega la URL
2. Copia y pega la clave
3. Click en "Probar Conexión"
4. Debe decir: ✅ Conexión exitosa
5. Click en "Siguiente"

#### Pantalla 3: Seleccionar Impresora
1. Deberías ver tu impresora en la lista: `EPSON TM-T20III Receipt`
2. Click sobre ella para seleccionarla
3. El "ID de impresora" ya está configurado
4. Click en "Siguiente"

#### Pantalla 4: Listo
- Revisa el resumen
- Click en "Finalizar"

---

## 💻 USO DIARIO

### Iniciar el Agente (Cada Día)

1. Abre el programa "Agente de Impresión" desde el escritorio
2. Verás un botón **VERDE GRANDE** que dice: **"INICIAR AGENTE"**
3. Click en el botón verde
4. Espera unos segundos
5. Cuando veas: **"● ACTIVO - Imprimiendo automáticamente"** → ¡Ya está listo!

**¡IMPORTANTE!** Deja el programa abierto todo el día. Los tickets se imprimirán automáticamente.

### Detener el Agente (Al Cerrar)

1. Click en el botón **ROJO GRANDE** que dice: **"DETENER AGENTE"**
2. Espera unos segundos
3. Puedes cerrar el programa

---

## 🔍 PANTALLAS DEL PROGRAMA

El programa tiene 4 pestañas arriba:

### 📊 Estado
- **Botón INICIAR/DETENER**: El botón principal grande
- **Estado del sistema**: Si está activo o no
- **Últimos pedidos**: Historial de impresiones

### 🔧 Supabase
- Configuración de conexión a la base de datos
- Normalmente no necesitas tocar esto después de la primera configuración

### 🖨️ Impresora
- Lista de impresoras disponibles
- Botón "Imprimir Prueba" para verificar que funciona
- Configuración de impresora

### 📝 Logs
- Historial de eventos del agente
- Útil para diagnóstico si algo falla

---

## ❓ PROBLEMAS COMUNES

### El botón "INICIAR AGENTE" no hace nada

**Solución:**
1. Verifica que la impresora esté encendida
2. Cierra y vuelve a abrir el programa
3. Si persiste, reinicia la computadora

### No imprime los tickets

**Verificar:**
1. ¿El indicador dice "● ACTIVO"?
   - ❌ NO → Click en "INICIAR AGENTE"
   - ✅ SÍ → Continúa

2. Ve a la pestaña "Impresora"
3. Click en "Imprimir Prueba"
   - ✅ Imprime → La impresora funciona, el problema está en la app web
   - ❌ No imprime → Verifica que la impresora esté encendida y conectada

### La impresora no aparece en la lista

**Solución:**
1. Verifica que esté conectada y encendida
2. Desconecta y vuelve a conectar el USB
3. Ve a Windows → Configuración → Impresoras
4. Verifica que aparezca: "EPSON TM-T20III Receipt"
5. Si no aparece, reinstala los drivers de Epson

### Error: "No se puede conectar a Supabase"

**Solución:**
1. Verifica tu conexión a internet
2. Ve a la pestaña "Supabase"
3. Click en "Probar Conexión"
4. Si falla, contacta a soporte técnico

---

## 📞 SOPORTE TÉCNICO

**Antes de llamar, ten a mano:**
- Nombre de tu negocio
- Versión del programa (aparece en la pantalla de configuración)
- Descripción del problema

**Contacto:**
- Email: [AGREGAR EMAIL DE SOPORTE]
- Teléfono: [AGREGAR NÚMERO]
- Horario: Lunes a Viernes 9:00 - 18:00

---

## 💡 TIPS IMPORTANTES

✅ **Deja el programa abierto** todo el día mientras trabajas
✅ **Verifica el indicador "● ACTIVO"** al inicio del día
✅ **Imprime una prueba** al iniciar para verificar que funciona
✅ **No cierres el programa** mientras estés atendiendo clientes
✅ **Reinicia el programa** si algo anda mal

---

## 🎯 RESUMEN RÁPIDO

```
1. Abrir programa → 2. Click botón VERDE → 3. Ver "● ACTIVO" → 4. ¡Listo!
```

Los tickets se imprimen **AUTOMÁTICAMENTE** cuando confirmas un pedido en la app. 
No necesitas hacer nada más. 🎉

