-- ==============================================================================
-- YAMIKI JOYERÍA - INICIALIZACIÓN Y BLINDAJE DE PROYECTO STAGING VACÍO
-- Archivo: 00_init_staging_project.sql
-- Compatible con: Supabase Cloud PostgreSQL 15+ (Proyecto Nuevo / Vacío)
-- Diseño: 100% Idempotente (Se puede ejecutar múltiples veces sin error ni duplicados)
-- Principio: Menor Privilegio Estricto (Sin permisos globales innecesarios)
-- ==============================================================================

-- 1. EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA 'productos' (Esquema funcionalmente compatible con frontend y API)
CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_aliexpress TEXT,
    codigo_sku TEXT,
    titulo TEXT NOT NULL,
    categoria TEXT DEFAULT 'anillos',
    color_modelo TEXT DEFAULT 'Única',
    tallas TEXT DEFAULT 'Ajustable',
    precio_venta NUMERIC NOT NULL DEFAULT 0,
    costo_real NUMERIC,
    ganancia_estimada NUMERIC,
    porcentaje_aumento TEXT,
    descripcion TEXT,
    metal_material TEXT DEFAULT 'Plata esterlina 925',
    tipo_piedra TEXT DEFAULT 'CIRCONITA',
    especificaciones TEXT,
    foto_principal TEXT,
    galeria_fotos JSONB DEFAULT '[]'::jsonb,
    enlace_aliexpress TEXT,
    tienda_proveedor TEXT,
    estado_stock TEXT DEFAULT 'Disponible',
    activo BOOLEAN DEFAULT true,
    es_novedad BOOLEAN DEFAULT false,
    es_destacado BOOLEAN DEFAULT false,
    badge TEXT DEFAULT 'PLATA S925',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alto rendimiento para búsqueda y filtrado
CREATE INDEX IF NOT EXISTS idx_productos_sku ON public.productos (codigo_sku);
CREATE INDEX IF NOT EXISTS idx_productos_aliexpress ON public.productos (id_aliexpress);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos (activo);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos (categoria);

-- Función y Trigger para actualización automática de updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_productos_updated_at ON public.productos;
CREATE TRIGGER trg_productos_updated_at
BEFORE UPDATE ON public.productos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- 3. TABLA DE RATE LIMITING ADMINISTRATIVO
CREATE TABLE IF NOT EXISTS public.admin_rate_limit (
    ip_address TEXT PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_rate_limit ENABLE ROW LEVEL SECURITY;

-- 4. BUCKET DE ALMACENAMIENTO 'joyas'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'joyas',
    'joyas',
    true,
    10485760, -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 5. DATOS SINTÉTICOS DE PRUEBA (CERO DATOS REALES DE CLIENTES)
INSERT INTO public.productos (
    id, id_aliexpress, codigo_sku, titulo, categoria, color_modelo, tallas,
    precio_venta, costo_real, ganancia_estimada, porcentaje_aumento,
    descripcion, enlace_aliexpress, tienda_proveedor,
    foto_principal, galeria_fotos, estado_stock, activo, es_novedad, es_destacado, badge
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    '9990001',
    'STG-RING-01',
    '[STAGING] Anillo Solitario Plata Ley S925 Prueba',
    'anillos',
    'Plateado',
    '6 - 7 - 8',
    399.00,
    110.00, -- Confidencial
    289.00, -- Confidencial
    '262%', -- Confidencial
    'Anillo de muestra sintético para validación de seguridad.',
    'https://es.aliexpress.com/item/fake-item-01.html', -- Confidencial
    'Proveedor Sintético Staging', -- Confidencial
    'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600',
    '["https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600"]'::jsonb,
    'Disponible',
    true,
    true,
    false,
    'PLATA S925'
),
(
    '00000000-0000-0000-0000-000000000002',
    '9990002',
    'STG-EAR-02',
    '[STAGING] Aretes Flor Circonita Plata S925 Prueba',
    'aretes',
    'Rosa',
    'Única',
    280.00,
    85.00,
    195.00,
    '229%',
    'Aretes de muestra sintéticos.',
    'https://es.aliexpress.com/item/fake-item-02.html',
    'Proveedor Sintético Staging',
    'https://images.unsplash.com/photo-1630019852942-f89202989a59?w=600',
    '[]'::jsonb,
    'Disponible',
    true,
    false,
    true,
    '🔥 OFERTA'
),
(
    '00000000-0000-0000-0000-000000000003',
    '9990003',
    'STG-INACT-03',
    '[STAGING] Joya Inactiva Oculta',
    'collares',
    'Única',
    'Ajustable',
    199.00,
    50.00,
    149.00,
    '298%',
    'Joya inactiva para probar que RLS la oculta de catalogo_tienda.',
    'https://es.aliexpress.com/item/fake-item-03.html',
    'Proveedor Sintético Staging',
    'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600',
    '[]'::jsonb,
    'Agotada',
    false, -- INACTIVO
    false,
    false,
    'PLATA S925'
)
ON CONFLICT (id) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    precio_venta = EXCLUDED.precio_venta,
    costo_real = EXCLUDED.costo_real,
    ganancia_estimada = EXCLUDED.ganancia_estimada,
    porcentaje_aumento = EXCLUDED.porcentaje_aumento,
    enlace_aliexpress = EXCLUDED.enlace_aliexpress,
    tienda_proveedor = EXCLUDED.tienda_proveedor,
    activo = EXCLUDED.activo;

-- 6. CONFIGURACIÓN EXPLÍCITA DE PRIVILEGIOS SQL (DEFENSA EN PROFUNDIDAD)

-- A. Asignar privilegios estrictamente necesarios al rol administrativo 'service_role'
GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.productos TO service_role;
GRANT ALL ON TABLE public.admin_rate_limit TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Privilegios MÍNIMOS indispensables en Storage para service_role (Sin permisos globales sobre todo el esquema)
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO service_role;
GRANT SELECT ON TABLE storage.buckets TO service_role;

-- B. Revocar todos los permisos a visitantes y roles anónimos/autenticados
REVOKE ALL ON TABLE public.productos FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.admin_rate_limit FROM anon, authenticated, public;

-- Revocar permisos de modificación en storage a anon/authenticated/public
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.buckets FROM anon, authenticated, public;

-- Conceder exclusivamente lectura de objetos y buckets en storage para clientes
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON TABLE storage.objects TO anon, authenticated, public;
GRANT SELECT ON TABLE storage.buckets TO anon, authenticated, public;

-- C. Conceder a 'anon' y 'authenticated' permisos SELECT ÚNICAMENTE en columnas públicas
-- Columnas confidenciales (costo_real, ganancia_estimada, porcentaje_aumento, enlace_aliexpress, tienda_proveedor)
-- quedan estrictamente bloqueadas para anon.
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

-- 7. ROW LEVEL SECURITY (RLS) EN TABLAS PRINCIPALES

-- RLS en 'productos'
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

-- RLS en 'admin_rate_limit'
DROP POLICY IF EXISTS "service_role_all_rate_limit" ON public.admin_rate_limit;
CREATE POLICY "service_role_all_rate_limit"
ON public.admin_rate_limit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. VISTA PÚBLICA SEGURA 'catalogo_tienda' CON security_invoker = true
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

-- Concesión de lectura a clientes y acceso total al backend
GRANT SELECT ON public.catalogo_tienda TO anon, authenticated;
GRANT ALL ON public.catalogo_tienda TO service_role;

-- Prohibición explícita de mutaciones sobre la vista para clientes
REVOKE INSERT, UPDATE, DELETE ON public.catalogo_tienda FROM anon, authenticated, public;

-- 9. POLÍTICAS DE RLS EN 'storage.objects' Y 'storage.buckets'
-- Nota: En Supabase Cloud, storage.objects y storage.buckets son propiedad de supabase_storage_admin
-- y ya tienen RLS habilitado (relrowsecurity = true) de forma nativa.

-- Limpieza dinámica justificada: Eliminar ÚNICAMENTE políticas que permitan escrituras a anon o public en storage.objects
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
          AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
    END LOOP;
END $$;

-- Limpiar nombres de políticas conocidas o preexistentes
DROP POLICY IF EXISTS "Permitir subida anonima" ON storage.objects;
DROP POLICY IF EXISTS "Anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica fotos joyas" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access on storage" ON storage.objects;

-- Conceder exclusivamente lectura pública de fotos del bucket 'joyas'
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
