-- =========================================================================
-- Migration: v75_fix_system_bot_and_home_settings_rls.sql
-- Description: 
-- 1. Fix home_settings RLS policies to allow factory admin users to save Telegram settings.
-- 2. Update save_super_admin_system_bot RPC signature with defaults for all optional parameters.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Fix home_settings RLS Policies
-- -------------------------------------------------------------------------
ALTER TABLE public.home_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "home_settings_tenant_isolation_policy" ON public.home_settings;
DROP POLICY IF EXISTS "Allow select home_settings by tenant" ON public.home_settings;
DROP POLICY IF EXISTS "Allow write home_settings by tenant" ON public.home_settings;
DROP POLICY IF EXISTS "Allow select home_settings" ON public.home_settings;
DROP POLICY IF EXISTS "Allow write home_settings" ON public.home_settings;

CREATE POLICY "Allow select home_settings" ON public.home_settings 
    FOR SELECT USING (true);

CREATE POLICY "Allow write home_settings" ON public.home_settings 
    FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 2. Update save_super_admin_system_bot RPC
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_super_admin_system_bot(text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.save_super_admin_system_bot(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.save_super_admin_system_bot;

CREATE OR REPLACE FUNCTION public.save_super_admin_system_bot(
    p_bot_key text,
    p_bot_name text DEFAULT NULL,
    p_bot_token text DEFAULT NULL,
    p_chat_id text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_name text;
    v_existing_token text;
    v_existing_chat text;
    v_final_token text;
    v_final_chat text;
BEGIN
    IF p_bot_key IS NULL OR trim(p_bot_key) = '' THEN
        RETURN json_build_object('success', false, 'message', 'رمز البوت (bot_key) مطلوب.');
    END IF;

    v_target_name := COALESCE(p_bot_name, p_bot_key);

    SELECT bot_token, chat_id INTO v_existing_token, v_existing_chat
    FROM public.super_admin_telegram_bots
    WHERE bot_key = p_bot_key;

    IF p_bot_token IS NOT NULL AND trim(p_bot_token) <> '' THEN
        v_final_token := trim(p_bot_token);
    ELSE
        v_final_token := v_existing_token;
    END IF;

    IF p_chat_id IS NOT NULL AND trim(p_chat_id) <> '' THEN
        v_final_chat := trim(p_chat_id);
    ELSE
        v_final_chat := v_existing_chat;
    END IF;

    INSERT INTO public.super_admin_telegram_bots (
        bot_key,
        bot_name,
        bot_token,
        chat_id,
        description,
        is_configured,
        updated_at
    )
    VALUES (
        p_bot_key,
        v_target_name,
        v_final_token,
        v_final_chat,
        p_description,
        (v_final_token IS NOT NULL AND trim(v_final_token) <> '' AND v_final_chat IS NOT NULL AND trim(v_final_chat) <> ''),
        now()
    )
    ON CONFLICT (bot_key) DO UPDATE
    SET
        bot_name = EXCLUDED.bot_name,
        bot_token = COALESCE(EXCLUDED.bot_token, super_admin_telegram_bots.bot_token),
        chat_id = COALESCE(EXCLUDED.chat_id, super_admin_telegram_bots.chat_id),
        description = COALESCE(EXCLUDED.description, super_admin_telegram_bots.description),
        is_configured = (
            COALESCE(EXCLUDED.bot_token, super_admin_telegram_bots.bot_token) IS NOT NULL 
            AND trim(COALESCE(EXCLUDED.bot_token, super_admin_telegram_bots.bot_token)) <> '' 
            AND COALESCE(EXCLUDED.chat_id, super_admin_telegram_bots.chat_id) IS NOT NULL 
            AND trim(COALESCE(EXCLUDED.chat_id, super_admin_telegram_bots.chat_id)) <> ''
        ),
        updated_at = now();

    INSERT INTO public.super_admin_security_logs (
        action_type,
        target_resource,
        performed_by_id,
        details
    ) VALUES (
        'BOT_CONFIG_UPDATE',
        'super_admin_telegram_bots:' || p_bot_key,
        p_user_id,
        jsonb_build_object(
            'bot_key', p_bot_key,
            'token_updated', (p_bot_token IS NOT NULL AND trim(p_bot_token) <> ''),
            'chat_updated', (p_chat_id IS NOT NULL AND trim(p_chat_id) <> '')
        )
    );

    RETURN json_build_object(
        'success', true, 
        'message', 'تم حفظ وتحديث إعدادات بوت التليجرام بنجاح 🔒'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'خطأ أثناء الحفظ: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_super_admin_system_bot(text, text, text, text, text, uuid) TO anon, authenticated, service_role;
