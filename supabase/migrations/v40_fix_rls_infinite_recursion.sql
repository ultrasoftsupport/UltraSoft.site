-- Migration v40: Fix RLS Infinite Recursion on system_users table

-- 1. Helper SECURITY DEFINER functions to bypass RLS recursion during auth policy evaluation
CREATE OR REPLACE FUNCTION public.get_auth_user_tenant_id()
RETURNS uuid AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid();
    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS text AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.system_users WHERE id = auth.uid();
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Drop recursive policy
DROP POLICY IF EXISTS system_users_tenant_isolation_policy ON public.system_users;

-- 3. Re-create non-recursive isolated policy
CREATE POLICY system_users_tenant_isolation_policy ON public.system_users
FOR ALL
USING (
    -- User can always read/update their own profile
    id = auth.uid()
    OR
    -- Super Admin has full platform access
    public.get_auth_user_role() = 'super_admin'
    OR
    -- Tenant users can only access users within their matching tenant_id
    (tenant_id IS NOT NULL AND tenant_id = public.get_auth_user_tenant_id())
);

-- Grant proper permissions
GRANT EXECUTE ON FUNCTION public.get_auth_user_tenant_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_user_role() TO authenticated, anon, service_role;
