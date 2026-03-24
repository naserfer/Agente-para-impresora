-- ============================================
-- Cola explícita: reimpresión cocina vs factura (Realtime)
-- ============================================
-- La app inserta en reprint_solicitud; el agente escucha INSERT e imprime
-- solo cocina o solo factura según tipo (no el flujo completo pedido FACT).
--
-- 1) Ejecutar en Supabase SQL.
-- 2) Habilitar Realtime para reprint_solicitud (publication supabase_realtime o Dashboard).
-- 3) Agente: supabase-listener suscrito a INSERT (ver AGENTE_REPRINT_SOLICITUD.md).
-- ============================================

CREATE TABLE IF NOT EXISTS public.reprint_solicitud (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cocina', 'factura')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reprint_solicitud_tenant_created
  ON public.reprint_solicitud(tenant_id, created_at DESC);

COMMENT ON TABLE public.reprint_solicitud IS
  'Solicitud explícita de reimpresión: el agente escucha INSERT y respeta tipo (solo cocina o solo factura).';

CREATE OR REPLACE FUNCTION public.reprint_solicitud_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = NEW.pedido_id
      AND p.tenant_id = NEW.tenant_id
      AND p.estado_pedido = 'FACT'
  ) THEN
    RAISE EXCEPTION 'reprint_solicitud: pedido inexistente, otro tenant o no FACT';
  END IF;

  IF NEW.tipo = 'factura' AND NOT EXISTS (
    SELECT 1 FROM public.facturas f
    WHERE f.pedido_id = NEW.pedido_id
      AND f.tenant_id = NEW.tenant_id
      AND COALESCE(f.anulada, false) = false
  ) THEN
    RAISE EXCEPTION 'reprint_solicitud: sin factura activa para este pedido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reprint_solicitud_validate ON public.reprint_solicitud;
CREATE TRIGGER tr_reprint_solicitud_validate
  BEFORE INSERT ON public.reprint_solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.reprint_solicitud_validate();

ALTER TABLE public.reprint_solicitud ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reprint_solicitud_insert ON public.reprint_solicitud;
CREATE POLICY reprint_solicitud_insert ON public.reprint_solicitud
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT u.tenant_id FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.is_deleted, false) = false
        AND COALESCE(u.activo, true) = true
    )
  );

DROP POLICY IF EXISTS reprint_solicitud_select ON public.reprint_solicitud;
CREATE POLICY reprint_solicitud_select ON public.reprint_solicitud
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(u.is_deleted, false) = false
        AND COALESCE(u.activo, true) = true
    )
  );

GRANT SELECT, INSERT ON public.reprint_solicitud TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reprint_solicitud;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Publication supabase_realtime no existe; habilitá Realtime para reprint_solicitud en el dashboard.';
  WHEN duplicate_object THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_pedido_reprint_cocina(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  t_user uuid;
  n int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT u.tenant_id INTO t_user
  FROM public.usuarios u
  WHERE u.auth_user_id = uid
    AND COALESCE(u.is_deleted, false) = false
    AND COALESCE(u.activo, true) = true
  LIMIT 1;

  IF t_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_usuario');
  END IF;

  INSERT INTO public.reprint_solicitud (tenant_id, pedido_id, tipo)
  SELECT t_user, p_pedido_id, 'cocina'
  WHERE EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = p_pedido_id AND p.tenant_id = t_user AND p.estado_pedido = 'FACT'
  );

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pedido_no_encontrado_o_no_fact');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.bump_pedido_reprint_cocina(uuid) IS
  'Encola reimpresión solo cocina (INSERT reprint_solicitud).';

-- ============================================
-- Agente con clave ANON (logs: role "anon")
-- Sin esto, ni Realtime ni GET /reprint_solicitud devuelven filas al agente.
-- Mejor alternativa: SUPABASE_SERVICE_ROLE_KEY solo en la PC del agente.
-- ============================================

GRANT SELECT ON public.reprint_solicitud TO anon;

DROP POLICY IF EXISTS reprint_solicitud_select_anon ON public.reprint_solicitud;
CREATE POLICY reprint_solicitud_select_anon ON public.reprint_solicitud
  FOR SELECT
  TO anon
  USING (true);
