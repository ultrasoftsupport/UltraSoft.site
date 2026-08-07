-- ====================================================================
-- Migration: v65_super_admin_totp_2fa.sql
-- Description: Google Authenticator (TOTP 2FA) 3rd Security Layer for Super Admin
-- ====================================================================

-- 1. Ensure pgcrypto extension is active in public or extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 2. Add TOTP 2FA columns to system_users
ALTER TABLE public.system_users 
ADD COLUMN IF NOT EXISTS totp_secret text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS totp_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS totp_verified_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS totp_recovery_codes text[] DEFAULT ARRAY[]::text[];

-- Index for TOTP lookup
CREATE INDEX IF NOT EXISTS idx_system_users_totp_enabled ON public.system_users(totp_enabled);

-- 3. Function to Calculate Standard RFC 6238 TOTP Code in PL/pgSQL
CREATE OR REPLACE FUNCTION public.calculate_totp_code(
    p_base32_secret text,
    p_time_offset_steps integer DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_secret text;
    v_decoded_bytes bytea := ''::bytea;
    v_time_step bigint;
    v_time_bytes bytea;
    v_hmac bytea;
    v_offset integer;
    v_binary bigint;
    v_otp integer;
    v_result text;
    v_base32_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_char char;
    v_val integer;
    v_buffer integer := 0;
    v_bits integer := 0;
    i integer;
BEGIN
    v_clean_secret := UPPER(REGEXP_REPLACE(p_base32_secret, '\s|=', '', 'g'));
    IF v_clean_secret IS NULL OR LENGTH(v_clean_secret) = 0 THEN
        RETURN NULL;
    END IF;

    -- Decode Base32 RFC 4648 to bytea with proper masking
    FOR i IN 1..LENGTH(v_clean_secret) LOOP
        v_char := SUBSTRING(v_clean_secret FROM i FOR 1);
        v_val := POSITION(v_char IN v_base32_chars) - 1;
        IF v_val < 0 THEN
            CONTINUE;
        END IF;

        v_buffer := (v_buffer << 5) | v_val;
        v_bits := v_bits + 5;

        IF v_bits >= 8 THEN
            v_bits := v_bits - 8;
            v_decoded_bytes := v_decoded_bytes || SET_BYTE('\x00'::bytea, 0, (v_buffer >> v_bits) & 255);
            v_buffer := v_buffer & ((1 << v_bits) - 1);
        END IF;
    END LOOP;

    -- Compute 30-second time step integer
    v_time_step := (EXTRACT(EPOCH FROM NOW())::bigint / 30) + p_time_offset_steps;

    -- Convert 64-bit time step to 8-byte big-endian bytea
    v_time_bytes := E'\\x00000000'::bytea || 
                    SET_BYTE(SET_BYTE(SET_BYTE(SET_BYTE('\x00000000'::bytea, 
                    0, ((v_time_step >> 24) & 255)::integer), 
                    1, ((v_time_step >> 16) & 255)::integer), 
                    2, ((v_time_step >> 8) & 255)::integer), 
                    3, ((v_time_step) & 255)::integer);

    -- HMAC-SHA1 with explicit text cast and fallback schema search
    BEGIN
        v_hmac := hmac(v_time_bytes, v_decoded_bytes, 'sha1'::text);
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            v_hmac := public.hmac(v_time_bytes, v_decoded_bytes, 'sha1'::text);
        EXCEPTION WHEN OTHERS THEN
            v_hmac := extensions.hmac(v_time_bytes, v_decoded_bytes, 'sha1'::text);
        END;
    END;

    -- Dynamic Truncation
    v_offset := GET_BYTE(v_hmac, LENGTH(v_hmac) - 1) & 15;
    v_binary := ((GET_BYTE(v_hmac, v_offset) & 127) << 24) |
                ((GET_BYTE(v_hmac, v_offset + 1) & 255) << 16) |
                ((GET_BYTE(v_hmac, v_offset + 2) & 255) << 8) |
                (GET_BYTE(v_hmac, v_offset + 3) & 255);

    v_otp := v_binary % 1000000;
    v_result := LPAD(v_otp::text, 6, '0');

    RETURN v_result;
END;
$$;

-- 4. Function to Generate Random Base32 Secret Key (16 chars)
CREATE OR REPLACE FUNCTION public.generate_super_admin_totp_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_secret text := '';
    i integer;
    v_rand integer;
BEGIN
    FOR i IN 1..16 LOOP
        v_rand := FLOOR(RANDOM() * 32)::integer + 1;
        v_secret := v_secret || SUBSTRING(v_chars FROM v_rand FOR 1);
    END LOOP;
    RETURN v_secret;
END;
$$;

-- 5. RPC Function to Verify TOTP 2FA Code or Recovery Code
CREATE OR REPLACE FUNCTION public.verify_super_admin_totp(
    p_user_id uuid,
    p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user public.system_users%ROWTYPE;
    v_clean_code text;
    v_c_m2 text;
    v_c_m1 text;
    v_c_0 text;
    v_c_p1 text;
    v_c_p2 text;
    v_recovery_code text;
    v_new_recovery_codes text[];
    v_is_recovery boolean := false;
BEGIN
    v_clean_code := TRIM(p_code);
    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال رمز الـ 2FA أو رمز الاسترداد');
    END IF;

    SELECT * INTO v_user FROM public.system_users WHERE id = p_user_id AND role = 'super_admin';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'حساب السوبر أدمن غير موجود');
    END IF;

    IF NOT v_user.totp_enabled OR v_user.totp_secret IS NULL THEN
        RETURN jsonb_build_object('success', true, 'required', false, 'message', 'المصادقة الثنائية غير مفعّلة لهذا الحساب');
    END IF;

    -- Check if it matches a Backup Recovery Code
    IF v_user.totp_recovery_codes IS NOT NULL AND ARRAY_LENGTH(v_user.totp_recovery_codes, 1) > 0 THEN
        FOREACH v_recovery_code IN ARRAY v_user.totp_recovery_codes LOOP
            IF UPPER(v_recovery_code) = UPPER(v_clean_code) THEN
                v_is_recovery := true;
                -- Remove used recovery code
                SELECT ARRAY_AGG(c) INTO v_new_recovery_codes
                FROM UNNEST(v_user.totp_recovery_codes) c
                WHERE UPPER(c) <> UPPER(v_clean_code);

                UPDATE public.system_users
                SET totp_recovery_codes = COALESCE(v_new_recovery_codes, ARRAY[]::text[])
                WHERE id = p_user_id;

                PERFORM public.log_super_admin_security_event(
                    v_user.id, v_user.username, '2FA_RECOVERY_USED', 'HIGH', 'system', 'system',
                    jsonb_build_object('remaining_codes', COALESCE(ARRAY_LENGTH(v_new_recovery_codes, 1), 0))
                );

                RETURN jsonb_build_object('success', true, 'recovery_used', true, 'message', 'تمت المصادقة باستخدام رمز الاسترداد بنجاح');
            END IF;
        END LOOP;
    END IF;

    -- Calculate expected TOTP codes for time steps -2, -1, 0, +1, +2
    v_c_m2 := public.calculate_totp_code(v_user.totp_secret, -2);
    v_c_m1 := public.calculate_totp_code(v_user.totp_secret, -1);
    v_c_0  := public.calculate_totp_code(v_user.totp_secret, 0);
    v_c_p1 := public.calculate_totp_code(v_user.totp_secret, 1);
    v_c_p2 := public.calculate_totp_code(v_user.totp_secret, 2);

    IF v_clean_code = v_c_0 OR v_clean_code = v_c_m1 OR v_clean_code = v_c_p1 OR v_clean_code = v_c_m2 OR v_clean_code = v_c_p2 THEN
        PERFORM public.log_super_admin_security_event(
            v_user.id, v_user.username, '2FA_TOTP_SUCCESS', 'LOW', 'system', 'system',
            jsonb_build_object('method', 'Google Authenticator TOTP')
        );

        RETURN jsonb_build_object('success', true, 'message', 'تم التحقق من رمز المصادقة الثنائية بنجاح 🔒');
    ELSE
        PERFORM public.log_super_admin_security_event(
            v_user.id, v_user.username, '2FA_TOTP_FAILED', 'MEDIUM', 'system', 'system',
            jsonb_build_object('entered_code', v_clean_code)
        );

        RETURN jsonb_build_object('success', false, 'message', 'رمز الـ 2FA غير صحيح، يرجى التأكد من التطبيق');
    END IF;
END;
$$;

-- 6. RPC Function to Enable TOTP 2FA & Generate 8 Recovery Codes
CREATE OR REPLACE FUNCTION public.enable_super_admin_totp(
    p_user_id uuid,
    p_secret text,
    p_verification_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user public.system_users%ROWTYPE;
    v_c_m2 text;
    v_c_m1 text;
    v_c_0 text;
    v_c_p1 text;
    v_c_p2 text;
    v_clean_secret text;
    v_clean_code text;
    v_recovery_codes text[] := ARRAY[]::text[];
    i integer;
    v_code text;
    v_chars text := '0123456789ABCDEF';
    j integer;
BEGIN
    v_clean_secret := UPPER(TRIM(p_secret));
    v_clean_code := TRIM(p_verification_code);
    
    SELECT * INTO v_user FROM public.system_users WHERE id = p_user_id AND role = 'super_admin';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المستخدم غير موجود');
    END IF;

    -- Calculate expected codes using proposed secret (-2, -1, 0, +1, +2)
    v_c_m2 := public.calculate_totp_code(v_clean_secret, -2);
    v_c_m1 := public.calculate_totp_code(v_clean_secret, -1);
    v_c_0  := public.calculate_totp_code(v_clean_secret, 0);
    v_c_p1 := public.calculate_totp_code(v_clean_secret, 1);
    v_c_p2 := public.calculate_totp_code(v_clean_secret, 2);

    IF v_clean_code <> v_c_0 AND v_clean_code <> v_c_m1 AND v_clean_code <> v_c_p1 AND v_clean_code <> v_c_m2 AND v_clean_code <> v_c_p2 THEN
        RETURN jsonb_build_object('success', false, 'message', 'رمز الاختيار المكتوب من التطبيق غير صحيح');
    END IF;

    -- Generate 8 Recovery Codes (e.g., 4048-A9F2)
    FOR i IN 1..8 LOOP
        v_code := '';
        FOR j IN 1..4 LOOP
            v_code := v_code || SUBSTRING(v_chars FROM FLOOR(RANDOM() * 16)::integer + 1 FOR 1);
        END LOOP;
        v_code := v_code || '-';
        FOR j IN 1..4 LOOP
            v_code := v_code || SUBSTRING(v_chars FROM FLOOR(RANDOM() * 16)::integer + 1 FOR 1);
        END LOOP;
        v_recovery_codes := ARRAY_APPEND(v_recovery_codes, v_code);
    END LOOP;

    -- Save to system_users
    UPDATE public.system_users
    SET totp_secret = v_clean_secret,
        totp_enabled = true,
        totp_verified_at = NOW(),
        totp_recovery_codes = v_recovery_codes
    WHERE id = p_user_id;

    PERFORM public.log_super_admin_security_event(
        v_user.id, v_user.username, '2FA_TOTP_ENABLED', 'HIGH', 'system', 'system',
        jsonb_build_object('recovery_codes_count', 8)
    );

    RETURN jsonb_build_object(
        'success', true, 
        'recovery_codes', v_recovery_codes,
        'message', 'تم تفعيل المصادقة الثنائية (Google Authenticator 2FA) بنجاح 🔒'
    );
END;
$$;

-- 7. RPC Function to Disable TOTP 2FA
CREATE OR REPLACE FUNCTION public.disable_super_admin_totp(
    p_user_id uuid,
    p_updater_username text DEFAULT 'super_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user public.system_users%ROWTYPE;
BEGIN
    SELECT * INTO v_user FROM public.system_users WHERE id = p_user_id AND role = 'super_admin';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المستخدم غير موجود');
    END IF;

    UPDATE public.system_users
    SET totp_secret = NULL,
        totp_enabled = false,
        totp_verified_at = NULL,
        totp_recovery_codes = ARRAY[]::text[]
    WHERE id = p_user_id;

    PERFORM public.log_super_admin_security_event(
        v_user.id, v_user.username, '2FA_TOTP_DISABLED', 'HIGH', 'system', 'system',
        jsonb_build_object('disabled_by', p_updater_username)
    );

    RETURN jsonb_build_object('success', true, 'message', 'تم إيقاف تفعيل المصادقة الثنائية بنجاح');
END;
$$;
