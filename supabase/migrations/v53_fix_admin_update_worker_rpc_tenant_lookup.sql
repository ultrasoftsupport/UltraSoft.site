-- =========================================================================
-- 🚀 MIGRATION V53: FIX ADMIN_UPDATE_WORKER RPC TENANT LOOKUP & PERMISSIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Fixes admin_update_worker to determine tenant context
--    from target user and allow updating worker/admin roles safely.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_update_worker(
    p_user_id uuid,
    p_full_name text,
    p_username text,
    p_password text,
    p_role text,
    p_worker_job text,
    p_is_active boolean
)
RETURNS boolean AS $$
DECLARE
    v_creator_tenant_id uuid;
    v_target_tenant_id uuid;
    v_target_role text;
    v_hashed_password text;
    v_new_email text;
    v_tenant_settings jsonb;
BEGIN
    -- 1. Fetch target user's current tenant_id and role directly
    SELECT tenant_id, role INTO v_target_tenant_id, v_target_role
    FROM public.system_users
    WHERE id = p_user_id;

    IF v_target_tenant_id IS NULL OR v_target_role IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير موجود في النظام.';
    END IF;

    -- 2. Fetch creator tenant_id if auth.uid() is available
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_creator_tenant_id 
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;

        -- Verify boundary if creator is not super admin
        IF v_creator_tenant_id IS NOT NULL AND public.get_auth_user_role() != 'super_admin' THEN
            IF v_creator_tenant_id != v_target_tenant_id THEN
                RAISE EXCEPTION 'المستخدم غير موجود أو لا ينتمي لنفس المصنع.';
            END IF;
        END IF;
    END IF;

    -- 3. Disallow changing non-owner to 'owner'
    IF p_role = 'owner' AND v_target_role != 'owner' THEN
        RAISE EXCEPTION 'غير مسموح برفع صلاحيات المستخدم إلى مالك.';
    END IF;

    v_new_email := lower(trim(p_username)) || '@staff.devo.internal';

    -- 4. Update system_users
    UPDATE public.system_users SET
        full_name = p_full_name,
        username = lower(trim(p_username)),
        role = CASE WHEN v_target_role = 'owner' THEN 'owner' ELSE p_role END,
        worker_job = p_worker_job,
        is_active = p_is_active,
        email = v_new_email
    WHERE id = p_user_id AND tenant_id = v_target_tenant_id;

    -- 5. Update auth.users password if provided
    IF p_password IS NOT NULL AND trim(p_password) != '' THEN
        v_hashed_password := crypt(p_password, gen_salt('bf'));
        UPDATE auth.users SET
            encrypted_password = v_hashed_password,
            email = v_new_email,
            updated_at = now()
        WHERE id = p_user_id;
    END IF;

    -- 6. If target is owner, sync changes to tenants.settings (master_email & master_password)
    IF v_target_role = 'owner' THEN
        SELECT settings INTO v_tenant_settings FROM public.tenants WHERE id = v_target_tenant_id;
        IF v_tenant_settings IS NULL THEN
            v_tenant_settings := '{}'::jsonb;
        END IF;

        v_tenant_settings := jsonb_set(v_tenant_settings, '{master_email}', to_jsonb(v_new_email));
        IF p_password IS NOT NULL AND trim(p_password) != '' THEN
            v_tenant_settings := jsonb_set(v_tenant_settings, '{master_password}', to_jsonb(p_password));
        END IF;

        UPDATE public.tenants SET
            settings = v_tenant_settings,
            email = v_new_email,
            updated_at = now()
        WHERE id = v_target_tenant_id;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_update_worker(uuid, text, text, text, text, text, boolean) TO authenticated, anon, service_role;
