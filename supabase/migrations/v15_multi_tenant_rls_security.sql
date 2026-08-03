-- =========================================================================
-- 🚀 MIGRATION V15: MULTI-TENANT RLS SECURITY & ISOLATION POLICIES
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Enforces Row-Level Security (RLS) across all tables to 
--    guarantee complete multi-tenant data isolation and super_admin overrides.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. RLS ON TENANTS & SUBSCRIPTIONS TABLES
-- -------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenants Policies
DROP POLICY IF EXISTS tenants_select_policy ON public.tenants;
CREATE POLICY tenants_select_policy ON public.tenants
    FOR SELECT
    USING (
        public.is_super_admin() = true 
        OR id = public.current_tenant_id()
        OR status = 'active' -- Allow public lookup for store dynamic loading
    );

DROP POLICY IF EXISTS tenants_admin_all_policy ON public.tenants;
CREATE POLICY tenants_admin_all_policy ON public.tenants
    FOR ALL
    USING (public.is_super_admin() = true);

-- Subscriptions Policies
DROP POLICY IF EXISTS subscriptions_select_policy ON public.subscriptions;
CREATE POLICY subscriptions_select_policy ON public.subscriptions
    FOR SELECT
    USING (
        public.is_super_admin() = true 
        OR tenant_id = public.current_tenant_id()
    );

DROP POLICY IF EXISTS subscriptions_admin_all_policy ON public.subscriptions;
CREATE POLICY subscriptions_admin_all_policy ON public.subscriptions
    FOR ALL
    USING (public.is_super_admin() = true);


-- -------------------------------------------------------------------------
-- 2. AUTOMATIC RLS POLICY GENERATOR FOR CORE TABLES
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_multi_tenant_rls(p_table text)
RETURNS void AS $$
BEGIN
    -- 1. Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

    -- 2. Drop existing tenant policies if any
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_insert ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_update ON public.%I', p_table, p_table);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_delete ON public.%I', p_table, p_table);

    -- 3. Create SELECT policy (Super admin sees all, Tenant sees their own data)
    EXECUTE format(
        'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT USING (public.is_super_admin() = true OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 4. Create INSERT policy
    EXECUTE format(
        'CREATE POLICY %I_tenant_insert ON public.%I FOR INSERT WITH CHECK (public.is_super_admin() = true OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 5. Create UPDATE policy
    EXECUTE format(
        'CREATE POLICY %I_tenant_update ON public.%I FOR UPDATE USING (public.is_super_admin() = true OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );

    -- 6. Create DELETE policy
    EXECUTE format(
        'CREATE POLICY %I_tenant_delete ON public.%I FOR DELETE USING (public.is_super_admin() = true OR tenant_id = public.current_tenant_id())',
        p_table, p_table
    );
END;
$$ LANGUAGE plpgsql;

-- Apply RLS isolation policies to all tenant tables
SELECT public.apply_multi_tenant_rls('categories');
SELECT public.apply_multi_tenant_rls('classes');
SELECT public.apply_multi_tenant_rls('sizes');
SELECT public.apply_multi_tenant_rls('colors');
SELECT public.apply_multi_tenant_rls('models');
SELECT public.apply_multi_tenant_rls('system_users');
SELECT public.apply_multi_tenant_rls('profiles');
SELECT public.apply_multi_tenant_rls('orders');
SELECT public.apply_multi_tenant_rls('invoices');
SELECT public.apply_multi_tenant_rls('returns');
SELECT public.apply_multi_tenant_rls('inbound_invoices');
SELECT public.apply_multi_tenant_rls('stock_movements');
SELECT public.apply_multi_tenant_rls('home_settings');
SELECT public.apply_multi_tenant_rls('promo_cards');
SELECT public.apply_multi_tenant_rls('themes');
SELECT public.apply_multi_tenant_rls('system_notifications');
SELECT public.apply_multi_tenant_rls('inventory_audits');
SELECT public.apply_multi_tenant_rls('system_backups_log');

-- Clean up policy generator helper
DROP FUNCTION IF EXISTS public.apply_multi_tenant_rls(text);












