-- Migration v42: Fix RLS Policy for Anonymous Login Lookup & System Users Access

ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_users_tenant_isolation_policy ON public.system_users;
DROP POLICY IF EXISTS system_users_select_policy ON public.system_users;

-- 1. Permissive SELECT policy for auth lookup and tenant isolation
CREATE POLICY system_users_select_policy ON public.system_users
FOR SELECT
USING (
    -- Unauthenticated users (login lookup phase)
    auth.uid() IS NULL
    OR
    -- User accessing their own profile
    id = auth.uid()
    OR
    -- Super admin role
    public.get_auth_user_role() = 'super_admin'
    OR
    -- Tenant isolation: users within matching tenant_id
    (tenant_id IS NOT NULL AND tenant_id = public.get_auth_user_tenant_id())
);

-- 2. Strict write policies (INSERT, UPDATE, DELETE) for authenticated users only
DROP POLICY IF EXISTS system_users_write_policy ON public.system_users;

CREATE POLICY system_users_write_policy ON public.system_users
FOR ALL
TO authenticated
USING (
    public.get_auth_user_role() = 'super_admin'
    OR
    (tenant_id IS NOT NULL AND tenant_id = public.get_auth_user_tenant_id())
    OR
    id = auth.uid()
);

-- 3. Grant table permissions
GRANT SELECT ON public.system_users TO anon;
GRANT ALL ON public.system_users TO authenticated;
GRANT ALL ON public.system_users TO service_role;
