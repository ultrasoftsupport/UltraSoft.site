-- Migration v43: Strict Authenticated Tenant Isolation Policy for system_users

ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_users_select_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_authenticated_select_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_anon_select_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_tenant_isolation_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_write_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_authenticated_write_policy ON public.system_users;

-- 1. SELECT Policy for Authenticated Users (Strict Tenant Isolation)
CREATE POLICY system_users_authenticated_select_policy ON public.system_users
FOR SELECT
TO authenticated
USING (
    -- Super Admin has full platform access
    public.get_auth_user_role() = 'super_admin'
    OR
    -- Tenant Users can ONLY select records matching their own tenant_id
    (tenant_id IS NOT NULL AND tenant_id = public.get_auth_user_tenant_id())
    OR
    -- Users can always see their own row
    id = auth.uid()
);

-- 2. SELECT Policy for Unauthenticated Anonymous Users (For login lookup phase)
CREATE POLICY system_users_anon_select_policy ON public.system_users
FOR SELECT
TO anon
USING (
    true
);

-- 3. WRITE Policy (INSERT, UPDATE, DELETE) for Authenticated Users Only
CREATE POLICY system_users_authenticated_write_policy ON public.system_users
FOR ALL
TO authenticated
USING (
    public.get_auth_user_role() = 'super_admin'
    OR 
    (tenant_id IS NOT NULL AND tenant_id = public.get_auth_user_tenant_id())
    OR
    id = auth.uid()
);

-- 4. Grant proper permissions
GRANT SELECT ON public.system_users TO anon;
GRANT ALL ON public.system_users TO authenticated;
GRANT ALL ON public.system_users TO service_role;
