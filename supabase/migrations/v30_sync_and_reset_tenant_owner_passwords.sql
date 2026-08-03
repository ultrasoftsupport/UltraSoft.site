-- =========================================================================
-- 🚀 MIGRATION V30: SYNC & RESET TENANT OWNER ACCOUNTS IN AUTH.USERS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-03
-- 💡 Description: Fixes 400 Bad Request / Invalid login credentials by ensuring
--    tenant owner/admin credentials exist in auth.users and auth.identities
--    with valid bcrypt password hashes and matching system_users records.
-- =========================================================================

-- 0. Ensure email column exists on system_users table
ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS email text;

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
    r_col record;
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
        -- Fallback: check any user for this tenant
        SELECT id INTO v_owner_user_id
        FROM public.system_users
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Compute bcrypt hash
    v_hashed_password := crypt(v_master_password, gen_salt('bf'));

    -- If no user exists in system_users, create one
    IF v_owner_user_id IS NULL THEN
        v_owner_user_id := gen_random_uuid();
        
        -- Check if v_owner_user_id or v_master_email exists in auth.users
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_user_id OR email = v_master_email) THEN
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
        );
    ELSE
        -- Owner user ID exists in system_users
        -- Check if it exists in auth.users
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner_user_id) THEN
            -- Check if another auth user has this email
            IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_master_email) THEN
                UPDATE auth.users SET
                    id = v_owner_user_id,
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

            IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_owner_user_id) THEN
                INSERT INTO auth.identities (
                    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
                ) VALUES (
                    v_owner_user_id, v_owner_user_id::text, v_owner_user_id,
                    jsonb_build_object('sub', v_owner_user_id::text, 'email', v_master_email),
                    'email', NULL, now(), now()
                )
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            -- User exists in auth.users -> update encrypted_password & email
            UPDATE auth.users SET
                encrypted_password = v_hashed_password,
                email = v_master_email,
                email_confirmed_at = COALESCE(email_confirmed_at, now()),
                updated_at = now()
            WHERE id = v_owner_user_id;

            UPDATE auth.identities SET
                identity_data = jsonb_build_object('sub', v_owner_user_id::text, 'email', v_master_email),
                updated_at = now()
            WHERE user_id = v_owner_user_id;
        END IF;
    END IF;

    -- 4. Fix GoTrue null string columns for this user
    FOR r_col IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'auth' 
          AND table_name = 'users' 
          AND data_type IN ('character varying', 'text', 'character')
          AND is_nullable = 'YES'
          AND column_name NOT IN ('email', 'encrypted_password', 'phone', 'role', 'aud')
    LOOP
        EXECUTE format('UPDATE auth.users SET %I = '''' WHERE id = $1 AND (%I IS NULL)', r_col.column_name, r_col.column_name) USING v_owner_user_id;
    END LOOP;

    -- 5. Ensure system_users attributes
    UPDATE public.system_users SET
        tenant_id = p_tenant_id,
        email = v_master_email,
        is_active = true,
        role = COALESCE(role, 'owner')
    WHERE id = v_owner_user_id;

    -- 6. Update tenant settings
    v_tenant_settings := jsonb_set(v_tenant_settings, '{master_password}', to_jsonb(v_master_password));
    v_tenant_settings := jsonb_set(v_tenant_settings, '{master_email}', to_jsonb(v_master_email));

    UPDATE public.tenants
    SET settings = v_tenant_settings
    WHERE id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.super_admin_reset_owner_password(uuid, text) TO authenticated, anon;

-- -------------------------------------------------------------------------
-- 7. AUTOMATICALLY BACKFILL & SYNC ALL EXISTING TENANTS IN THE DATABASE
-- -------------------------------------------------------------------------
DO $$
DECLARE
    r_tenant record;
    v_pwd text;
BEGIN
    FOR r_tenant IN SELECT id, slug, settings FROM public.tenants LOOP
        v_pwd := COALESCE(
            r_tenant.settings ->> 'master_password',
            'Ultra@' || upper(substring(r_tenant.slug from 1 for 1)) || substring(r_tenant.slug from 2) || '2026'
        );
        PERFORM public.super_admin_reset_owner_password(r_tenant.id, v_pwd);
    END LOOP;
END $$;
