-- Migration v44: Fix auth.users GoTrue schema compatibility & password verification

-- 1. Ensure all auth.users rows have GoTrue required metadata & confirmed status
UPDATE auth.users 
SET 
    aud = 'authenticated',
    role = 'authenticated',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
    is_super_admin = false;

-- 2. Update admin_create_worker to populate all required GoTrue fields cleanly
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
    SELECT tenant_id INTO v_creator_tenant_id 
    FROM public.system_users
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin') AND is_active = true;

    IF v_creator_tenant_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية.';
    END IF;

    IF p_role = 'owner' THEN
        RAISE EXCEPTION 'غير مسموح بإنشاء حساب مالك جديد.';
    END IF;

    v_user_id := gen_random_uuid();
    v_email := lower(trim(p_username)) || '@staff.devo.internal';
    v_hashed_password := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at, is_super_admin
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
        v_hashed_password, now(), '{"provider":"email","providers":["email"]}', '{}', 
        now(), now(), false
    );

    -- Clean old identity if exists and insert fresh identity
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
