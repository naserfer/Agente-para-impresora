# 📚 Índice de Documentación - Agente de Impresión

## 🎯 Para Empezar

Si no entiendes nada de programación, empieza aquí:

1. **[GUIA_SIMPLE.md](./GUIA_SIMPLE.md)** ⭐ **EMPIEZA AQUÍ**
   - Explicación simple de cómo funciona todo
   - Conceptos básicos sin términos técnicos
   - Diagramas visuales fáciles de entender
   - **Recomendado si no sabes programación**

2. **[EJEMPLO_PRACTICO.md](./EJEMPLO_PRACTICO.md)**
   - Ejemplo paso a paso de un caso real
   - Sigue a Juan mientras imprime un ticket
   - Muestra exactamente qué pasa en cada paso
   - **Recomendado para entender el flujo completo**

3. **[DIAGRAMA_VISUAL.md](./DIAGRAMA_VISUAL.md)**
   - Diagramas visuales del sistema completo
   - Muestra cómo se conectan todas las partes
   - Tablas y gráficos explicativos
   - **Recomendado para ver la arquitectura**

---

## 🚀 Para Usar el Agente

Si ya entiendes cómo funciona y quieres usarlo:

4. **[QUICKSTART.md](./QUICKSTART.md)**
   - Guía rápida de instalación
   - Comandos para configurar impresoras
   - Ejemplos de uso básico
   - **Recomendado para empezar a usar el agente**

5. **[README.md](./README.md)**
   - Documentación técnica completa
   - Todos los endpoints de la API
   - Ejemplos de integración con Next.js
   - **Recomendado para desarrolladores**

---

## 💻 Para Entender el Código

Si quieres entender cómo está programado:

6. **Archivos con comentarios explicativos:**
   - `server.js` - Servidor principal (con comentarios detallados)
   - `printer/PrinterManager.js` - Gestor de impresoras (con comentarios)
   - `printer/TicketGenerator.js` - Generador de tickets

---

## 📖 ¿Qué Documento Leer Según Tu Necesidad?

### "No entiendo nada de programación"
→ Lee: **GUIA_SIMPLE.md**

### "Quiero ver un ejemplo real paso a paso"
→ Lee: **EJEMPLO_PRACTICO.md**

### "Quiero ver diagramas visuales"
→ Lee: **DIAGRAMA_VISUAL.md**

### "Quiero instalar y usar el agente"
→ Lee: **QUICKSTART.md**

### "Quiero integrarlo con mi app Next.js"
→ Lee: **README.md** (sección "Integración con Next.js")

### "Quiero entender el código"
→ Lee los archivos `.js` con comentarios

---

## 🔑 Conceptos Clave (Resumen)

### ¿Cómo se identifica qué lomitería es?

1. **Cada usuario pertenece a una lomitería**
   - Cuando un usuario inicia sesión, tu app sabe su `lomiteriaId`
   - Ejemplo: Juan → `lomiteria-001`

2. **Cada lomitería tiene una impresora**
   - En tu base de datos (Supabase) guardas:
     - `lomiteriaId` → `printerId` → `agent_ip`
   - Ejemplo: `lomiteria-001` → `printerId: "lomiteria-001"` → `agent_ip: "192.168.1.50"`

3. **El agente usa el printerId para identificar la impresora**
   - Cuando tu app envía una orden, incluye el `printerId`
   - El agente busca la impresora con ese ID
   - Imprime en esa impresora específica

### Flujo Completo (Simplificado)

```
Usuario → Lomitería ID → Busca en BD → Printer ID → Agente → Impresora Física
```

---

## ❓ Preguntas Frecuentes

### ¿Dónde se guarda qué impresora usa cada lomitería?

**En tu base de datos Supabase**, en una tabla llamada `printer_config`:

```sql
| lomiteria_id | printer_id      | agent_ip      |
|--------------|-----------------|---------------|
| lomiteria-001| lomiteria-001   | 192.168.1.50  |
| lomiteria-002| lomiteria-002   | 192.168.1.51  |
```

### ¿Cómo sabe mi app web qué impresora usar?

1. Usuario inicia sesión → App sabe su `lomiteriaId`
2. Usuario imprime → App busca en `printer_config` usando el `lomiteriaId`
3. App encuentra el `printerId` y `agent_ip`
4. App envía orden al agente con el `printerId`

### ¿El agente sabe qué lomitería es?

**No directamente.** El agente solo sabe:
- Qué impresoras tiene configuradas (por `printerId`)
- Cuando llega una orden, busca la impresora por su `printerId`

**Tu app web es la que sabe:**
- Qué usuario es
- A qué lomitería pertenece
- Qué `printerId` usar para esa lomitería

---

## 🎓 Orden Recomendado de Lectura

1. **GUIA_SIMPLE.md** - Para entender los conceptos básicos
2. **EJEMPLO_PRACTICO.md** - Para ver un ejemplo real
3. **QUICKSTART.md** - Para empezar a usar el agente
4. **README.md** - Para la documentación técnica completa

---

¿Tienes dudas? Revisa primero **GUIA_SIMPLE.md** que explica todo de manera muy simple.




