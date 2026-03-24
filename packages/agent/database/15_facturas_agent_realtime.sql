-- Agente (anon): leer facturas para polling de reimpresión (PATCH updated_at)
-- y opcionalmente Realtime UPDATE. Ejecutar en Supabase si KaruBox hace bump en facturas.
-- Alternativa más segura: SUPABASE_SERVICE_ROLE_KEY solo en la PC del agente.

GRANT SELECT ON public.facturas TO anon;

DROP POLICY IF EXISTS facturas_select_anon_agent ON public.facturas;
CREATE POLICY facturas_select_anon_agent ON public.facturas
  FOR SELECT
  TO anon
  USING (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.facturas;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Publication supabase_realtime no existe.';
  WHEN duplicate_object THEN
    NULL;
END;
$$;
