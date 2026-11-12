-- ==============================================================================
-- YAMIKI JOYERÍA - PLAN DE CONTINGENCIA / ROLLBACK BLINDADO (01_rollback_plan.sql)
-- ==============================================================================
-- PRINCIPIO DE SEGURIDAD ABSOLUTO:
-- 1. BAJO NINGUNA CIRCUNSTANCIA SE OTORGA LECTURA GENERAL DE LA TABLA 'productos'.
--    (RLS protege únicamente filas, NO protege columnas. Un GRANT SELECT general
--    expondría inmediatamente costo_real, ganancia_estimada y datos de proveedores).
-- 2. LAS CINCO (5) COLUMNAS PRIVADAS PERMANECEN SIEMPRE DENEGADAS PARA anon Y authenticated.
-- 3. RLS PERMANECE ACTIVADO EN TODO MOMENTO (NO EJECUTAR DISABLE ROW LEVEL SECURITY).
-- 4. EL CATÁLOGO PÚBLICO CONTINÚA OPERATIVO MEDIANTE LA VISTA catalogo_tienda Y LAS
--    21 COLUMNAS PÚBLICAS AUTORIZADAS.
-- ==============================================================================

-- 1. REVOCAR PERMISOS TOTALES PREVIOS SOBRE 'productos'
REVOKE ALL ON TABLE public.productos FROM anon, authenticated, public;

-- 2. REVOCACIÓN EXPLÍCITA Y ESPECÍFICA DE LAS CINCO COLUMNAS CONFIDENCIALES
-- (Garantiza que ningún permiso residual a nivel de columna persista en pg_attribute)
REVOKE ALL (
    costo_real,
    ganancia_estimada,
    porcentaje_aumento,
    enlace_aliexpress,
    tienda_proveedor
) ON TABLE public.productos FROM anon, authenticated, public;

-- 3. CONCEDER SELECT EXCLUSIVAMENTE SOBRE LAS 21 COLUMNAS PÚBLICAS
GRANT SELECT (
    id,
    id_aliexpress,
    codigo_sku,
    titulo,
    categoria,
    color_modelo,
    tallas,
    precio_venta,
    descripcion,
    metal_material,
    tipo_piedra,
    especificaciones,
    foto_principal,
    galeria_fotos,
    estado_stock,
    activo,
    es_novedad,
    es_destacado,
    badge,
    created_at,
    updated_at
) ON public.productos TO anon, authenticated;

-- Garantizar acceso completo para el backend de administración (service_role)
GRANT ALL ON TABLE public.productos TO service_role;

-- 4. GARANTIZAR ROW LEVEL SECURITY (RLS) ACTIVO
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_active_products" ON public.productos;
CREATE POLICY "anon_select_active_products"
ON public.productos
FOR SELECT
TO anon, authenticated
USING (activo = true);

DROP POLICY IF EXISTS "service_role_all_products" ON public.productos;
CREATE POLICY "service_role_all_products"
ON public.productos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. RECONSTRUCCIÓN Y PERMISOS DE LA VISTA 'catalogo_tienda' PARA POSTGREST
DROP VIEW IF EXISTS public.catalogo_tienda;

CREATE VIEW public.catalogo_tienda AS
SELECT 
    id,
    id_aliexpress,
    codigo_sku,
    titulo,
    categoria,
    color_modelo,
    tallas,
    precio_venta,
    descripcion,
    metal_material,
    tipo_piedra,
    especificaciones,
    foto_principal,
    galeria_fotos,
    estado_stock,
    activo,
    es_novedad,
    es_destacado,
    badge,
    created_at,
    updated_at
FROM public.productos
WHERE activo = true;

-- Concesión de lectura sobre la vista para visitantes y anónimos
GRANT SELECT ON public.catalogo_tienda TO anon, authenticated;
GRANT ALL ON public.catalogo_tienda TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.catalogo_tienda FROM anon, authenticated, public;

-- 6. MANTENER LECTURA PÚBLICA DE STORAGE EN EL BUCKET 'joyas'
DROP POLICY IF EXISTS "Lectura publica fotos joyas" ON storage.objects;
CREATE POLICY "Lectura publica fotos joyas"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'joyas');
