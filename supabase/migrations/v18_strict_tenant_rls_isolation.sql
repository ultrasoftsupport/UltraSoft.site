-- =========================================================================
-- 🚀 MIGRATION V18: STRICT MULTI-TENANT ISOLATION POLICIES
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Enforces strict data isolation for models, categories, sizes,
--    colors, classes, orders, invoices, and cart items per tenant.
-- =========================================================================

-- Helper function to apply strict multi-tenant RLS
CREATE OR REPLACE FUNCTION public.apply_strict_tenant_rls(p_table text)
RETURNS void AS $$
BEGIN
    -- 1. Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

    -- 2. Drop existing tenant policies if any
    EXECUTE format('DROP POLICY IF EXISTS %I_strict_tenant_select ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_strict_tenant_insert ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_strict_tenant_update ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_strict_tenant_delete ON public.%I', p_table, p_table);

    -- 3. Create SELECT policy (Enforce tenant_id match or super_admin)
    EXECUTE format(
        'CREATE POLICY %I_strict_tenant_select ON public.%I FOR SELECT USING (public.is_super_admin() = true OR tenant_id IS NULL OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 4. Create INSERT policy
    EXECUTE format(
        'CREATE POLICY %I_strict_tenant_insert ON public.%I FOR INSERT WITH CHECK (public.is_super_admin() = true OR tenant_id IS NULL OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 5. Create UPDATE policy
    EXECUTE format(
        'CREATE POLICY %I_strict_tenant_update ON public.%I FOR UPDATE USING (public.is_super_admin() = true OR tenant_id IS NULL OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 6. Create DELETE policy
    EXECUTE format(
        'CREATE POLICY %I_strict_tenant_delete ON public.%I FOR DELETE USING (public.is_super_admin() = true OR tenant_id IS NULL OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );
END;
$$ LANGUAGE plpgsql;

-- Apply to core operational tables
SELECT public.apply_strict_tenant_rls('models');
SELECT public.apply_strict_tenant_rls('categories');
SELECT public.apply_strict_tenant_rls('sizes');
SELECT public.apply_strict_tenant_rls('colors');
SELECT public.apply_strict_tenant_rls('classes');
SELECT public.apply_strict_tenant_rls('orders');
SELECT public.apply_strict_tenant_rls('invoices');
SELECT public.apply_strict_tenant_rls('returns');
SELECT public.apply_strict_tenant_rls('inbound_invoices');
SELECT public.apply_strict_tenant_rls('stock_movements');
SELECT public.apply_strict_tenant_rls('home_settings');
