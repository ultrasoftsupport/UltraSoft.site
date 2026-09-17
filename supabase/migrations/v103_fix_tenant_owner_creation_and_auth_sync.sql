-- =========================================================================
-- 🚀 MIGRATION V103: FIX TENANT OWNER CREATION & AUTH.USERS SYNC
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-17
-- 💡 Description: Fixes system_users_id_fkey violation when recreating a tenant
--    whose email already existed in auth.users, and ensures seamless owner sync.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_reset_owner_password(
    p_tenant_id uuid,
    p_new_password text
)
RETURNS boolean AS $$
DECLARE
    v_owner_user_id uuid;
    v_tenant_settings jsonb;
    v_tenant_slug text;
    v_tenant_email text;
    v_master_email text;
    v_master_password text;
    v_hashed_password text;
    v_existing_auth_id uuid;
BEGIN
    -- 1. Check password validity
    v_master_password := trim(p_new_password);
    IF v_master_password IS NULL OR v_master_password = '' THEN
        RAISE EXCEPTION 'يرجى إدخال كلمة مرور جديدة صحيحة.';
    END IF;

    -- 2. Get tenant details
    SELECT slug, email, settings INTO v_tenant_slug, v_tenant_email, v_tenant_settings
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_tenant_slug IS NULL THEN
        RAISE EXCEPTION 'المصنع غير موجود.';
    END IF;

    IF v_tenant_settings IS NULL THEN
        v_tenant_settings := '{}'::jsonb;
    END IF;

    -- Determine master email: settings.master_email OR tenant.email OR admin@slug.com
    v_master_email := lower(trim(COALESCE(
        v_tenant_settings ->> 'master_email',
        NULLIF(v_tenant_email, ''),
        'admin@' || v_tenant_slug || '.com'
    )));

    -- 3. Find factory owner/admin in public.system_users
    SELECT id INTO v_owner_user_id
    FROM public.system_users
    WHERE tenant_id = p_tenant_id AND role IN ('owner', 'admin', 'tenant_admin')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_owner_user_id IS NULL THEN
        SELECT id INTO v_owner_user_id
        FROM public.system_users
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Compute bcrypt hash
    v_hashed_password := crypt(v_master_password, gen_salt('bf'));

    -- 4. If no user exists in system_users, check auth.users first
    IF v_owner_user_id IS NULL THEN
        SELECT id INTO v_existing_auth_id FROM auth.users WHERE email = v_master_email LIMIT 1;

        IF v_existing_auth_id IS NOT NULL THEN
            v_owner_user_id := v_existing_auth_id;
            -- Update password for existing auth.users record
            UPDATE auth.users SET 
                encrypted_password = v_hashed_password,
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                updated_at = now()
            WHERE id = v_owner_user_id;
        ELSE
            v_owner_user_id := gen_random_uuid();
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', v_owner_user_id, 'authenticated', 'authenticated', v_master_email,
                v_hashed_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
                now(), now()
            );

            INSERT INTO auth.identities (
                id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_owner_user_id, v_owner_user_id::text, v_owner_user_id,
                jsonb_build_object('sub', v_owner_user_id::text, 'email', v_master_email),
                'email', NULL, now(), now()
            );
        END IF;

        INSERT INTO public.system_users (
            id, tenant_id, full_name, username, role, is_active, email, created_at
        ) VALUES (
            v_owner_user_id, p_tenant_id, 'أونر المصنع', 'admin_' || v_tenant_slug, 'owner', true, v_master_email, now()
        )
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = p_tenant_id,
            role = 'owner',
            is_active = true,
            email = v_master_email;
    ELSE
        -- Owner user ID exists in system_users
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_user_id) THEN
            IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_master_email) THEN
                UPDATE auth.users SET
                    encrypted_password = v_hashed_password,
                    email_confirmed_at = COALESCE(email_confirmed_at, now()),
                    updated_at = now()
                WHERE email = v_master_email;
            ELSE
                INSERT INTO auth.users (
                    instance_id, id, aud, role, email, encrypted_password,
                    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                    created_at, updated_at
                ) VALUES (
                    '00000000-0000-0000-0000-000000000000', v_owner_user_id, 'authenticated', 'authenticated', v_master_email,
                    v_hashed_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
                    now(), now()
                );
            END IF;
        ELSE
            UPDATE auth.users SET
                encrypted_password = v_hashed_password,
                updated_at = now()
            WHERE id = v_owner_user_id;
        END IF;
    END IF;

    -- Update settings in tenants table
    v_tenant_settings := jsonb_set(v_tenant_settings, '{master_password}', to_jsonb(v_master_password));
    v_tenant_settings := jsonb_set(v_tenant_settings, '{master_email}', to_jsonb(v_master_email));
    
    UPDATE public.tenants SET
        settings = v_tenant_settings,
        updated_at = now()
    WHERE id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.super_admin_reset_owner_password(uuid, text) TO authenticated, anon;
