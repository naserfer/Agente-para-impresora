# Nuevo local — agente de impresión (guía corta)

Una PC = **un tenant** + **un (o pocos) `printer_id`**. Tocar solo lo necesario.

## Checklist

1. **Supabase** — Tabla `printer_config`: `lomiteria_id` (UUID del tenant) + `printer_id` (texto único, ej. `prn-…`) + activo.
2. **Repo** — `cliente-config-<slug>.json` en la raíz del monorepo: `cliente.nombre`, `cliente.slug`, `cliente.tenantId` **o** `avanzado.agentTenantIds`, `supabase.*`, `impresora.printerId` (igual que en BD).
3. **Build** — `node build-installer.js <slug>` genera `.env` con `AGENT_TENANT_IDS` y `AGENT_ALLOWED_PRINTER_IDS` si el JSON trae tenant.
4. **PC desarrollo** — `packages/agent/.env.local`:
   - `AGENT_TENANT_IDS=<uuid>`
   - `AGENT_ALLOWED_PRINTER_IDS=<printer_id>`
5. **Impresora en el agente** — `packages/agent/printers-config.json` (o pantalla “Impresora” / `POST /api/printer/configure`): solo el `printer_id` de ese local.
6. **Reiniciar** el proceso del agente.

## Archivos que suelen editarse

| Archivo | Para qué |
|---------|----------|
| `cliente-config-*.json` | Datos del local + Supabase + tenant + printerId para el instalador |
| `build-installer.js` | Ya no hace falta tocarlo: lee el JSON y escribe el `.env` |
| `packages/agent/.env.local` | Dev: credenciales y `AGENT_*` (no subir a git) |
| `packages/agent/printers-config.json` | Qué impresoras lógicas existen en esa máquina |
| `packages/agent/.env.example` | Documentación de variables |

## Lógica de seguridad (referencia)

- `packages/agent/agent-scope.js` — listas `AGENT_TENANT_IDS` / `AGENT_ALLOWED_PRINTER_IDS`
- `packages/agent/supabase-listener.js` — filtro tenant + impresora en Realtime, polling y `printOrder`
- `packages/agent/server.js` — mismo `printer_id` en rutas HTTP

## Skill en Cursor (superpowers)

Instrucciones detalladas para el asistente: skill **`nuevo-local-print-agent`** en `~/.cursor/skills/superpowers/skills/nuevo-local-print-agent/SKILL.md`.
