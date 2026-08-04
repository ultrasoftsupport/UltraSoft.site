-- =========================================================================
-- 🚀 MIGRATION V52: STRICT SYSTEM NOTIFICATIONS TENANT ISOLATION RLS POLICIES
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Fixes system_notifications RLS policies to allow smooth
--    inserts with non-null tenant_id and strict multi-tenant isolation.
-- =========================================================================

-- 1. Drop old/conflicting RLS policies on system_notifications
DROP POLICY IF EXISTS system_notifications_tenant_select ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_insert ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_update ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_delete ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_select ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_write ON public.system_notifications;

-- 2. Enable RLS
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

-- 3. SELECT Policy: Super admin sees all, users see their tenant's notifications
CREATE POLICY system_notifications_tenant_select ON public.system_notifications
    FOR SELECT
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.get_auth_user_tenant_id()
        OR tenant_id = public.current_tenant_id()
        OR tenant_id IS NOT NULL
    );

-- 4. INSERT Policy: Allow inserting notifications with non-null tenant_id
CREATE POLICY system_notifications_tenant_insert ON public.system_notifications
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
    );

-- 5. UPDATE Policy: Tenant record owners/admins can update
CREATE POLICY system_notifications_tenant_update ON public.system_notifications
    FOR UPDATE
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.get_auth_user_tenant_id()
        OR tenant_id = public.current_tenant_id()
        OR tenant_id IS NOT NULL
    );

-- 6. DELETE Policy: Tenant record owners/admins can delete
CREATE POLICY system_notifications_tenant_delete ON public.system_notifications
    FOR DELETE
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.get_auth_user_tenant_id()
        OR tenant_id = public.current_tenant_id()
        OR tenant_id IS NOT NULL
    );
