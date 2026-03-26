# Guia: crear EXE y resetear configuracion

Esta guia usa un flujo generico para cualquier local.

## 1) Crear un EXE nuevo (bloqueado por cliente)

### Paso A: crear/editar config del cliente

1. Copia el template:
   - `cliente-config.template.json`
2. Guardalo como:
   - `cliente-config-<nombre-cliente>.json`

Ejemplo:
- `cliente-config-mi-local.json`

Edita ese archivo y completa (obligatorio):
- `cliente.nombre`
- `cliente.slug`
- `supabase.url`
- `supabase.anonKey`
- `impresora.printerId`
- `aplicacion.nombreApp`
- `aplicacion.version`
- `aplicacion.vercelUrl`

### Paso B: ejecutar build

Desde la raiz del repo (`C:\Users\Naser\OneDrive\Escritorio\agente`):

```bash
npm run build-instalador -- <nombre-cliente>
```

Ejemplo:

```bash
npm run build-instalador -- mi-local
```

### Paso C: donde queda el instalador

Principalmente en:
- `packages/desktop/dist-installer-unlock/`

Nombre recomendado del instalador generado:
- `AgenteImpresion-<version>-Setup.exe`

Tambien se generan archivos en:
- `output/` (SQL, manual y `.env` de soporte)

## 1.1) Que queda bloqueado vs configurable en el EXE

Bloqueado en build (no editable en la UI):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- flags tecnicos del agente (`ENABLE_SUPABASE_LISTENER`, `PORT`, etc.)

Configurable por el usuario final:
- `CLIENT_NAME` (nombre del local)
- `PRINTER_ID`
- impresora detectada en Windows


## 2) Resetear configuracion del EXE por consola

No existe un comando separado para "resetear contrasena" solamente.
El reset disponible limpia la configuracion local completa del agente para volver al wizard inicial.
En el flujo bloqueado, las credenciales fijas de Supabase se vuelven a tomar del build al iniciar nuevamente.

### Comando simple desde carpeta del agente (recomendado)

Desde la raiz del repo (`C:\Users\Naser\OneDrive\Escritorio\agente`):

```bash
npm run reset-config
```

Ese comando busca automaticamente el `.exe` instalado y ejecuta `--reset-config`.

### Comando del EXE instalado (produccion)

En PowerShell:

```powershell
& "$env:LOCALAPPDATA\Programs\Agente de Impresion\Agente de Impresion.exe" --reset-config
```

Si lo instalaste en otra ruta, usa esa ruta real del `.exe`.

### Comando en desarrollo (sin instalador)

Desde la raiz del repo:

```bash
npm run dev --workspace=packages/desktop -- --reset-config
```


## 3) Que borra exactamente `--reset-config`

El codigo de desktop limpia:
- `.env` dentro de `userData` de la app
- `printer-config.json` dentro de `userData`
- archivo seguro de `SUPABASE_ANON_KEY` (si existe)
- en modo dev, tambien intenta borrar `packages/agent/.env`

Despues del reset, al abrir de nuevo la app:
- vuelve a mostrarse el Setup Wizard
- hay que reconfigurar nombre local, printer-id e impresora


## 4) Tips rapidos de uso

- Antes de compilar, sube `aplicacion.version` en el `cliente-config-<nombre>.json`.
- El instalador esta en modo **one-click per-user** para mejorar estabilidad en doble click:
  - instala para el usuario actual,
  - no muestra selector "Anyone/Only me",
  - no requiere elevacion admin para instalar en perfil de usuario.
- Si Windows no abre el setup con doble click, probar:
  - click derecho -> "Ejecutar como administrador"
  - mover el `.exe` a una ruta corta, por ejemplo `C:\Installers\`
  - verificar propiedades del archivo y desbloquear si aparece esa opcion
