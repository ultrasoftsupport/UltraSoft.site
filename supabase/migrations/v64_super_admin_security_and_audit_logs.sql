-- Migration v64: Super Admin High Security, Bcrypted Master PIN Hash & Comprehensive Audit Logs System

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Extend system_users table with Super Admin Security Hash columns
ALTER TABLE public.system_users
    ADD COLUMN IF NOT EXISTS security_pin_hash text,
    ADD COLUMN IF NOT EXISTS security_pin_enabled boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS failed_pin_attempts integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone,
    ADD COLUMN IF NOT EXISTS last_security_verify_at timestamp with time zone;

-- Set default bcrypt PIN hash for existing super_admin accounts if not set (default PIN: '123456')
UPDATE public.system_users
SET security_pin_hash = crypt('123456', gen_salt('bf', 10))
WHERE role = 'super_admin' AND (security_pin_hash IS NULL OR security_pin_hash = '');

-- Remove old raw security_pin column if it exists to strictly prevent plain text PIN storage
ALTER TABLE public.system_users DROP COLUMN IF EXISTS security_pin;

-- 2. Create Comprehensive Security Audit & Surveillance Logs Table
CREATE TABLE IF NOT EXISTS public.super_admin_security_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    username text NOT NULL,
    event_type text NOT NULL, -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'PIN_SUCCESS', 'PIN_FAILED', 'ACCOUNT_LOCKED', 'SUPER_ADMIN_CREATED', 'STATUS_TOGGLED', 'PIN_RESET', 'CREATE_TENANT', 'UPDATE_TENANT', 'TOGGLE_TENANT_STATUS', 'WIPE_TENANT_DATA', 'DELETE_TENANT', 'UPDATE_PLAN_LIMITS', 'RESET_OWNER_PASSWORD'
    severity text NOT NULL DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    ip_address text DEFAULT 'unknown',
    user_agent text DEFAULT 'unknown',
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_super_admin_security_logs_created_at ON public.super_admin_security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_super_admin_security_logs_event_type ON public.super_admin_security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_super_admin_security_logs_severity ON public.super_admin_security_logs(severity);

-- RLS Policies for super_admin_security_logs
ALTER TABLE public.super_admin_security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_security_logs_select_policy ON public.super_admin_security_logs;
CREATE POLICY super_admin_security_logs_select_policy ON public.super_admin_security_logs
    FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS super_admin_security_logs_insert_policy ON public.super_admin_security_logs;
CREATE POLICY super_admin_security_logs_insert_policy ON public.super_admin_security_logs
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

GRANT SELECT, INSERT ON public.super_admin_security_logs TO anon;
GRANT ALL ON public.super_admin_security_logs TO authenticated;
GRANT ALL ON public.super_admin_security_logs TO service_role;

-- 3. RPC Function to Log Security Events
CREATE OR REPLACE FUNCTION public.log_super_admin_security_event(
    p_user_id uuid,
    p_username text,
    p_event_type text,
    p_severity text DEFAULT 'LOW',
    p_ip text DEFAULT 'unknown',
    p_user_agent text DEFAULT 'unknown',
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.super_admin_security_logs (
        user_id,
        username,
        event_type,
        severity,
        ip_address,
        user_agent,
        details,
        created_at
    ) VALUES (
        p_user_id,
        COALESCE(NULLIF(TRIM(p_username), ''), 'system'),
        p_event_type,
        p_severity,
        COALESCE(p_ip, 'unknown'),
        COALESCE(p_user_agent, 'unknown'),
        COALESCE(p_details, '{}'::jsonb),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. RPC Function to Verify Super Admin Bcrypt Security PIN
CREATE OR REPLACE FUNCTION public.verify_super_admin_security_pin(
    p_user_id uuid,
    p_pin text,
    p_ip text DEFAULT 'unknown',
    p_user_agent text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user public.system_users%ROWTYPE;
    v_max_attempts constant integer := 3;
    v_lockout_duration constant interval := interval '15 minutes';
    v_is_pin_valid boolean := false;
BEGIN
    SELECT * INTO v_user
    FROM public.system_users
    WHERE id = p_user_id AND role = 'super_admin';

    IF NOT FOUND THEN
        PERFORM public.log_super_admin_security_event(
            p_user_id, 'unknown', 'UNAUTHORIZED_ACCESS', 'HIGH', p_ip, p_user_agent,
            jsonb_build_object('reason', 'User not found or not super_admin')
        );
        RETURN jsonb_build_object('success', false, 'message', 'حساب غير موجود أو غير مصرح له كـ Super Admin');
    END IF;

    -- Check if user account is active
    IF NOT v_user.is_active THEN
        PERFORM public.log_super_admin_security_event(
            v_user.id, v_user.username, 'LOGIN_FAILED', 'HIGH', p_ip, p_user_agent,
            jsonb_build_object('reason', 'Account is deactivated')
        );
        RETURN jsonb_build_object('success', false, 'message', 'هذا الحساب معطل حالياً، يرجى مراجعة إدارة النظام.');
    END IF;

    -- Check if currently locked out
    IF v_user.locked_until IS NOT NULL AND v_user.locked_until > timezone('utc'::text, now()) THEN
        PERFORM public.log_super_admin_security_event(
            v_user.id, v_user.username, 'PIN_FAILED', 'CRITICAL', p_ip, p_user_agent,
            jsonb_build_object('reason', 'Attempted PIN verification during lockout window', 'locked_until', v_user.locked_until)
        );
        RETURN jsonb_build_object(
            'success', false,
            'locked', true,
            'locked_until', v_user.locked_until,
            'message', 'الحساب محظور مؤقتاً بكود الحظر التلقائي بسبب محاولات خاطئة متكررة. يرجى الانتظار.'
        );
    END IF;

    -- Verify Bcrypt Hash of PIN
    IF v_user.security_pin_hash IS NULL OR TRIM(v_user.security_pin_hash) = '' THEN
        v_is_pin_valid := true; -- Fallback if PIN hash not set yet
    ELSE
        v_is_pin_valid := (v_user.security_pin_hash = crypt(p_pin, v_user.security_pin_hash));
    END IF;

    IF v_is_pin_valid THEN
        -- Success: Reset failed attempts & set last_security_verify_at
        UPDATE public.system_users
        SET failed_pin_attempts = 0,
            locked_until = NULL,
            last_security_verify_at = timezone('utc'::text, now())
        WHERE id = v_user.id;

        PERFORM public.log_super_admin_security_event(
            v_user.id, v_user.username, 'PIN_SUCCESS', 'LOW', p_ip, p_user_agent,
            jsonb_build_object('message', 'Bcrypt Master PIN verified successfully')
        );

        RETURN jsonb_build_object('success', true, 'message', 'تم التحقق من رمز الحماية الماستر بنجاح');
    ELSE
        -- PIN Failed: Increment failed_pin_attempts
        DECLARE
            v_new_failed integer := COALESCE(v_user.failed_pin_attempts, 0) + 1;
            v_should_lock boolean := (v_new_failed >= v_max_attempts);
            v_lock_until timestamp with time zone := NULL;
        BEGIN
            IF v_should_lock THEN
                v_lock_until := timezone('utc'::text, now()) + v_lockout_duration;
            END IF;

            UPDATE public.system_users
            SET failed_pin_attempts = v_new_failed,
                locked_until = v_lock_until
            WHERE id = v_user.id;

            IF v_should_lock THEN
                PERFORM public.log_super_admin_security_event(
                    v_user.id, v_user.username, 'ACCOUNT_LOCKED', 'CRITICAL', p_ip, p_user_agent,
                    jsonb_build_object('reason', '3 consecutive failed PIN attempts', 'locked_until', v_lock_until)
                );
                RETURN jsonb_build_object(
                    'success', false,
                    'locked', true,
                    'locked_until', v_lock_until,
                    'message', 'تم قفل الحساب تلقائياً لمدة 15 دقيقة لحماية المنصة بسبب أدخال رمز PIN خاطئ 3 مرات.'
                );
            ELSE
                PERFORM public.log_super_admin_security_event(
                    v_user.id, v_user.username, 'PIN_FAILED', 'MEDIUM', p_ip, p_user_agent,
                    jsonb_build_object('attempts_left', v_max_attempts - v_new_failed)
                );
                RETURN jsonb_build_object(
                    'success', false,
                    'locked', false,
                    'attempts_left', v_max_attempts - v_new_failed,
                    'message', 'رمز الحماية الماستر غير صحيح. المتبقي: ' || (v_max_attempts - v_new_failed) || ' محاولات.'
                );
            END IF;
        END;
    END IF;
END;
$$;

-- 5. RPC Function to Create New Super Admin Account with Bcrypt PIN Hashing
CREATE OR REPLACE FUNCTION public.create_super_admin_account(
    p_username text,
    p_full_name text,
    p_email text,
    p_password text,
    p_security_pin text,
    p_creator_username text DEFAULT 'super_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_username text;
    v_clean_email text;
    v_user_id uuid;
    v_pin_hash text;
    v_password_hash text;
BEGIN
    v_clean_username := LOWER(TRIM(p_username));
    v_clean_email := LOWER(TRIM(COALESCE(NULLIF(TRIM(p_email), ''), p_username || '@staff.devo.internal')));

    IF v_clean_username IS NULL OR v_clean_username = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'يرجى كتابة اسم المستخدم');
    END IF;

    IF EXISTS (SELECT 1 FROM public.system_users WHERE username = v_clean_username) THEN
        RETURN jsonb_build_object('success', false, 'message', 'اسم المستخدم هذا مستخدم بالفعل بالنظام');
    END IF;

    v_pin_hash := crypt(COALESCE(NULLIF(TRIM(p_security_pin), ''), '123456'), gen_salt('bf', 10));
    v_password_hash := crypt(COALESCE(NULLIF(TRIM(p_password), ''), '123456'), gen_salt('bf', 10));

    -- 1. Create in auth.users FIRST to satisfy foreign key constraint system_users_id_fkey
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_clean_email) THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, is_super_admin,
            created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            v_clean_email, v_password_hash, now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', p_full_name, 'role', 'super_admin'),
            true, now(), now()
        ) RETURNING id INTO v_user_id;
    ELSE
        SELECT id INTO v_user_id FROM auth.users WHERE email = v_clean_email;
    END IF;

    -- 2. Create in system_users using the SAME generated id
    INSERT INTO public.system_users (
        id,
        username,
        full_name,
        email,
        role,
        is_active,
        security_pin_hash,
        security_pin_enabled,
        failed_pin_attempts
    ) VALUES (
        v_user_id,
        v_clean_username,
        p_full_name,
        v_clean_email,
        'super_admin',
        true,
        v_pin_hash,
        true,
        0
    );

    -- Log Creation
    PERFORM public.log_super_admin_security_event(
        v_user_id, v_clean_username, 'SUPER_ADMIN_CREATED', 'HIGH', 'system', 'system',
        jsonb_build_object('creator', p_creator_username, 'full_name', p_full_name, 'email', v_clean_email)
    );

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'message', 'تم إنشاء حساب السوبر أدمن بنجاح وحفظ رمز PIN مشفراً');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 6. RPC Function to Update Super Admin Security PIN with Bcrypt Hashing
CREATE OR REPLACE FUNCTION public.update_super_admin_security_pin(
    p_target_user_id uuid,
    p_new_pin text,
    p_updater_username text DEFAULT 'super_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user public.system_users%ROWTYPE;
    v_pin_hash text;
BEGIN
    SELECT * INTO v_user FROM public.system_users WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المستخدم غير موجود');
    END IF;

    v_pin_hash := crypt(TRIM(p_new_pin), gen_salt('bf', 10));

    UPDATE public.system_users
    SET security_pin_hash = v_pin_hash,
        failed_pin_attempts = 0,
        locked_until = NULL
    WHERE id = p_target_user_id;

    PERFORM public.log_super_admin_security_event(
        v_user.id, v_user.username, 'PIN_RESET', 'HIGH', 'system', 'system',
        jsonb_build_object('updated_by', p_updater_username)
    );

    RETURN jsonb_build_object('success', true, 'message', 'تم تحديث وتشفير رمز الحماية الماستر بنجاح');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 7. Ensure Default Super Admin Account Exists
DO $$
DECLARE
    v_admin_id uuid;
    v_pin_hash text;
    v_password_hash text;
    v_email text := 'admin@ultrasoft.com';
    v_username text := 'super_admin';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.system_users WHERE role = 'super_admin') THEN
        v_pin_hash := crypt('123456', gen_salt('bf', 10));
        v_password_hash := crypt('123456', gen_salt('bf', 10));

        -- 1. Create in auth.users FIRST to satisfy foreign key constraint
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, recovery_sent_at, last_sign_in_at,
                raw_app_meta_data, raw_user_meta_data, is_super_admin,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                v_email, v_password_hash, now(), now(), now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('full_name', 'Super Admin UltraSoft', 'role', 'super_admin'),
                true, now(), now()
            ) RETURNING id INTO v_admin_id;
        ELSE
            SELECT id INTO v_admin_id FROM auth.users WHERE email = v_email;
        END IF;

        -- 2. Create in public.system_users SECOND using the SAME id
        INSERT INTO public.system_users (
            id,
            username,
            full_name,
            email,
            role,
            is_active,
            security_pin_hash,
            security_pin_enabled,
            failed_pin_attempts
        ) VALUES (
            v_admin_id,
            v_username,
            'Super Admin UltraSoft',
            v_email,
            'super_admin',
            true,
            v_pin_hash,
            true,
            0
        );
    END IF;
END $$;


