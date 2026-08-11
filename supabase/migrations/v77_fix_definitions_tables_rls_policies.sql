-- =========================================================================
-- 🚀 MIGRATION V77: FIX RLS POLICIES & GRANTS FOR DEFINITION TABLES
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-11
-- 💡 Description: Fixes RLS policies and grants full permissions (authenticated, anon, service_role)
--    on definition tables (colors, categories, classes, sizes, class_sizes) with tenant isolation,
--    resolving 401 Unauthorized / RLS policy violations during Excel imports and definition management.
-- =========================================================================

-- 1. COLORS TABLE
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colors_public_select" ON public.colors;
DROP POLICY IF EXISTS "colors_select_public" ON public.colors;
DROP POLICY IF EXISTS "colors_admin_write" ON public.colors;
DROP POLICY IF EXISTS "colors_write_admin" ON public.colors;
DROP POLICY IF EXISTS "colors_strict_tenant_select" ON public.colors;
DROP POLICY IF EXISTS "colors_strict_tenant_insert" ON public.colors;
DROP POLICY IF EXISTS "colors_strict_tenant_update" ON public.colors;
DROP POLICY IF EXISTS "colors_strict_tenant_delete" ON public.colors;
DROP POLICY IF EXISTS "Allow select colors by tenant" ON public.colors;
DROP POLICY IF EXISTS "Allow write colors by tenant" ON public.colors;

CREATE POLICY "Allow select colors by tenant" ON public.colors
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write colors by tenant" ON public.colors
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

GRANT ALL ON public.colors TO authenticated, anon, service_role;

-- 2. CATEGORIES TABLE
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_write" ON public.categories;
DROP POLICY IF EXISTS "categories_write_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_strict_tenant_select" ON public.categories;
DROP POLICY IF EXISTS "categories_strict_tenant_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_strict_tenant_update" ON public.categories;
DROP POLICY IF EXISTS "categories_strict_tenant_delete" ON public.categories;
DROP POLICY IF EXISTS "Allow select categories by tenant" ON public.categories;
DROP POLICY IF EXISTS "Allow write categories by tenant" ON public.categories;

CREATE POLICY "Allow select categories by tenant" ON public.categories
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write categories by tenant" ON public.categories
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

GRANT ALL ON public.categories TO authenticated, anon, service_role;

-- 3. CLASSES TABLE
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classes_public_select" ON public.classes;
DROP POLICY IF EXISTS "classes_select_public" ON public.classes;
DROP POLICY IF EXISTS "classes_admin_write" ON public.classes;
DROP POLICY IF EXISTS "classes_write_admin" ON public.classes;
DROP POLICY IF EXISTS "classes_strict_tenant_select" ON public.classes;
DROP POLICY IF EXISTS "classes_strict_tenant_insert" ON public.classes;
DROP POLICY IF EXISTS "classes_strict_tenant_update" ON public.classes;
DROP POLICY IF EXISTS "classes_strict_tenant_delete" ON public.classes;
DROP POLICY IF EXISTS "Allow select classes by tenant" ON public.classes;
DROP POLICY IF EXISTS "Allow write classes by tenant" ON public.classes;

CREATE POLICY "Allow select classes by tenant" ON public.classes
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write classes by tenant" ON public.classes
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

GRANT ALL ON public.classes TO authenticated, anon, service_role;

-- 4. SIZES TABLE
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sizes_public_select" ON public.sizes;
DROP POLICY IF EXISTS "sizes_select_public" ON public.sizes;
DROP POLICY IF EXISTS "sizes_admin_write" ON public.sizes;
DROP POLICY IF EXISTS "sizes_write_admin" ON public.sizes;
DROP POLICY IF EXISTS "sizes_strict_tenant_select" ON public.sizes;
DROP POLICY IF EXISTS "sizes_strict_tenant_insert" ON public.sizes;
DROP POLICY IF EXISTS "sizes_strict_tenant_update" ON public.sizes;
DROP POLICY IF EXISTS "sizes_strict_tenant_delete" ON public.sizes;
DROP POLICY IF EXISTS "Allow select sizes by tenant" ON public.sizes;
DROP POLICY IF EXISTS "Allow write sizes by tenant" ON public.sizes;

CREATE POLICY "Allow select sizes by tenant" ON public.sizes
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write sizes by tenant" ON public.sizes
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

GRANT ALL ON public.sizes TO authenticated, anon, service_role;

-- 5. CLASS_SIZES JUNCTION TABLE
ALTER TABLE public.class_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_sizes_public_select" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_select_public" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_admin_write" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_write_admin" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_strict_tenant_select" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_strict_tenant_insert" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_strict_tenant_update" ON public.class_sizes;
DROP POLICY IF EXISTS "class_sizes_strict_tenant_delete" ON public.class_sizes;
DROP POLICY IF EXISTS "Allow select class_sizes by tenant" ON public.class_sizes;
DROP POLICY IF EXISTS "Allow write class_sizes by tenant" ON public.class_sizes;

CREATE POLICY "Allow select class_sizes by tenant" ON public.class_sizes
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write class_sizes by tenant" ON public.class_sizes
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

GRANT ALL ON public.class_sizes TO authenticated, anon, service_role;
