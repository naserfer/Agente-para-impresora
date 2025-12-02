-- ============================================
-- TABLA PRINTER_CONFIG - Configuración de Impresoras
-- ============================================
-- 
-- Esta tabla conecta cada lomitería (tenant) con su impresora física
-- a través del agente de impresión local.
-- 
-- Flujo:
-- 1. App web consulta printer_config por lomiteria_id
-- 2. Obtiene agent_ip, agent_port y printer_id
-- 3. Envía orden al agente: POST http://agent_ip:agent_port/print
-- 4. Agente imprime usando el printer_id
-- 
-- ============================================

CREATE TABLE IF NOT EXISTS printer_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lomiteria_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  printer_id TEXT NOT NULL,
  agent_ip TEXT NOT NULL,
  agent_port INTEGER NOT NULL DEFAULT 3001,
  tipo_impresora TEXT CHECK (tipo_impresora IN ('usb', 'network', 'bluetooth')) DEFAULT 'usb',
  nombre_impresora TEXT,
  ubicacion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lomiteria_id)
);

COMMENT ON TABLE printer_config IS 'Configuración de impresoras por lomitería';
COMMENT ON COLUMN printer_config.lomiteria_id IS 'FK a tenants - una configuración por lomitería';
COMMENT ON COLUMN printer_config.printer_id IS 'ID único de la impresora en el agente (se envía en el request)';
COMMENT ON COLUMN printer_config.agent_ip IS 'IP de la PC donde corre el agente de impresión';
COMMENT ON COLUMN printer_config.agent_port IS 'Puerto del agente (default: 3001)';
COMMENT ON COLUMN printer_config.tipo_impresora IS 'Tipo de conexión: usb, network, bluetooth';
COMMENT ON COLUMN printer_config.ubicacion IS 'Dónde está la impresora (ej: "Cocina", "Caja")';

-- Índices
CREATE INDEX IF NOT EXISTS idx_printer_config_lomiteria ON printer_config(lomiteria_id);
CREATE INDEX IF NOT EXISTS idx_printer_config_activo ON printer_config(lomiteria_id, activo) WHERE activo = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_printer_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_printer_config_updated_at ON printer_config;
CREATE TRIGGER trigger_update_printer_config_updated_at
  BEFORE UPDATE ON printer_config
  FOR EACH ROW
  EXECUTE FUNCTION update_printer_config_updated_at();

-- ============================================
-- DATOS DE EJEMPLO PARA ATLAS BURGER
-- ============================================
-- 
-- ⚠️ IMPORTANTE: Antes de ejecutar, ajusta la IP en la variable v_agent_ip
-- 
-- Para obtener tu IP en Windows:
-- PowerShell: ipconfig
-- Busca "Dirección IPv4" en "Adaptador de LAN inalámbrica Wi-Fi"
-- 
-- ============================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_agent_ip TEXT := '192.168.100.2';  -- ⚠️ CAMBIA ESTA IP POR LA DE TU PC
  v_agent_port INTEGER := 3001;
  v_printer_id TEXT := 'atlas-burger-printer-1';
BEGIN
  -- Buscar el tenant de Atlas Burger
  SELECT id INTO v_tenant_id
  FROM tenants
  WHERE slug = 'atlas-burger'
  LIMIT 1;

  -- Si no existe, crear uno de ejemplo
  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (nombre, slug, activo)
    VALUES ('Atlas Burger', 'atlas-burger', true)
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Insertar o actualizar configuración de impresora
  INSERT INTO printer_config (
    lomiteria_id,
    printer_id,
    agent_ip,
    agent_port,
    tipo_impresora,
    nombre_impresora,
    ubicacion,
    activo
  ) VALUES (
    v_tenant_id,
    v_printer_id,
    v_agent_ip,
    v_agent_port,
    'usb',
    'Impresora Térmica Cocina',
    'Cocina',
    true
  )
  ON CONFLICT (lomiteria_id) DO UPDATE
  SET
    printer_id = EXCLUDED.printer_id,
    agent_ip = EXCLUDED.agent_ip,
    agent_port = EXCLUDED.agent_port,
    tipo_impresora = EXCLUDED.tipo_impresora,
    nombre_impresora = EXCLUDED.nombre_impresora,
    ubicacion = EXCLUDED.ubicacion,
    activo = EXCLUDED.activo,
    updated_at = NOW();

  RAISE NOTICE '✅ Configuración de impresora creada para Atlas Burger';
  RAISE NOTICE '   - Printer ID: %', v_printer_id;
  RAISE NOTICE '   - Agent URL: http://%:%', v_agent_ip, v_agent_port;
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Asegúrate de que:';
  RAISE NOTICE '   1. El agente esté corriendo en http://%:%', v_agent_ip, v_agent_port;
  RAISE NOTICE '   2. La impresora esté configurada en el agente con printer_id: %', v_printer_id;
END $$;

-- ============================================
-- VISTA PARA VERIFICAR CONFIGURACIÓN
-- ============================================

CREATE OR REPLACE VIEW vista_printer_config AS
SELECT
  t.id as tenant_id,
  t.nombre as lomiteria_nombre,
  t.slug as lomiteria_slug,
  pc.printer_id,
  pc.agent_ip,
  pc.agent_port,
  CONCAT('http://', pc.agent_ip, ':', pc.agent_port, '/print') as agent_url,
  pc.tipo_impresora,
  pc.nombre_impresora,
  pc.ubicacion,
  pc.activo,
  pc.created_at,
  pc.updated_at
FROM printer_config pc
JOIN tenants t ON pc.lomiteria_id = t.id;

COMMENT ON VIEW vista_printer_config IS 'Vista para verificar configuración de impresoras';

-- ============================================
-- QUERY DE VERIFICACIÓN
-- ============================================
-- 
-- Ejecuta esto para verificar que todo esté configurado:
-- 
-- SELECT * FROM vista_printer_config WHERE lomiteria_slug = 'atlas-burger';
-- 
-- ============================================
