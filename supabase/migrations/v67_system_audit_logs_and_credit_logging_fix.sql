-- =========================================================================
-- 🚀 MIGRATION V67: SYSTEM AUDIT LOGS & CREDIT LOGGING TENANT ISOLATION FIX
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-06
-- 💡 Description: Creates public.system_audit_logs table and RPC function log_system_audit_event
--    for full tenant-isolated activity auditing across UltraSoft.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid,
    user_name text NOT NULL DEFAULT 'مستخدم النظام',
    user_role text DEFAULT 'staff',
    module text NOT NULL, -- 'orders', 'models', 'definitions', 'excel_imports', 'notifications', 'offers', 'settings', 'accounts', 'credits'
    action_type text NOT NULL, -- 'create', 'update', 'delete', 'bulk_edit', 'excel_import', 'status_change', 'recharge'
    entity_type text,
    entity_id text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.system_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.system_audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.system_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow select system_audit_logs by tenant" ON public.system_audit_logs;
CREATE POLICY "Allow select system_audit_logs by tenant" ON public.system_audit_logs
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

DROP POLICY IF EXISTS "Allow insert system_audit_logs" ON public.system_audit_logs;
CREATE POLICY "Allow insert system_audit_logs" ON public.system_audit_logs
FOR INSERT WITH CHECK (true);

-- RPC helper function
CREATE OR REPLACE FUNCTION public.log_system_audit_event(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_user_role text,
    p_module text,
    p_action_type text,
    p_entity_type text DEFAULT NULL,
    p_entity_id text DEFAULT NULL,
    p_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb AS $$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO public.system_audit_logs (
        tenant_id, user_id, user_name, user_role,
        module, action_type, entity_type, entity_id, details
    ) VALUES (
        p_tenant_id, p_user_id, COALESCE(p_user_name, 'مستخدم النظام'), COALESCE(p_user_role, 'staff'),
        p_module, p_action_type, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::jsonb)
    ) RETURNING id INTO v_log_id;

    RETURN jsonb_build_object('success', true, 'log_id', v_log_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_system_audit_event(uuid, uuid, text, text, text, text, text, text, jsonb) TO authenticated, anon, service_role;
GRANT SELECT, INSERT ON public.system_audit_logs TO authenticated, anon, service_role;
