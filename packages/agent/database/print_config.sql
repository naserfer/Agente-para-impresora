-- ============================================
-- TABLA PRINTER_CONFIG - Configuración de Impresoras
-- ============================================
-- 
-- Esta tabla conecta cada lomitería (tenant) con su impresora física
-- a través del agente de impresión local.
-- 
-- Flujo con Supabase Realtime (SIN túneles, SIN Vercel):
-- 1. Vendedor confirma pedido → estado_pedido = 'FACT' en tabla pedidos
-- 2. Supabase Realtime notifica al agente (WebSocket)
-- 3. Agente consulta printer_config por lomiteria_id (tenant_id)
-- 4. Agente obtiene items desde items_pedido
-- 5. Agente imprime automáticamente usando el printer_id
-- 
-- Flujo alternativo (con API desde Vercel):
-- 1. App web consulta printer_config por lomiteria_id
-- 2. Obtiene agent_ip, agent_port y printer_id
-- 3. Envía orden al agente: POST http://agent_ip:agent_port/print (local) o https://agent_ip/print (túnel)
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
COMMENT ON COLUMN printer_config.agent_ip IS 'IP local (192.168.x.x) o URL del túnel público (ej: atlas-burger-print.loca.lt). Para Vercel usar túnel público.';
COMMENT ON COLUMN printer_config.agent_port IS 'Puerto del agente: 3001 para HTTP (solo red local), 443 para HTTPS (túnel público/Vercel)';
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
-- NOTA: Los datos específicos de cada tenant (como Atlas Burger)
-- deben estar en sus respectivos archivos de seed (ej: seeds/atlas-burger.sql)
-- ============================================

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
  CASE 
    WHEN pc.agent_port = 443 THEN CONCAT('https://', pc.agent_ip, '/print')
    ELSE CONCAT('http://', pc.agent_ip, ':', pc.agent_port, '/print')
  END as agent_url,
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
-- PERMISOS Y SEGURIDAD
-- ============================================

-- Deshabilitar RLS (siguiendo el patrón del schema base)
ALTER TABLE printer_config DISABLE ROW LEVEL SECURITY;

-- Dar permisos al rol anónimo de Supabase (para que la app web pueda leer)
GRANT SELECT ON printer_config TO anon;
GRANT SELECT ON printer_config TO authenticated;

-- Dar permisos a la vista también
GRANT SELECT ON vista_printer_config TO anon;
GRANT SELECT ON vista_printer_config TO authenticated;

-- ============================================
-- QUERY DE VERIFICACIÓN
-- ============================================
-- 
-- Ejecuta esto para verificar que todo esté configurado:
-- 
-- SELECT * FROM vista_printer_config WHERE lomiteria_slug = 'atlas-burger';
-- 
-- O para ver la URL completa:
-- 
-- SELECT 
--   t.nombre as lomiteria_nombre,
--   pc.agent_ip,
--   pc.agent_port,
--   CASE 
--     WHEN pc.agent_port = 443 THEN CONCAT('https://', pc.agent_ip, '/print')
--     ELSE CONCAT('http://', pc.agent_ip, ':', pc.agent_port, '/print')
--   END as url_completa
-- FROM printer_config pc
-- JOIN tenants t ON pc.lomiteria_id = t.id
-- WHERE t.slug = 'atlas-burger';
-- 
-- =============================================

