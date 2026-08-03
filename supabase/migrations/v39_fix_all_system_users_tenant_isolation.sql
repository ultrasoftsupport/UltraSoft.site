-- Migration v39: Multi-Tenant System Users Data Isolation & Auth Alignment

-- 1. Align orphaned system_users to their proper tenant_id based on username / email pattern
UPDATE public.system_users 
SET tenant_id = t.id
FROM public.tenants t
WHERE (public.system_users.tenant_id IS NULL OR public.system_users.tenant_id = '00000000-0000-0000-0000-000000000001')
  AND (
      lower(public.system_users.username) LIKE '%' || lower(t.slug) || '%'
      OR lower(public.system_users.full_name) LIKE '%' || lower(t.name) || '%'
      OR lower(public.system_users.email) LIKE '%' || lower(t.slug) || '%'
  );

-- 2. Synchronize emails between auth.users, tenants, and system_users
UPDATE public.system_users su
SET email = COALESCE(su.email, au.email)
FROM auth.users au
WHERE su.id = au.id AND (su.email IS NULL OR su.email = '');

-- 3. Strict Row Level Security (RLS) for system_users
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_users_tenant_isolation_policy ON public.system_users;

CREATE POLICY system_users_tenant_isolation_policy ON public.system_users
FOR ALL
USING (
    -- Allow super_admin role full access
    (SELECT role FROM public.system_users WHERE id = auth.uid()) = 'super_admin'
    OR
    -- Allow tenant users access ONLY to records in their own tenant
    tenant_id = (SELECT tenant_id FROM public.system_users WHERE id = auth.uid())
    OR
    -- Allow fallback for auth bootstrapping
    id = auth.uid()
);

-- 4. Grant proper permissions
GRANT ALL ON public.system_users TO authenticated;
GRANT ALL ON public.system_users TO service_role;
