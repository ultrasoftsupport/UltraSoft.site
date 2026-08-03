-- Migration v45: Password Hash Normalization & GoTrue Fallback Verification RPC

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Helper RPC to verify user password against auth.users encrypted_password safely
CREATE OR REPLACE FUNCTION public.verify_system_user_password(
    p_user_id uuid,
    p_password text
)
RETURNS boolean AS $$
DECLARE
    v_encrypted_password text;
BEGIN
    SELECT encrypted_password INTO v_encrypted_password
    FROM auth.users
    WHERE id = p_user_id;

    IF v_encrypted_password IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_encrypted_password = crypt(p_password, v_encrypted_password);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update admin_create_worker with standard blowfish salt cost factor (10)
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.verify_system_user_password(uuid, text) TO anon, authenticated, service_role;
