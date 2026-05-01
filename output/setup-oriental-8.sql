-- ============================================
-- ATLAS BURGER - DATOS REALES DEL MENÚ
-- Actualiza el tenant "Lomitería Don Juan" a "Restaurante Oriental 8"
-- ============================================

-- Paso 1: Crear o actualizar el tenant Restaurante Oriental 8
DO $$
DECLARE
  v_tenant_id UUID;
  v_tenant_exists BOOLEAN;
  -- Variables para configuración de impresora
  -- NOTA: Con Supabase Realtime, NO se necesitan túneles
  -- El agente se conecta directamente a Supabase y escucha cambios
  -- Estos valores son solo para referencia (no se usan con Realtime)
  v_agent_ip TEXT := 'localhost';  -- No se usa con Realtime, pero se mantiene para compatibilidad
  v_agent_port INTEGER := 3001;  -- No se usa con Realtime, pero se mantiene para compatibilidad
  v_printer_id TEXT := 'oriental-8-printer-1';
BEGIN
  -- Verificar si el tenant oriental-8 ya existe
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'oriental-8';
  v_tenant_exists := (v_tenant_id IS NOT NULL);
  
  IF v_tenant_exists THEN
    -- Si existe, solo actualizar nombre y datos
    UPDATE tenants 
    SET 
      nombre = 'Restaurante Oriental 8',
      updated_at = NOW()
    WHERE id = v_tenant_id;
    
    -- Actualizar RUC si la columna existe
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'tenants' AND column_name = 'ruc'
    ) THEN
      UPDATE tenants 
      SET ruc = NULL -- TODO: Agregar RUC real de Restaurante Oriental 8
      WHERE id = v_tenant_id;
    END IF;
  ELSE
    -- Si no existe oriental-8, intentar actualizar desde lomiteria-don-juan
    -- PERO primero verificar que oriental-8 no exista (por si acaso)
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'oriental-8';
    
    IF v_tenant_id IS NULL THEN
      -- Solo actualizar si oriental-8 realmente no existe
      -- Usar subquery para verificar que no exista antes de actualizar
      UPDATE tenants 
      SET 
        nombre = 'Restaurante Oriental 8',
        slug = 'oriental-8',
        updated_at = NOW()
      WHERE slug = 'lomiteria-don-juan'
        AND NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'oriental-8');
      
      SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'oriental-8';
      
      -- Si tampoco existe lomiteria-don-juan, crear nuevo tenant
      IF v_tenant_id IS NULL THEN
        INSERT INTO tenants (nombre, slug, telefono, email, activo)
        VALUES ('Restaurante Oriental 8', 'oriental-8', NULL, NULL, true)
        ON CONFLICT (slug) DO UPDATE SET nombre = 'Restaurante Oriental 8', updated_at = NOW()
        RETURNING id INTO v_tenant_id;
        
        -- Si hubo conflicto, obtener el tenant existente
        IF v_tenant_id IS NULL THEN
          SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'oriental-8';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Paso 3: Eliminar productos y categorías existentes
  DELETE FROM productos WHERE tenant_id = v_tenant_id;
  DELETE FROM categorias WHERE tenant_id = v_tenant_id;
  
  -- Paso 3.1: Limpiar empleados existentes (opcional, comentado para mantener datos)
  -- DELETE FROM empleados WHERE tenant_id = v_tenant_id;

  -- Paso 4: Insertar categorías de Restaurante Oriental 8
  INSERT INTO categorias (tenant_id, nombre, descripcion, orden, activa) VALUES
  (v_tenant_id, 'Burger Atlas', 'Hamburguesas Atlas', 1, true),
  (v_tenant_id, 'Smash Atlas', 'Hamburguesas Smash', 2, true),
  (v_tenant_id, 'Entradas', 'Acompañamientos y entradas', 3, true),
  (v_tenant_id, 'Árabes', 'Sándwiches árabes', 4, true),
  (v_tenant_id, 'Bebidas', 'Bebidas frías', 5, true),
  (v_tenant_id, 'Agregados', 'Extras y aderezos', 6, true);

  -- Paso 5: Insertar productos de Burger Atlas
  INSERT INTO productos (tenant_id, categoria_id, nombre, descripcion, precio, disponible) VALUES
  
  -- BURGER ATLAS
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Cheese Kids', 'Pan, Carne, queso cheddar', 17000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Clásica', 'Pan, aderezo, carne premium, lechuga, cebolla, queso cheddar', 20000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Mega de Luxe', 'Pan, aderezo, carne premium, lechuga, cebolla, queso cheddar, Jamón', 23000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Mega BBQ', 'Pan, salsa barbacoa, carne premium, lechuga, cebolla, queso cheddar, bacon', 23000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Mega Onion', 'Pan, aderezo, carne premium, lechuga, cebolla salteada, pepinillos, queso cheddar, bacon', 23000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Mega Bacon', 'Pan, aderezo, carne premium, lechuga, cebolla, queso cheddar, doble bacon', 23000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Burcheddar', 'Pan, aderezo, carne premium, lechuga, cebolla, queso cheddar, bacon. Cheddar cremoso por encima del pan + bacon picado', 27000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Big Atlas Doble Libra', 'Pan, aderezo, cebolla, doble carne premium, doble queso cheddar', 27000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Big Atlas', 'Pan, aderezo, doble carne premium, cebolla, lechuga, doble queso cheddar, doble bacon', 30000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Yaguamboom', 'Exclusivo Patronales de Yaguarón. Bro, pan brioche, aderezo, lechuga, tomate, huevo, carne premium, cheddar, panceta', 25000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Burger Atlas'), 
   'Resacona', 'La resacona exclusivo de los días domingo. Pan, salsa picante, carne premium, cebolla morada, lechuga repolla, queso cheddar, bacon', 25000, true),

  -- SMASH ATLAS
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Smash Atlas'), 
   'Smash Atlas', 'Pan, aderezo, doble carne smash, cebolla, doble queso cheddar', 20000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Smash Atlas'), 
   'Smash Bacon', 'Pan, aderezo, doble carne smash, cebolla, doble queso cheddar, bacon', 23000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Smash Atlas'), 
   'Smash American Cuádruple', 'Pan, salsa atlas, lechuga Repollada, pepinillos, cuádruple, cuádruple carne Smash, cheddar', 32000, true),

  -- ENTRADAS
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Entradas'), 
   'Papas Pequeñas', 'Porción pequeña de papas fritas', 8000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Entradas'), 
   'Papas Medianas', 'Porción mediana de papas fritas', 10000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Entradas'), 
   'Papas Grandes', 'Porción grande de papas fritas', 12000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Entradas'), 
   'Nuggets', 'Nuggets de pollo', 12000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Entradas'), 
   'Agregado de Cheddar y Bacon', 'Agregado de cheddar y bacon para papas', 2000, true),

  -- ÁRABES
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Árabes'), 
   'Árabe Pollo', 'Pan árabe, cebolla, lechuga, repollo, salsa de ajo, pollo', 22000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Árabes'), 
   'Árabe Mixto', 'Pan árabe, cebolla, lechuga, repollo, salsa de ajo, pollo, carne', 22000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Árabes'), 
   'Árabe de Carne', 'Pan árabe, cebolla, lechuga, repollo, salsa de ajo, huevo, carne', 25000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Árabes'), 
   'Árabe XXL', 'Pan árabe, cebolla, lechuga, repollo, salsa de ajo, carne premium, pollo, jamón, cheddar, bacon', 30000, true),

  -- BEBIDAS
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Coca Cola Personal', 'Coca Cola tamaño personal', 5000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Coca Cola ½', 'Coca Cola media litro', 8000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Coca Cola Lata', 'Coca Cola en lata', 8000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Coca Cola 1,5L', 'Coca Cola botella 1.5 litros', 15000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Del Valle Jugo 200ml', 'Jugo Del Valle 200ml', 5000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Bebidas'), 
   'Del Valle Jugo 1.5LTS', 'Jugo Del Valle 1.5 litros', 15000, true),

  -- AGREGADOS
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Agregados'), 
   'Salsa de Ajo', 'Salsa de ajo (sin costo)', 0, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Agregados'), 
   'Ketchup', 'Ketchup (sin costo)', 0, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Agregados'), 
   'Papitas', 'Papitas (sin costo)', 0, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Agregados'), 
   'Barbacoa', 'Salsa barbacoa', 2000, true),
  
  (v_tenant_id, (SELECT id FROM categorias WHERE tenant_id = v_tenant_id AND nombre = 'Agregados'), 
   'Cheddar Derretido', 'Cheddar derretido', 3000, true);

  -- Paso 6: Ingredientes base y recetas
  DELETE FROM recetas_producto WHERE tenant_id = v_tenant_id;
  DELETE FROM ingredientes WHERE tenant_id = v_tenant_id;

  INSERT INTO ingredientes (tenant_id, slug, nombre, unidad, icono, precio_publico, stock_minimo_sugerido, descripcion, activo)
  VALUES
    (v_tenant_id, 'pan-brioche', 'Pan Brioche Atlas', 'unidad', '🥖', 4000, 40, 'Panes para burgers premium', true),
    (v_tenant_id, 'pan-smash', 'Pan Smash', 'unidad', '🍞', 3000, 60, 'Panes pequeños para smash burgers', true),
    (v_tenant_id, 'carne-120', 'Blend 120g', 'g', '🥩', 9000, 6000, 'Carne preparada para burgers clásicas', true),
    (v_tenant_id, 'carne-160', 'Blend 160g', 'g', '🍔', 11000, 8000, 'Carne premium para burgers especiales', true),
    (v_tenant_id, 'carne-90', 'Blend Smash 90g', 'g', '🍖', 7500, 5000, 'Carne para smash burgers', true),
    (v_tenant_id, 'cheddar', 'Queso Cheddar Bloque', 'g', '🧀', 3500, 3000, 'Bloques de cheddar para rallar', true),
    (v_tenant_id, 'bacon', 'Bacon Premium', 'g', '🥓', 4000, 2000, 'Bacon ahumado premium', true),
    (v_tenant_id, 'huevo', 'Huevos', 'unidad', '🥚', 2500, 60, 'Huevos frescos para toppings', true),
    (v_tenant_id, 'mix-verde', 'Mix Verde', 'g', '🥬', 1500, 1500, 'Lechuga, rúcula y espinaca frescas', true),
    (v_tenant_id, 'tomate', 'Tomate Laminado', 'g', '🍅', 1800, 1200, 'Tomates frescos laminados', true),
    (v_tenant_id, 'cebolla', 'Cebolla Picada', 'g', '🧅', 1200, 1000, 'Cebolla fresca picada', true),
    (v_tenant_id, 'salsa-house', 'Salsa House', 'ml', '🥣', 1200, 1500, 'Salsa especial de la casa', true),
    (v_tenant_id, 'salsa-smash', 'Salsa Smash', 'ml', '🔥', 1200, 1200, 'Salsa para smash burgers', true),
    (v_tenant_id, 'salsa-garlic', 'Salsa de Ajo', 'ml', '🧄', 1500, 1000, 'Salsa de ajo casera', true),
    (v_tenant_id, 'papa-frita', 'Papa Pre-frita', 'g', '🍟', 3000, 8000, 'Papas congeladas listas para freír', true),
    (v_tenant_id, 'aceite', 'Aceite de Fritura', 'ml', '🛢️', 1000, 5000, 'Aceite alto rendimiento para freidoras', true),
    (v_tenant_id, 'sal', 'Sal Especial', 'g', '🧂', 800, 500, 'Sal con mezcla de especias', true),
    (v_tenant_id, 'nugget', 'Nugget Congelado', 'unidad', '🍗', 2500, 100, 'Nuggets de pollo congelados', true),
    (v_tenant_id, 'pan-arabe', 'Pan Árabe', 'unidad', '🥙', 4500, 40, 'Pan árabe artesanal', true),
    (v_tenant_id, 'pollo-mechado', 'Pollo Mechado', 'g', '🍗', 6500, 3000, 'Pollo desmenuzado para rellenos', true),
    (v_tenant_id, 'coca-15', 'Coca Cola 1.5L', 'unidad', '🥤', 15000, 12, 'Gaseosa Coca Cola 1.5 litros', true);

  -- Recetas Clásica
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Clásica'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('pan-brioche', 1, 'unidad'),
    ('carne-120', 120, 'g'),
    ('cheddar', 30, 'g'),
    ('mix-verde', 15, 'g'),
    ('tomate', 20, 'g')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Mega Bacon
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Mega Bacon'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('pan-brioche', 1, 'unidad'),
    ('carne-160', 160, 'g'),
    ('cheddar', 40, 'g'),
    ('bacon', 35, 'g'),
    ('salsa-house', 20, 'ml')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Big Atlas
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Big Atlas'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('pan-brioche', 1, 'unidad'),
    ('carne-160', 320, 'g'),
    ('cheddar', 50, 'g'),
    ('huevo', 1, 'unidad'),
    ('mix-verde', 20, 'g')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Smash Atlas
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Smash Atlas'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('pan-smash', 1, 'unidad'),
    ('carne-90', 90, 'g'),
    ('cheddar', 25, 'g'),
    ('cebolla', 15, 'g'),
    ('salsa-smash', 15, 'ml')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Papas Grandes
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Papas Grandes'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('papa-frita', 300, 'g'),
    ('aceite', 40, 'ml'),
    ('sal', 3, 'g')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Nuggets
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Nuggets'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('nugget', 6, 'unidad'),
    ('aceite', 30, 'ml'),
    ('salsa-house', 15, 'ml')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Árabe Pollo
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Árabe Pollo'),
    ing.id,
    data.cantidad,
    data.unidad
  FROM (VALUES
    ('pan-arabe', 1, 'unidad'),
    ('pollo-mechado', 140, 'g'),
    ('mix-verde', 25, 'g'),
    ('salsa-garlic', 20, 'ml')
  ) AS data(slug, cantidad, unidad)
  JOIN ingredientes ing ON ing.tenant_id = v_tenant_id AND ing.slug = data.slug;

  -- Recetas Coca Cola 1,5L
  INSERT INTO recetas_producto (tenant_id, producto_id, ingrediente_id, cantidad, unidad)
  SELECT
    v_tenant_id,
    (SELECT id FROM productos WHERE tenant_id = v_tenant_id AND nombre = 'Coca Cola 1,5L'),
    ing.id,
    1,
    'unidad'
  FROM ingredientes ing
  WHERE ing.tenant_id = v_tenant_id
    AND ing.slug = 'coca-15';

  -- Paso 7: Insertar empleados de ejemplo (cajeros para app móvil)
  -- NOTA: Estos son empleados de ejemplo. Ajustar con datos reales.
  -- Si ya existen empleados, se insertarán duplicados. Para evitarlo, descomentar la línea DELETE de arriba.
  INSERT INTO empleados (tenant_id, nombre, ci, telefono, email, rol, activo)
  SELECT v_tenant_id, 'Juan Pérez', '1234567', '+595981234567', 'juan.perez@atlasburger.com', 'cajero', true
  WHERE NOT EXISTS (SELECT 1 FROM empleados WHERE tenant_id = v_tenant_id AND ci = '1234567');
  
  INSERT INTO empleados (tenant_id, nombre, ci, telefono, email, rol, activo)
  SELECT v_tenant_id, 'María González', '7654321', '+595981234568', 'maria.gonzalez@atlasburger.com', 'cajero', true
  WHERE NOT EXISTS (SELECT 1 FROM empleados WHERE tenant_id = v_tenant_id AND ci = '7654321');
  
  INSERT INTO empleados (tenant_id, nombre, ci, telefono, email, rol, activo)
  SELECT v_tenant_id, 'Carlos Rodríguez', '1122334', '+595981234569', NULL, 'repartidor', true
  WHERE NOT EXISTS (SELECT 1 FROM empleados WHERE tenant_id = v_tenant_id AND ci = '1122334');

  -- Paso 8: Configurar impresora para Restaurante Oriental 8
  -- ✅ CONFIGURACIÓN PARA SUPABASE REALTIME (SIN TÚNELES)
  -- 
  -- Con Supabase Realtime, el agente escucha cambios directamente en la tabla pedidos.
  -- Cuando estado_pedido = 'FACT' (facturado/confirmado), imprime automáticamente.
  -- 
  -- Flujo:
  -- 1. Vendedor confirma pedido → estado_pedido = 'FACT' en tabla pedidos
  -- 2. Supabase Realtime notifica al agente (WebSocket en tiempo real)
  -- 3. Agente consulta printer_config por lomiteria_id (tenant_id)
  -- 4. Agente obtiene items desde items_pedido
  -- 5. Agente imprime automáticamente usando el printer_id
  -- 
  -- ⚠️ IMPORTANTE: 
  -- 1. El agente debe tener configurado SUPABASE_URL y SUPABASE_ANON_KEY en .env
  -- 2. Realtime debe estar habilitado en Supabase para la tabla 'pedidos'
  -- 3. La impresora debe estar configurada en el agente con printer_id = 'oriental-8-printer-1'
  -- 4. El campo agent_ip y agent_port NO se usan con Realtime (se mantienen para compatibilidad)
  
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

  RAISE NOTICE '✅ Configuración de impresora actualizada para Restaurante Oriental 8';
  RAISE NOTICE '   - Printer ID: %', v_printer_id;
  RAISE NOTICE '   - Tenant ID: %', v_tenant_id;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Configuración para Supabase Realtime (SIN TÚNELES)';
  RAISE NOTICE '   - El agente escucha cambios en tabla pedidos';
  RAISE NOTICE '   - Imprime automáticamente cuando estado_pedido = ''FACT''';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Asegúrate de que:';
  RAISE NOTICE '   1. El agente tenga SUPABASE_URL y SUPABASE_ANON_KEY en .env';
  RAISE NOTICE '   2. Realtime esté habilitado en Supabase para la tabla ''pedidos''';
  RAISE NOTICE '   3. La impresora esté configurada en el agente con printer_id: %', v_printer_id;
  RAISE NOTICE '   4. ENABLE_SUPABASE_LISTENER=true en .env del agente';

  RAISE NOTICE '✅ Restaurante Oriental 8: Datos insertados correctamente';
  RAISE NOTICE 'Tenant ID: %', v_tenant_id;
  RAISE NOTICE 'Empleados: 2 cajeros y 1 repartidor insertados';
END $$;

-- Verificar datos insertados
SELECT 
  c.nombre as categoria,
  COUNT(p.id) as cantidad_productos,
  SUM(p.precio) as suma_precios
FROM categorias c
LEFT JOIN productos p ON c.id = p.categoria_id
WHERE c.tenant_id = (SELECT id FROM tenants WHERE slug = 'oriental-8')
GROUP BY c.nombre, c.orden
ORDER BY c.orden;

-- Mostrar todos los productos
SELECT 
  c.nombre as categoria,
  p.nombre as producto,
  p.descripcion,
  p.precio
FROM productos p
JOIN categorias c ON p.categoria_id = c.id
WHERE p.tenant_id = (SELECT id FROM tenants WHERE slug = 'oriental-8')
ORDER BY c.orden, p.nombre;

-- ============================================
-- ✅ SCRIPT COMPLETADO
-- ============================================
-- 
-- Este script:
-- 1. ✅ Actualiza el tenant "Lomitería Don Juan" a "Restaurante Oriental 8"
-- 2. ✅ Elimina productos y categorías antiguas
-- 3. ✅ Inserta todas las categorías del menú real
-- 4. ✅ Inserta todos los productos con precios en Guaraníes (GS)
-- 5. ✅ Mantiene el usuario existente vinculado
-- 6. ✅ Inserta empleados de ejemplo (cajeros y repartidores)
--
-- IMPORTANTE: 
-- - El usuario de login existente sigue funcionando
-- - Solo cambió el nombre del tenant y los productos
-- - Agregar RUC real en el UPDATE del tenant (línea ~10)
-- - Ajustar datos de empleados según necesidades reales
-- ============================================

