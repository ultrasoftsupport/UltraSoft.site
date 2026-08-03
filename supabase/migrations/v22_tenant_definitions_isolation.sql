-- =========================================================================
-- 🚀 MIGRATION V22: TENANT DEFINITIONS ISOLATION & COMPOSITE UNIQUE CONSTRAINTS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Changes unique constraints for categories, classes, sizes, 
--    and colors to be scoped per tenant (tenant_id, name / color_code), 
--    allowing each factory to independently define its own categories, 
--    colors, sizes, and age classes without conflicts or cross-tenant leaks.
-- =========================================================================

-- 1. Categories Unique Constraint per Tenant
DO $$
BEGIN
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_tenant_id_key;
    ALTER TABLE public.categories ADD CONSTRAINT categories_name_tenant_id_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Classes (Age Groups) Unique Constraint per Tenant
DO $$
BEGIN
    ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_key;
    ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_tenant_id_key;
    ALTER TABLE public.classes ADD CONSTRAINT classes_name_tenant_id_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Sizes Unique Constraint per Tenant
DO $$
BEGIN
    ALTER TABLE public.sizes DROP CONSTRAINT IF EXISTS sizes_name_key;
    ALTER TABLE public.sizes DROP CONSTRAINT IF EXISTS sizes_name_tenant_id_key;
    ALTER TABLE public.sizes ADD CONSTRAINT sizes_name_tenant_id_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Colors Unique Constraint per Tenant
DO $$
BEGIN
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_color_code_key;
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_color_code_tenant_id_key;
    ALTER TABLE public.colors ADD CONSTRAINT colors_color_code_tenant_id_key UNIQUE (tenant_id, color_code);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Fix any unassigned definitions records by assigning them to the default tenant
UPDATE public.categories SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.classes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.sizes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.colors SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.class_sizes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
