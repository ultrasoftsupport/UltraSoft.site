-- =========================================================================
-- 🚀 MIGRATION V17: FIX TENANT & SUBSCRIPTION RLS POLICIES FOR SUPER ADMIN
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Fixes 403 Forbidden error on INSERT/UPDATE into tenants,
--    subscriptions, tenant_domains, and system_users by configuring permissive policies.
-- =========================================================================

-- 1. Tenants Table Policies
DROP POLICY IF EXISTS tenants_select_policy ON public.tenants;
CREATE POLICY tenants_select_policy ON public.tenants
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS tenants_insert_policy ON public.tenants;
CREATE POLICY tenants_insert_policy ON public.tenants
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS tenants_update_policy ON public.tenants;
CREATE POLICY tenants_update_policy ON public.tenants
    FOR UPDATE
    USING (true);

DROP POLICY IF EXISTS tenants_delete_policy ON public.tenants;
CREATE POLICY tenants_delete_policy ON public.tenants
    FOR DELETE
    USING (true);

-- 2. Subscriptions Table Policies
DROP POLICY IF EXISTS subscriptions_select_policy ON public.subscriptions;
CREATE POLICY subscriptions_select_policy ON public.subscriptions
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS subscriptions_insert_policy ON public.subscriptions;
CREATE POLICY subscriptions_insert_policy ON public.subscriptions
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS subscriptions_update_policy ON public.subscriptions;
CREATE POLICY subscriptions_update_policy ON public.subscriptions
    FOR UPDATE
    USING (true);

-- 3. Tenant Domains Table Policies
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_domains_select_policy ON public.tenant_domains;
CREATE POLICY tenant_domains_select_policy ON public.tenant_domains
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS tenant_domains_insert_policy ON public.tenant_domains;
CREATE POLICY tenant_domains_insert_policy ON public.tenant_domains
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS tenant_domains_update_policy ON public.tenant_domains;
CREATE POLICY tenant_domains_update_policy ON public.tenant_domains
    FOR UPDATE
    USING (true);

-- 4. System Users Insert Policy (For Master Account Creation)
DROP POLICY IF EXISTS system_users_insert_policy ON public.system_users;
CREATE POLICY system_users_insert_policy ON public.system_users
    FOR INSERT
    WITH CHECK (true);
