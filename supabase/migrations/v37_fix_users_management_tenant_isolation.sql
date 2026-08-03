-- Migration v37: Fix Multi-Tenant Isolation for Users Management & Enforce Single Owner Rule

-- 1. Ensure all system_users records have correct tenant_id assigned (if null)
UPDATE public.system_users 
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL AND username = 'owner123';

-- 2. Update admin_create_worker function to inherit creator's tenant_id & forbid creating 'owner'
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
    -- Verify calling user is an active owner/admin in system_users
    SELECT tenant_id INTO v_creator_tenant_id 
    FROM public.system_users
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin') AND is_active = true;

    IF v_creator_tenant_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. يجب أن تكون مالكاً أو مشرفاً نشطاً.';
    END IF;

    -- Strict Rule: Cannot create an 'owner' role via this interface
    IF p_role = 'owner' THEN
        RAISE EXCEPTION 'غير مسموح بإنشاء حساب مالك جديد. يتاح فقط إنشاء مشرفين وعمال.';
    END IF;

    v_user_id := gen_random_uuid();
    v_email := lower(trim(p_username)) || '@staff.devo.internal';
    v_hashed_password := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
        v_hashed_password, now(), '{"provider":"email","providers":["email"]}', '{}', 
        now(), now()
    );

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

-- 3. Update admin_update_worker to enforce tenant boundary & forbid escalating role to 'owner'
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
    v_target_role text;
    v_hashed_password text;
BEGIN
    SELECT tenant_id INTO v_creator_tenant_id 
    FROM public.system_users
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin') AND is_active = true;

    IF v_creator_tenant_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية.';
    END IF;

    -- Verify target user belongs to the same tenant
    SELECT role INTO v_target_role
    FROM public.system_users
    WHERE id = p_user_id AND tenant_id = v_creator_tenant_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير موجود أو لا ينتمي لنفس المصنع.';
    END IF;

    -- Disallow changing target to 'owner' if target wasn't already an owner
    IF p_role = 'owner' AND v_target_role != 'owner' THEN
        RAISE EXCEPTION 'غير مسموح برفع صلاحيات المستخدم إلى مالك.';
    END IF;

    -- Update system_users
    UPDATE public.system_users SET
        full_name = p_full_name,
        username = lower(trim(p_username)),
        role = CASE WHEN v_target_role = 'owner' THEN 'owner' ELSE p_role END,
        worker_job = p_worker_job,
        is_active = p_is_active
    WHERE id = p_user_id AND tenant_id = v_creator_tenant_id;

    -- Update password in auth.users if provided
    IF p_password IS NOT NULL AND trim(p_password) != '' THEN
        v_hashed_password := crypt(p_password, gen_salt('bf'));
        UPDATE auth.users SET
            encrypted_password = v_hashed_password,
            updated_at = now()
        WHERE id = p_user_id;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
