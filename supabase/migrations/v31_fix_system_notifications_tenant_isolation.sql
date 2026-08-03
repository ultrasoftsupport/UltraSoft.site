-- =========================================================================
-- 🚀 MIGRATION V31: FIX SYSTEM_NOTIFICATIONS TENANT ISOLATION
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-03
-- 💡 Description: 
--    1. Backfill NULL tenant_id in system_notifications to default tenant
--    2. Fix RLS policies on system_notifications to allow NULL tenant_id records
--       and properly filter by tenant context
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. BACKFILL: تعيين tenant_id الافتراضي للإشعارات القديمة التي ليس لها tenant
-- -------------------------------------------------------------------------
UPDATE public.system_notifications
SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE tenant_id IS NULL;

-- -------------------------------------------------------------------------
-- 2. FIX RLS POLICIES: تحديث سياسات الصلاحيات لتدعم عزل المصانع
-- -------------------------------------------------------------------------

-- Drop all existing conflicting policies on system_notifications
DROP POLICY IF EXISTS system_notifications_select ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_write ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_select ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_insert ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_update ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_tenant_delete ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_strict_tenant_select ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_strict_tenant_insert ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_strict_tenant_update ON public.system_notifications;
DROP POLICY IF EXISTS system_notifications_strict_tenant_delete ON public.system_notifications;

-- Enable RLS (idempotent)
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: super admin sees all, tenant users see their own
CREATE POLICY system_notifications_tenant_select ON public.system_notifications
    FOR SELECT
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.current_tenant_id()
    );

-- INSERT: must belong to own tenant
CREATE POLICY system_notifications_tenant_insert ON public.system_notifications
    FOR INSERT
    WITH CHECK (
        public.is_super_admin() = true
        OR tenant_id = public.current_tenant_id()
    );

-- UPDATE: own tenant records only
CREATE POLICY system_notifications_tenant_update ON public.system_notifications
    FOR UPDATE
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.current_tenant_id()
    );

-- DELETE: own tenant records only
CREATE POLICY system_notifications_tenant_delete ON public.system_notifications
    FOR DELETE
    USING (
        public.is_super_admin() = true
        OR tenant_id = public.current_tenant_id()
    );
