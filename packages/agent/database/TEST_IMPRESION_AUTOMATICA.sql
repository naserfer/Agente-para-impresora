-- ============================================
-- SCRIPT DE PRUEBA: Impresión Automática
-- ============================================
-- 
-- Este script crea un pedido de prueba y lo confirma
-- para probar que la impresión automática funcione.
-- 
-- IMPORTANTE: 
-- - Asegúrate de que el agente esté corriendo
-- - Asegúrate de que Realtime esté habilitado para la tabla pedidos
-- - Asegúrate de que exista una configuración en printer_config
-- 
-- ============================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_pedido_id UUID;
  v_cliente_id UUID;
  v_producto_id UUID;
  v_numero_pedido INTEGER;
BEGIN
  -- 1. Obtener el tenant_id de Atlas Burger (o el que uses)
  SELECT id INTO v_tenant_id 
  FROM tenants 
  WHERE slug = 'atlas-burger' 
  LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el tenant atlas-burger. Ejecuta primero atlas-burguer.sql';
  END IF;
  
  RAISE NOTICE '✅ Tenant encontrado: %', v_tenant_id;
  
  -- 2. Crear o obtener un cliente de prueba
  SELECT id INTO v_cliente_id
  FROM clientes
  WHERE tenant_id = v_tenant_id
  LIMIT 1;
  
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (tenant_id, nombre, telefono, activo)
    VALUES (v_tenant_id, 'Cliente Prueba', '+595981234567', true)
    RETURNING id INTO v_cliente_id;
    RAISE NOTICE '✅ Cliente de prueba creado: %', v_cliente_id;
  ELSE
    RAISE NOTICE '✅ Cliente de prueba existente: %', v_cliente_id;
  END IF;
  
  -- 3. Obtener un producto existente
  SELECT id INTO v_producto_id
  FROM productos
  WHERE tenant_id = v_tenant_id
    AND disponible = true
  LIMIT 1;
  
  IF v_producto_id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron productos. Ejecuta primero atlas-burguer.sql';
  END IF;
  
  RAISE NOTICE '✅ Producto encontrado: %', v_producto_id;
  
  -- 4. Crear el pedido de prueba (inicialmente en estado EDIT)
  INSERT INTO pedidos (
    tenant_id,
    cliente_id,
    tipo,
    estado,
    estado_pedido,
    total,
    notas
  ) VALUES (
    v_tenant_id,
    v_cliente_id,
    'delivery',
    'pendiente',
    'EDIT',  -- Inicialmente en edición
    25000,   -- Total de prueba
    'Pedido de prueba para impresión automática'
  )
  RETURNING id, numero_pedido INTO v_pedido_id, v_numero_pedido;
  
  RAISE NOTICE '✅ Pedido creado: ID=%, Número=%', v_pedido_id, v_numero_pedido;
  
  -- 5. Agregar items al pedido
  INSERT INTO items_pedido (
    pedido_id,
    producto_id,
    producto_nombre,
    cantidad,
    precio_unitario,
    subtotal,
    notas
  )
  SELECT 
    v_pedido_id,
    p.id,
    p.nombre,
    2,
    p.precio,
    p.precio * 2,
    'Item de prueba'
  FROM productos p
  WHERE p.id = v_producto_id;
  
  RAISE NOTICE '✅ Items agregados al pedido';
  
  -- 6. Esperar un momento para que se procese
  PERFORM pg_sleep(1);
  
  -- 7. CONFIRMAR EL PEDIDO (esto dispara la impresión automática)
  UPDATE pedidos
  SET 
    estado_pedido = 'FACT',  -- ← Esto dispara la impresión automática
    estado = 'confirmado',
    updated_at = NOW()
  WHERE id = v_pedido_id;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎯 PEDIDO CONFIRMADO - Debería imprimirse automáticamente';
  RAISE NOTICE '   - Pedido ID: %', v_pedido_id;
  RAISE NOTICE '   - Número: %', v_numero_pedido;
  RAISE NOTICE '   - Estado: confirmado';
  RAISE NOTICE '   - Estado Pedido: FACT';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Verifica los logs del agente para ver:';
  RAISE NOTICE '   "Cambio detectado en pedidos: UPDATE"';
  RAISE NOTICE '   "✅ Pedido #% impreso automáticamente"', v_numero_pedido;
  RAISE NOTICE '';
  RAISE NOTICE '💡 Si no imprime, verifica:';
  RAISE NOTICE '   1. Que el agente esté corriendo';
  RAISE NOTICE '   2. Que Realtime esté habilitado (SELECT * FROM pg_publication_tables WHERE tablename = ''pedidos'')';
  RAISE NOTICE '   3. Que exista printer_config para este tenant';
  RAISE NOTICE '   4. Que la impresora esté configurada en el agente';
  
END $$;

-- ============================================
-- VERIFICACIÓN: Ver el pedido creado
-- ============================================

SELECT 
  p.id,
  p.numero_pedido,
  p.estado,
  p.estado_pedido,
  p.total,
  t.nombre as lomiteria,
  c.nombre as cliente,
  p.created_at,
  p.updated_at
FROM pedidos p
JOIN tenants t ON p.tenant_id = t.id
LEFT JOIN clientes c ON p.cliente_id = c.id
WHERE p.estado_pedido = 'FACT'
ORDER BY p.created_at DESC
LIMIT 5;

-- ============================================
-- VERIFICACIÓN: Ver items del pedido
-- ============================================

SELECT 
  ip.pedido_id,
  ip.producto_nombre,
  ip.cantidad,
  ip.precio_unitario,
  ip.subtotal,
  ip.notas
FROM items_pedido ip
WHERE ip.pedido_id = (
  SELECT id FROM pedidos 
  WHERE estado_pedido = 'FACT' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- ============================================
-- LIMPIAR: Eliminar pedido de prueba (opcional)
-- ============================================
-- 
-- Si quieres eliminar el pedido de prueba después:
-- 
-- DELETE FROM items_pedido WHERE pedido_id IN (
--   SELECT id FROM pedidos WHERE notas LIKE '%prueba para impresión%'
-- );
-- DELETE FROM pedidos WHERE notas LIKE '%prueba para impresión%';
-- 
-- ============================================










