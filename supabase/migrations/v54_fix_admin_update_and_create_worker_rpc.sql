-- =========================================================================
-- 🚀 MIGRATION V54: RESILIENT ADMIN UPDATE & CREATE WORKER RPC FUNCTIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Fixes admin_update_worker and admin_create_worker RPCs
--    to eliminate false-positive tenant mismatch 400 errors during worker updates.
-- =========================================================================

-- 1. Resilient admin_update_worker RPC
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
    v_target_tenant_id uuid;
    v_target_role text;
    v_hashed_password text;
    v_new_email text;
    v_tenant_settings jsonb;
BEGIN
    -- Fetch target user's current tenant_id and role directly
    SELECT tenant_id, role INTO v_target_tenant_id, v_target_role
    FROM public.system_users
    WHERE id = p_user_id;

    IF v_target_tenant_id IS NULL AND v_target_role IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير موجود في النظام.';
    END IF;

    -- Disallow changing non-owner to 'owner'
    IF p_role = 'owner' AND (v_target_role IS NULL OR v_target_role != 'owner') THEN
        RAISE EXCEPTION 'غير مسموح برفع صلاحيات المستخدم إلى مالك.';
    END IF;

    v_new_email := lower(trim(p_username)) || '@staff.devo.internal';

    -- Update system_users
    UPDATE public.system_users SET
        full_name = p_full_name,
        username = lower(trim(p_username)),
        role = CASE WHEN v_target_role = 'owner' THEN 'owner' ELSE p_role END,
        worker_job = p_worker_job,
        is_active = p_is_active,
        email = v_new_email
    WHERE id = p_user_id;

    -- Update auth.users password & email if password provided
    IF p_password IS NOT NULL AND trim(p_password) != '' THEN
        v_hashed_password := crypt(p_password, gen_salt('bf', 10));
        UPDATE auth.users SET
            encrypted_password = v_hashed_password,
            email = v_new_email,
            updated_at = now()
        WHERE id = p_user_id;
    ELSE
        UPDATE auth.users SET
            email = v_new_email,
            updated_at = now()
        WHERE id = p_user_id;
    END IF;

    -- If target is owner, sync changes to tenants.settings (master_email & master_password)
    IF v_target_role = 'owner' AND v_target_tenant_id IS NOT NULL THEN
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

-- 2. Resilient admin_create_worker RPC
CREATE OR REPLACE FUNCTION public.admin_create_worker(
    p_full_name text,
    p_username text,
    p_password text,
    p_role text,
    p_worker_job text
)
RETURNS uuid AS $$
DECLARE
    v_user_id uuid;
    v_email text;
    v_hashed_password text;
    v_creator_tenant_id uuid;
BEGIN
    -- Try to get creator tenant_id from auth.uid() first
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_creator_tenant_id 
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    END IF;

    -- Fallback to current tenant ID resolution
    IF v_creator_tenant_id IS NULL THEN
        v_creator_tenant_id := public.current_tenant_id();
    END IF;

    IF v_creator_tenant_id IS NULL THEN
        v_creator_tenant_id := public.get_auth_user_tenant_id();
    END IF;

    IF v_creator_tenant_id IS NULL THEN
        v_creator_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    IF p_role = 'owner' THEN
        RAISE EXCEPTION 'غير مسموح بإنشاء حساب مالك جديد.';
    END IF;

    v_user_id := gen_random_uuid();
    v_email := lower(trim(p_username)) || '@staff.devo.internal';
    v_hashed_password := crypt(p_password, gen_salt('bf', 10));

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at, is_super_admin
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
        v_hashed_password, now(), '{"provider":"email","providers":["email"]}', '{}', 
        now(), now(), false
    );

    DELETE FROM auth.identities WHERE user_id = v_user_id;

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        v_user_id, v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', NULL, now(), now()
    );

    INSERT INTO public.system_users (
        id, full_name, username, role, worker_job, is_active, tenant_id, email
    ) VALUES (
        v_user_id, p_full_name, lower(trim(p_username)), p_role, p_worker_job, true, v_creator_tenant_id, v_email
    );

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant proper permissions
GRANT EXECUTE ON FUNCTION public.admin_update_worker(uuid, text, text, text, text, text, boolean) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_worker(text, text, text, text, text) TO authenticated, anon, service_role;
