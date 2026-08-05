-- =========================================================================
-- 🚀 MIGRATION V58: ENFORCE TEAM USER SUBSCRIPTION LIMITS (max_users)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description: Enforces max_users subscription limit inside admin_create_worker 
--    and via PL/pgSQL database trigger on public.system_users.
-- =========================================================================

-- 1. Create trigger function on system_users BEFORE INSERT
CREATE OR REPLACE FUNCTION public.check_user_subscription_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_max_users integer;
    v_current_count integer;
BEGIN
    SELECT max_users INTO v_max_users
    FROM public.subscriptions
    WHERE tenant_id = NEW.tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If unlimited plan (-1 or >= 99999), allow insertion
    IF v_max_users IS NULL OR v_max_users = -1 OR v_max_users >= 99999 THEN
        RETURN NEW;
    END IF;

    -- Count existing users for this tenant
    SELECT count(*) INTO v_current_count
    FROM public.system_users
    WHERE tenant_id = NEW.tenant_id;

    IF v_current_count >= v_max_users THEN
        RAISE EXCEPTION 'SUBSCRIPTION_LIMIT_EXCEEDED: تم الوصول للحد الأقصى لعدد مستخدمي فريق العمل بالباقة (الحد الأقصى: % مستخدم). يرجى الترقية.', v_max_users
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_user_subscription_limits ON public.system_users;
CREATE TRIGGER trg_check_user_subscription_limits
    BEFORE INSERT ON public.system_users
    FOR EACH ROW EXECUTE FUNCTION public.check_user_subscription_limits();

-- 2. Update admin_create_worker RPC to enforce max_users quota check
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
    v_max_users integer;
    v_current_users_count integer;
BEGIN
    -- Resolve creator tenant ID
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_creator_tenant_id 
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    END IF;

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

    -- 🛑 Check subscription max_users quota limit
    SELECT max_users INTO v_max_users
    FROM public.subscriptions
    WHERE tenant_id = v_creator_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_max_users IS NOT NULL AND v_max_users <> -1 AND v_max_users < 99999 THEN
        SELECT count(*) INTO v_current_users_count
        FROM public.system_users
        WHERE tenant_id = v_creator_tenant_id;

        IF v_current_users_count >= v_max_users THEN
            RAISE EXCEPTION 'SUBSCRIPTION_LIMIT_EXCEEDED: تم الوصول للحد الأقصى لعدد مستخدمي فريق العمل بالباقة (الحد الأقصى: % مستخدم). يرجى الترقية.', v_max_users
                USING ERRCODE = 'P0001';
        END IF;
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

    INSERT INTO public.system_users (
        id, tenant_id, full_name, username, role, worker_job, is_active, created_at
    ) VALUES (
        v_user_id, v_creator_tenant_id, trim(p_full_name), lower(trim(p_username)), p_role, p_worker_job, true, now()
    );

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_create_worker(text, text, text, text, text) TO authenticated, anon, service_role;
