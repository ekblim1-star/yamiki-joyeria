-- ==============================================================================
-- YAMIKI JOYERÍA - MIGRACIÓN DE BLINDAJE DE SEGURIDAD (01_security_hardening.sql)
-- Principio: Menor Privilegio Estricto (Sin permisos globales innecesarios)
-- ==============================================================================

-- 1. TABLA PERSISTENTE PARA RATE LIMITING DE ACCESO ADMINISTRATIVO
CREATE TABLE IF NOT EXISTS public.admin_rate_limit (
    ip_address TEXT PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS en admin_rate_limit y revocar todo acceso a anon, authenticated y public
ALTER TABLE public.admin_rate_limit ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.admin_rate_limit TO service_role;
REVOKE ALL ON TABLE public.admin_rate_limit FROM anon, authenticated, public;

DROP POLICY IF EXISTS "service_role_all_rate_limit" ON public.admin_rate_limit;
CREATE POLICY "service_role_all_rate_limit"
ON public.admin_rate_limit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. ASEGURAR COLUMNAS E ÍNDICES EN TABLA 'productos'
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS costo_real NUMERIC;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS ganancia_estimada NUMERIC;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS porcentaje_aumento TEXT;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS enlace_aliexpress TEXT;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS tienda_proveedor TEXT;

CREATE INDEX IF NOT EXISTS idx_productos_sku ON public.productos (codigo_sku);
CREATE INDEX IF NOT EXISTS idx_productos_aliexpress ON public.productos (id_aliexpress);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos (activo);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos (categoria);

-- 3. PRIVILEGIOS SQL ESTRICTOS SOBRE TABLA 'productos'
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.productos TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Revocar cualquier permiso previo de tabla a anon, authenticated y public
REVOKE ALL ON TABLE public.productos FROM anon, authenticated, public;

-- Revocación explícita y específica de las cinco columnas confidenciales
-- (Garantiza que ningún permiso residual a nivel de columna persista en pg_attribute)
REVOKE ALL (
    costo_real,
    ganancia_estimada,
    porcentaje_aumento,
    enlace_aliexpress,
    tienda_proveedor
) ON TABLE public.productos FROM anon, authenticated, public;

-- Conceder a anon y authenticated permisos SELECT ÚNICAMENTE sobre las 21 columnas públicas.
-- Nota: 'costo_real', 'ganancia_estimada', 'porcentaje_aumento', 'enlace_aliexpress' y 'tienda_proveedor'
-- NO son concedidos a anon ni authenticated bajo ninguna circunstancia.
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

-- 4. ROW LEVEL SECURITY (RLS) EN TABLA 'productos'
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Limpieza inteligente de políticas existentes en 'productos':
-- Elimina cualquier política de mutación (INSERT, UPDATE, DELETE, ALL) para anon, authenticated o public
-- y cualquier política permisiva previa de SELECT para asegurar que solo se consulten joyas activas.
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (
        SELECT policyname, cmd, roles
        FROM pg_policies
        WHERE schemaname = 'public' 
          AND tablename = 'productos'
          AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles) OR 'public' = ANY(roles))
    ) LOOP
        -- Eliminar cualquier política de mutación para clientes
        IF pol.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.productos', pol.policyname);
        -- Eliminar políticas de SELECT permisivas previas
        ELSIF pol.cmd = 'SELECT' AND pol.policyname <> 'anon_select_active_products' THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.productos', pol.policyname);
        END IF;
    END LOOP;
END $$;

-- Eliminar políticas antiguas conocidas por nombre
DROP POLICY IF EXISTS "Permitir todo a anon" ON public.productos;
DROP POLICY IF EXISTS "Public access" ON public.productos;
DROP POLICY IF EXISTS "Lectura publica catalogo activo" ON public.productos;
DROP POLICY IF EXISTS "anon_select_active_products" ON public.productos;
DROP POLICY IF EXISTS "service_role_all_products" ON public.productos;

-- Política RLS estricta: anon y authenticated solo pueden consultar joyas activas
CREATE POLICY "anon_select_active_products"
ON public.productos
FOR SELECT
TO anon, authenticated
USING (activo = true);

-- Política explícita de acceso total para service_role (backend administrativo)
CREATE POLICY "service_role_all_products"
ON public.productos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. VISTA PÚBLICA SEGURA 'catalogo_tienda' CON security_invoker = true
DROP VIEW IF EXISTS public.catalogo_tienda;

CREATE VIEW public.catalogo_tienda
WITH (security_invoker = true) AS
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

-- Conceder permisos de lectura en la vista a anon y acceso total al backend
GRANT SELECT ON public.catalogo_tienda TO anon, authenticated;
GRANT ALL ON public.catalogo_tienda TO service_role;

-- Prohibir cualquier mutación sobre la vista
REVOKE INSERT, UPDATE, DELETE ON public.catalogo_tienda FROM anon, authenticated, public;

-- 6. BLINDAJE DE STORAGE (BUCKET 'joyas')
-- Nota: En Supabase Cloud, storage.objects y storage.buckets son propiedad de supabase_storage_admin
-- y ya tienen RLS habilitado (relrowsecurity = true) de forma nativa.

-- Privilegios indispensables en Storage para service_role (Backend exclusivo)
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO service_role;
GRANT SELECT ON TABLE storage.buckets TO service_role;

-- Revocar permisos de modificación en storage a anon, authenticated y public
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.buckets FROM anon, authenticated, public;

-- Conceder exclusivamente lectura de objetos y buckets en storage para clientes
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON TABLE storage.objects TO anon, authenticated, public;
GRANT SELECT ON TABLE storage.buckets TO anon, authenticated, public;

-- Limpieza dinámica de políticas en storage.objects:
-- Elimina CUALQUIER política de subida, modificación o eliminación dirigida a anon, authenticated o public
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND (cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
          AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles) OR 'public' = ANY(roles))
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

-- Eliminar políticas antiguas conocidas de subida (incluyendo authenticated)
DROP POLICY IF EXISTS "Permitir subida anonima" ON storage.objects;
DROP POLICY IF EXISTS "Anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica fotos joyas" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access on storage" ON storage.objects;

-- Conceder exclusivamente lectura pública de objetos en el bucket 'joyas'
CREATE POLICY "Lectura publica fotos joyas"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'joyas');

-- Doble garantía de seguridad: Política explícita de acceso total para service_role
CREATE POLICY "Service role full access on storage"
ON storage.objects
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Política para permitir lectura pública de metadatos de buckets públicos
DROP POLICY IF EXISTS "Allow public select on buckets" ON storage.buckets;
CREATE POLICY "Allow public select on buckets"
ON storage.buckets
FOR SELECT
TO public
USING (public = true);

DROP POLICY IF EXISTS "Service role select buckets" ON storage.buckets;
CREATE POLICY "Service role select buckets"
ON storage.buckets
FOR SELECT
TO service_role
USING (true);
