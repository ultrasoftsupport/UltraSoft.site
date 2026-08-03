-- =========================================================================
-- 🚀 MIGRATION V23: FIX PER-TENANT COMPOSITE UNIQUE CONSTRAINTS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Dynamically drops all old global unique constraints (e.g. colors_code_key,
--    categories_name_key, etc.) and replaces them with per-tenant composite constraints
--    allowing different factories to use identical codes (#1, #2, etc.) independently!
-- =========================================================================

-- 1. COLORS TABLE (Drop colors_code_key, colors_color_code_key, colors_name_key)
DO $$
BEGIN
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_code_key;
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_color_code_key;
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_name_key;
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_tenant_code_key;
    ALTER TABLE public.colors DROP CONSTRAINT IF EXISTS colors_color_code_tenant_id_key;
    
    -- Drop any unique index on color_code or code if exists
    DROP INDEX IF EXISTS public.colors_code_key;
    DROP INDEX IF EXISTS public.colors_color_code_key;
    DROP INDEX IF EXISTS public.colors_name_key;

    ALTER TABLE public.colors ADD CONSTRAINT colors_tenant_code_key UNIQUE (tenant_id, color_code);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Colors constraint update info: %', SQLERRM;
END $$;

-- 2. CATEGORIES TABLE
DO $$
BEGIN
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_tenant_id_key;
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_tenant_name_key;
    DROP INDEX IF EXISTS public.categories_name_key;

    ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_name_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Categories constraint update info: %', SQLERRM;
END $$;

-- 3. CLASSES TABLE
DO $$
BEGIN
    ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_key;
    ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_name_tenant_id_key;
    ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_tenant_name_key;
    DROP INDEX IF EXISTS public.classes_name_key;

    ALTER TABLE public.classes ADD CONSTRAINT classes_tenant_name_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Classes constraint update info: %', SQLERRM;
END $$;

-- 4. SIZES TABLE
DO $$
BEGIN
    ALTER TABLE public.sizes DROP CONSTRAINT IF EXISTS sizes_name_key;
    ALTER TABLE public.sizes DROP CONSTRAINT IF EXISTS sizes_name_tenant_id_key;
    ALTER TABLE public.sizes DROP CONSTRAINT IF EXISTS sizes_tenant_name_key;
    DROP INDEX IF EXISTS public.sizes_name_key;

    ALTER TABLE public.sizes ADD CONSTRAINT sizes_tenant_name_key UNIQUE (tenant_id, name);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Sizes constraint update info: %', SQLERRM;
END $$;

-- 5. MODELS TABLE (factory_code & system_code per tenant)
DO $$
BEGIN
    ALTER TABLE public.models DROP CONSTRAINT IF EXISTS models_factory_code_key;
    ALTER TABLE public.models DROP CONSTRAINT IF EXISTS models_system_code_key;
    ALTER TABLE public.models DROP CONSTRAINT IF EXISTS models_tenant_factory_code_key;
    ALTER TABLE public.models DROP CONSTRAINT IF EXISTS models_tenant_system_code_key;
    DROP INDEX IF EXISTS public.models_factory_code_key;
    DROP INDEX IF EXISTS public.models_system_code_key;

    ALTER TABLE public.models ADD CONSTRAINT models_tenant_factory_code_key UNIQUE (tenant_id, factory_code);
    ALTER TABLE public.models ADD CONSTRAINT models_tenant_system_code_key UNIQUE (tenant_id, system_code);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Models constraint update info: %', SQLERRM;
END $$;

-- 6. ORDERS TABLE (invoice_number per tenant)
DO $$
BEGIN
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_invoice_number_key;
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tenant_invoice_number_key;
    DROP INDEX IF EXISTS public.orders_invoice_number_key;

    ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_invoice_number_key UNIQUE (tenant_id, invoice_number);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Orders constraint update info: %', SQLERRM;
END $$;
