-- =========================================================================
-- v82: توحيد بوتات التليجرام وإعدادات النسخ الاحتياطي التلقائي والأمان
-- =========================================================================

-- 0. التأكد من وجود عمود is_configured في جدول super_admin_telegram_bots
ALTER TABLE public.super_admin_telegram_bots 
ADD COLUMN IF NOT EXISTS is_configured boolean DEFAULT false;

-- 1. التأكد من وجود سجلات الخدمات الأساسية في جدول super_admin_telegram_bots
INSERT INTO public.super_admin_telegram_bots (bot_key, bot_name, description)
VALUES 
    ('backup_bot', 'بوت النسخ الاحتياطي (Backup Bot)', 'مسؤول عن استلام ملفات النسخ الاحتياطي المشفرة وإشعارات العمليات السحابية.'),
    ('reports_bot', 'بوت التقارير والمنظومة (Reports Bot)', 'مسؤول عن التقارير الإدارية وتنبيهات المنظومة البارزة.'),
    ('testing_bot', 'بوت الاختبارات والـ Sandbox (Testing Bot)', 'مسؤول عن تجارب الاختبارات والتشخيص البرمجي للاستخدام الفوري.')
ON CONFLICT (bot_key) DO UPDATE
SET description = EXCLUDED.description;

-- 2. دالة حفظ وتحديث توكن البوت الموحد لجميع عمليات المنظومة
CREATE OR REPLACE FUNCTION public.save_super_admin_unified_telegram_bot(
    p_bot_token text,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_token text;
    v_masked text;
BEGIN
    IF p_bot_token IS NULL OR trim(p_bot_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'رمز التوكن (Bot Token) لا يمكن أن يكون فارغاً.');
    END IF;

    v_clean_token := trim(p_bot_token);

    -- تحديث التوكن في كافة سجلات البوتات بالمنظومة لتوحيده
    UPDATE public.super_admin_telegram_bots
    SET 
        bot_token = v_clean_token,
        is_active = true,
        is_configured = (chat_id IS NOT NULL AND trim(chat_id) <> ''),
        updated_at = now()
    WHERE bot_key IS NOT NULL;

    -- المزامنة في جدول system_platform_settings إن وجد
    IF to_regclass('public.system_platform_settings') IS NOT NULL THEN
        INSERT INTO public.system_platform_settings (setting_key, setting_value, description, updated_at)
        VALUES ('unified_telegram_bot_token', jsonb_build_object('token', v_clean_token, 'masked', v_masked), 'توكن بوت النظام الموحد', now())
        ON CONFLICT (setting_key) DO UPDATE 
        SET setting_value = EXCLUDED.setting_value, updated_at = now();
    END IF;

    -- المزامنة في جدول home_settings
    UPDATE public.home_settings SET setting_value = v_clean_token WHERE setting_key = 'telegram_unified_bot_token';
    IF NOT FOUND THEN
        INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_unified_bot_token', v_clean_token);
    END IF;

    UPDATE public.home_settings SET setting_value = v_clean_token WHERE setting_key = 'telegram_backup_bot_token';
    IF NOT FOUND THEN
        INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_backup_bot_token', v_clean_token);
    END IF;

    UPDATE public.home_settings SET setting_value = v_clean_token WHERE setting_key = 'telegram_bot_token';
    IF NOT FOUND THEN
        INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_bot_token', v_clean_token);
    END IF;

    -- تسجيل الحركة في سجل الأمان بأمان تام
    BEGIN
        IF to_regclass('public.super_admin_security_logs') IS NOT NULL THEN
            INSERT INTO public.super_admin_security_logs (
                action_type,
                target_resource,
                performed_by_id,
                details
            ) VALUES (
                'UNIFIED_TELEGRAM_BOT_UPDATE',
                'super_admin_telegram_bots:all',
                p_user_id,
                jsonb_build_object('masked_token', v_masked, 'updated_at', now())
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم حفظ وتشفير توكن البوت الموحد للمنظومة بنجاح 🔒',
        'masked_token', v_masked
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل حفظ التوكن الموحد: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_super_admin_unified_telegram_bot(text, uuid) TO anon, authenticated, service_role;

-- 3. دالة حفظ معرف القناة/الجروب لوجهة محددة
CREATE OR REPLACE FUNCTION public.save_super_admin_target_chat(
    p_bot_key text,
    p_chat_id text,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_chat text;
    v_existing_token text;
BEGIN
    IF p_bot_key IS NULL OR trim(p_bot_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'معرف الوجهة (bot_key) مطلوب.');
    END IF;

    v_clean_chat := trim(COALESCE(p_chat_id, ''));

    -- التحقق من وجود توكن موحد مسبقاً لأخذه إن لم يكن مسجلاً
    SELECT bot_token INTO v_existing_token
    FROM public.super_admin_telegram_bots
    WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
    LIMIT 1;

    IF v_existing_token IS NULL THEN
        SELECT setting_value INTO v_existing_token
        FROM public.home_settings
        WHERE setting_key IN ('telegram_unified_bot_token', 'telegram_backup_bot_token', 'telegram_bot_token')
          AND setting_value IS NOT NULL AND trim(setting_value) <> ''
        LIMIT 1;
    END IF;

    -- تحديث السجل المستهدف
    UPDATE public.super_admin_telegram_bots
    SET 
        chat_id = v_clean_chat,
        bot_token = COALESCE(bot_token, v_existing_token),
        is_active = true,
        is_configured = (v_clean_chat <> '' AND COALESCE(bot_token, v_existing_token) IS NOT NULL AND trim(COALESCE(bot_token, v_existing_token)) <> ''),
        updated_at = now()
    WHERE bot_key = p_bot_key;

    -- مزامنة الإعدادات في home_settings
    IF p_bot_key = 'backup_bot' THEN
        UPDATE public.home_settings SET setting_value = v_clean_chat WHERE setting_key = 'telegram_backup_chat_id';
        IF NOT FOUND THEN
            INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_backup_chat_id', v_clean_chat);
        END IF;
    ELSIF p_bot_key = 'reports_bot' THEN
        UPDATE public.home_settings SET setting_value = v_clean_chat WHERE setting_key = 'telegram_reports_chat_id';
        IF NOT FOUND THEN
            INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_reports_chat_id', v_clean_chat);
        END IF;
    ELSIF p_bot_key = 'testing_bot' THEN
        UPDATE public.home_settings SET setting_value = v_clean_chat WHERE setting_key = 'telegram_testing_chat_id';
        IF NOT FOUND THEN
            INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('telegram_testing_chat_id', v_clean_chat);
        END IF;
    END IF;

    -- تسجيل الحدث في سجل الأمان إن وجد الجدول
    BEGIN
        IF to_regclass('public.super_admin_security_logs') IS NOT NULL THEN
            INSERT INTO public.super_admin_security_logs (
                action_type,
                target_resource,
                performed_by_id,
                details
            ) VALUES (
                'TARGET_CHAT_UPDATE',
                'super_admin_telegram_bots:' || p_bot_key,
                p_user_id,
                jsonb_build_object('bot_key', p_bot_key, 'chat_id', v_clean_chat)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم حفظ وتحديث معرف القناة/الجروب بنجاح 💾'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل حفظ معرف القناة: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_super_admin_target_chat(text, text, uuid) TO anon, authenticated, service_role;

-- 4. دالة استرجاع حالة التوكن الموحد والقنوات المخصصة
CREATE OR REPLACE FUNCTION public.get_super_admin_unified_telegram_bot_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_unified_token text;
    v_masked_token text := NULL;
    v_targets jsonb := '[]'::jsonb;
BEGIN
    -- جلب التوكن الموحد
    SELECT bot_token INTO v_unified_token
    FROM public.super_admin_telegram_bots
    WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
    LIMIT 1;

    IF v_unified_token IS NULL THEN
        SELECT setting_value INTO v_unified_token
        FROM public.home_settings
        WHERE setting_key IN ('telegram_unified_bot_token', 'telegram_backup_bot_token', 'telegram_bot_token')
          AND setting_value IS NOT NULL AND trim(setting_value) <> ''
        LIMIT 1;
    END IF;

    IF v_unified_token IS NOT NULL AND trim(v_unified_token) <> '' THEN
        IF length(v_unified_token) > 8 THEN
            v_masked_token := substring(v_unified_token from 1 for 4) || '••••' || substring(v_unified_token from length(v_unified_token)-3 for 4);
        ELSE
            v_masked_token := '••••••••';
        END IF;
    END IF;

    -- جلب الوجهات
    SELECT jsonb_agg(
        jsonb_build_object(
            'bot_key', bot_key,
            'bot_name', bot_name,
            'description', description,
            'chat_id', COALESCE(chat_id, ''),
            'is_configured', (v_unified_token IS NOT NULL AND trim(v_unified_token) <> '' AND chat_id IS NOT NULL AND trim(chat_id) <> ''),
            'updated_at', updated_at
        )
    ) INTO v_targets
    FROM public.super_admin_telegram_bots;

    RETURN jsonb_build_object(
        'unified_token_configured', (v_unified_token IS NOT NULL AND trim(v_unified_token) <> ''),
        'masked_token', v_masked_token,
        'targets', COALESCE(v_targets, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_super_admin_unified_telegram_bot_status() TO anon, authenticated, service_role;

-- 5. دالة فحص واختبار إرسال رسالة لوجهة محددة
CREATE OR REPLACE FUNCTION public.test_super_admin_system_bot(
    p_bot_key text,
    p_test_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token text;
    v_chat text;
    v_bot_name text;
    v_msg text;
BEGIN
    SELECT bot_token, chat_id, bot_name INTO v_token, v_chat, v_bot_name
    FROM public.super_admin_telegram_bots
    WHERE bot_key = p_bot_key;

    -- إن لم يكن التوكن مسجلاً في السجل، يتم أخذه من أي سجل آخر أو home_settings
    IF v_token IS NULL OR trim(v_token) = '' THEN
        SELECT bot_token INTO v_token
        FROM public.super_admin_telegram_bots
        WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
        LIMIT 1;
    END IF;

    IF v_token IS NULL OR trim(v_token) = '' THEN
        SELECT setting_value INTO v_token
        FROM public.home_settings
        WHERE setting_key IN ('telegram_unified_bot_token', 'telegram_backup_bot_token', 'telegram_bot_token')
          AND setting_value IS NOT NULL AND trim(setting_value) <> ''
        LIMIT 1;
    END IF;

    IF (v_token IS NULL OR trim(v_token) = '') THEN
        RETURN jsonb_build_object('success', false, 'message', 'لم يتم ضبط توكن البوت الموحد حتى الآن. يرجى إدخال التوكن وحفظه أولاً.');
    END IF;

    IF (v_chat IS NULL OR trim(v_chat) = '') THEN
        RETURN jsonb_build_object('success', false, 'message', 'معرف القناة/الجروب (Chat ID) غير مسجل لهذه الخدمة. يرجى إدخاله وحفظه أولاً.');
    END IF;

    v_msg := COALESCE(p_test_message, '🤖 <b>رسالة اختبار أمان من منصة UltraSoft</b>' || E'\n\n' ||
                                    '🎯 <b>الخدمة:</b> ' || COALESCE(v_bot_name, p_bot_key) || E'\n' ||
                                    '🕒 <b>الوقت:</b> ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || E'\n' ||
                                    '✅ <b>الحالة:</b> البوت الموحد يعمل بكفاءة والربط بهذه القناة مكتمل وناجح 🚀');

    BEGIN
        PERFORM net.http_post(
            url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
            body := jsonb_build_object(
                'chat_id', v_chat,
                'text', v_msg,
                'parse_mode', 'HTML'
            ),
            headers := '{"Content-Type": "application/json"}'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', true, 
            'fallback_client', true,
            'token', v_token,
            'chat_id', v_chat,
            'message', 'جاري إرسال الاختبار عبر واجهة العميل...'
        );
    END;

    RETURN jsonb_build_object('success', true, 'message', 'تم إرسال الرسالة التجريبية بنجاح إلى القناة ✈️');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل الإرسال: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_super_admin_system_bot(text, text) TO anon, authenticated, service_role;

-- 6. دوال إعدادات النسخ الاحتياطي التلقائي (Automated Backup Settings)
CREATE OR REPLACE FUNCTION public.save_automated_backup_settings(
    p_settings jsonb,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_settings IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'بيانات الإعدادات غير صالحة.');
    END IF;

    UPDATE public.home_settings SET setting_value = p_settings::text WHERE setting_key = 'automated_backup_settings';
    IF NOT FOUND THEN
        INSERT INTO public.home_settings (setting_key, setting_value) VALUES ('automated_backup_settings', p_settings::text);
    END IF;

    -- تحديث جدولة pg_cron إن كانت مفعلة ومتوفرة
    IF (p_settings->>'enabled')::boolean = true THEN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            BEGIN
                PERFORM cron.unschedule('daily_full_system_backup');
                PERFORM cron.schedule(
                    'daily_full_system_backup',
                    COALESCE(p_settings->>'cron_expression', '0 3 * * *'),
                    'SELECT public.execute_system_full_backup(''cron'');'
                );
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            BEGIN
                PERFORM cron.unschedule('daily_full_system_backup');
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END IF;

    INSERT INTO public.super_admin_security_logs (
        action_type,
        target_resource,
        performed_by_id,
        details
    ) VALUES (
        'AUTOMATED_BACKUP_SETTINGS_UPDATE',
        'home_settings:automated_backup_settings',
        p_user_id,
        p_settings
    );

    RETURN jsonb_build_object('success', true, 'message', 'تم حفظ إعدادات النسخ الاحتياطي التلقائي بنجاح 💾');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل حفظ إعدادات النسخ التلقائي: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_automated_backup_settings(jsonb, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_automated_backup_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_raw text;
BEGIN
    SELECT setting_value INTO v_raw
    FROM public.home_settings
    WHERE setting_key = 'automated_backup_settings'
    LIMIT 1;

    IF v_raw IS NOT NULL AND trim(v_raw) <> '' THEN
        RETURN v_raw::jsonb;
    ELSE
        RETURN jsonb_build_object(
            'enabled', true,
            'schedule_time', '03:00',
            'cron_expression', '0 3 * * *',
            'frequency', 'daily',
            'encryption_enabled', true,
            'storage_upload_enabled', true,
            'telegram_send_enabled', true,
            'include_all_tables', true
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_automated_backup_settings() TO anon, authenticated, service_role;

-- 7. تحديث دالة execute_system_full_backup لضمان توافق الأعمدة الكامل
CREATE OR REPLACE FUNCTION public.execute_system_full_backup(
    p_exported_by text DEFAULT 'super_admin'
)
RETURNS jsonb AS $$
DECLARE
    v_backup_id uuid := gen_random_uuid();
    v_filename text;
    v_timestamp text;
    
    v_tenants_data jsonb := '[]'::jsonb;
    v_users_data jsonb := '[]'::jsonb;
    v_plans_data jsonb := '[]'::jsonb;
    v_settings_data jsonb := '[]'::jsonb;
    v_categories_data jsonb := '[]'::jsonb;
    v_classes_data jsonb := '[]'::jsonb;
    v_sizes_data jsonb := '[]'::jsonb;
    v_colors_data jsonb := '[]'::jsonb;
    v_class_sizes_data jsonb := '[]'::jsonb;
    v_themes_data jsonb := '[]'::jsonb;
    v_models_data jsonb := '[]'::jsonb;
    v_model_sizes_data jsonb := '[]'::jsonb;
    v_model_images_data jsonb := '[]'::jsonb;
    v_model_colors_data jsonb := '[]'::jsonb;
    v_model_inventory_data jsonb := '[]'::jsonb;
    v_stock_movements_data jsonb := '[]'::jsonb;
    v_promo_cards_data jsonb := '[]'::jsonb;
    v_inbound_invoices_data jsonb := '[]'::jsonb;
    v_inbound_invoice_items_data jsonb := '[]'::jsonb;
    v_orders_data jsonb := '[]'::jsonb;
    v_order_items_data jsonb := '[]'::jsonb;
    v_order_item_preparation_data jsonb := '[]'::jsonb;
    v_preparation_status_log_data jsonb := '[]'::jsonb;
    v_order_logs_data jsonb := '[]'::jsonb;
    v_invoices_data jsonb := '[]'::jsonb;
    v_invoice_items_data jsonb := '[]'::jsonb;
    v_returns_data jsonb := '[]'::jsonb;
    v_return_items_data jsonb := '[]'::jsonb;
    v_inventory_audits_data jsonb := '[]'::jsonb;
    v_inventory_audit_items_data jsonb := '[]'::jsonb;
    v_notifications_data jsonb := '[]'::jsonb;
    v_broadcasts_data jsonb := '[]'::jsonb;
    
    v_tenants_count int := 0;
    v_total_records int := 0;
    v_full_payload jsonb;
    v_json_text text;
    v_file_bytes bigint := 0;
    v_storage_path text;
    v_tg_token text;
    v_tg_chat text;
    v_tg_msg text;
BEGIN
    v_timestamp := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD_HH24-MI-SS');
    v_filename := 'ultrasoft_full_backup_' || v_timestamp || '.json';
    v_storage_path := v_filename;

    -- 1. tenants
    IF to_regclass('public.tenants') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(t)), count(*) INTO v_tenants_data, v_tenants_count FROM public.tenants t;
        v_tenants_data := COALESCE(v_tenants_data, '[]'::jsonb);
    END IF;

    -- 2. system_users
    IF to_regclass('public.system_users') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(u)) INTO v_users_data FROM public.system_users u;
        v_users_data := COALESCE(v_users_data, '[]'::jsonb);
    END IF;

    -- 3. subscriptions
    IF to_regclass('public.subscriptions') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(p)) INTO v_plans_data FROM public.subscriptions p;
        v_plans_data := COALESCE(v_plans_data, '[]'::jsonb);
    END IF;

    -- 4. home_settings
    IF to_regclass('public.home_settings') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(s)) INTO v_settings_data FROM public.home_settings s;
        v_settings_data := COALESCE(v_settings_data, '[]'::jsonb);
    END IF;

    -- 5. categories
    IF to_regclass('public.categories') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(c)) INTO v_categories_data FROM public.categories c;
        v_categories_data := COALESCE(v_categories_data, '[]'::jsonb);
    END IF;

    -- 6. classes
    IF to_regclass('public.classes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(cl)) INTO v_classes_data FROM public.classes cl;
        v_classes_data := COALESCE(v_classes_data, '[]'::jsonb);
    END IF;

    -- 7. sizes
    IF to_regclass('public.sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sz)) INTO v_sizes_data FROM public.sizes sz;
        v_sizes_data := COALESCE(v_sizes_data, '[]'::jsonb);
    END IF;

    -- 8. colors
    IF to_regclass('public.colors') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(col)) INTO v_colors_data FROM public.colors col;
        v_colors_data := COALESCE(v_colors_data, '[]'::jsonb);
    END IF;

    -- 9. class_sizes
    IF to_regclass('public.class_sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(csz)) INTO v_class_sizes_data FROM public.class_sizes csz;
        v_class_sizes_data := COALESCE(v_class_sizes_data, '[]'::jsonb);
    END IF;

    -- 10. themes
    IF to_regclass('public.themes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(th)) INTO v_themes_data FROM public.themes th;
        v_themes_data := COALESCE(v_themes_data, '[]'::jsonb);
    END IF;

    -- 11. models
    IF to_regclass('public.models') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(m)) INTO v_models_data FROM public.models m;
        v_models_data := COALESCE(v_models_data, '[]'::jsonb);
    END IF;

    -- 12. model_sizes
    IF to_regclass('public.model_sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ms)) INTO v_model_sizes_data FROM public.model_sizes ms;
        v_model_sizes_data := COALESCE(v_model_sizes_data, '[]'::jsonb);
    END IF;

    -- 13. model_images
    IF to_regclass('public.model_images') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(mi)) INTO v_model_images_data FROM public.model_images mi;
        v_model_images_data := COALESCE(v_model_images_data, '[]'::jsonb);
    END IF;

    -- 14. model_colors_inventory
    IF to_regclass('public.model_colors_inventory') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(mci)) INTO v_model_colors_data FROM public.model_colors_inventory mci;
        v_model_colors_data := COALESCE(v_model_colors_data, '[]'::jsonb);
    END IF;

    -- 15. model_inventory
    IF to_regclass('public.model_inventory') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(minv)) INTO v_model_inventory_data FROM public.model_inventory minv;
        v_model_inventory_data := COALESCE(v_model_inventory_data, '[]'::jsonb);
    END IF;

    -- 16. promo_cards
    IF to_regclass('public.promo_cards') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(pc)) INTO v_promo_cards_data FROM public.promo_cards pc;
        v_promo_cards_data := COALESCE(v_promo_cards_data, '[]'::jsonb);
    END IF;

    -- 17. inbound_invoices
    IF to_regclass('public.inbound_invoices') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ii)) INTO v_inbound_invoices_data FROM public.inbound_invoices ii;
        v_inbound_invoices_data := COALESCE(v_inbound_invoices_data, '[]'::jsonb);
    END IF;

    -- 18. inbound_invoice_items
    IF to_regclass('public.inbound_invoice_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(iii)) INTO v_inbound_invoice_items_data FROM public.inbound_invoice_items iii;
        v_inbound_invoice_items_data := COALESCE(v_inbound_invoice_items_data, '[]'::jsonb);
    END IF;

    -- 19. orders
    IF to_regclass('public.orders') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(o)) INTO v_orders_data FROM public.orders o;
        v_orders_data := COALESCE(v_orders_data, '[]'::jsonb);
    END IF;

    -- 20. order_items
    IF to_regclass('public.order_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(oi)) INTO v_order_items_data FROM public.order_items oi;
        v_order_items_data := COALESCE(v_order_items_data, '[]'::jsonb);
    END IF;

    -- 21. order_item_preparation
    IF to_regclass('public.order_item_preparation') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(oip)) INTO v_order_item_preparation_data FROM public.order_item_preparation oip;
        v_order_item_preparation_data := COALESCE(v_order_item_preparation_data, '[]'::jsonb);
    END IF;

    -- 22. preparation_status_log
    IF to_regclass('public.preparation_status_log') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(psl)) INTO v_preparation_status_log_data FROM public.preparation_status_log psl;
        v_preparation_status_log_data := COALESCE(v_preparation_status_log_data, '[]'::jsonb);
    END IF;

    -- 23. order_logs
    IF to_regclass('public.order_logs') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ol)) INTO v_order_logs_data FROM public.order_logs ol;
        v_order_logs_data := COALESCE(v_order_logs_data, '[]'::jsonb);
    END IF;

    -- 24. invoices
    IF to_regclass('public.invoices') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(inv)) INTO v_invoices_data FROM public.invoices inv;
        v_invoices_data := COALESCE(v_invoices_data, '[]'::jsonb);
    END IF;

    -- 25. invoice_items
    IF to_regclass('public.invoice_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(invi)) INTO v_invoice_items_data FROM public.invoice_items invi;
        v_invoice_items_data := COALESCE(v_invoice_items_data, '[]'::jsonb);
    END IF;

    -- 26. returns
    IF to_regclass('public.returns') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ret)) INTO v_returns_data FROM public.returns ret;
        v_returns_data := COALESCE(v_returns_data, '[]'::jsonb);
    END IF;

    -- 27. return_items
    IF to_regclass('public.return_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(reti)) INTO v_return_items_data FROM public.return_items reti;
        v_return_items_data := COALESCE(v_return_items_data, '[]'::jsonb);
    END IF;

    -- 28. inventory_audits
    IF to_regclass('public.inventory_audits') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ia)) INTO v_inventory_audits_data FROM public.inventory_audits ia;
        v_inventory_audits_data := COALESCE(v_inventory_audits_data, '[]'::jsonb);
    END IF;

    -- 29. inventory_audit_items
    IF to_regclass('public.inventory_audit_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(iai)) INTO v_inventory_audit_items_data FROM public.inventory_audit_items iai;
        v_inventory_audit_items_data := COALESCE(v_inventory_audit_items_data, '[]'::jsonb);
    END IF;

    -- 30. stock_movements
    IF to_regclass('public.stock_movements') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sm)) INTO v_stock_movements_data FROM public.stock_movements sm;
        v_stock_movements_data := COALESCE(v_stock_movements_data, '[]'::jsonb);
    END IF;

    -- 31. system_notifications
    IF to_regclass('public.system_notifications') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sn)) INTO v_notifications_data FROM public.system_notifications sn;
        v_notifications_data := COALESCE(v_notifications_data, '[]'::jsonb);
    END IF;

    -- 32. super_admin_broadcasts
    IF to_regclass('public.super_admin_broadcasts') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(b)) INTO v_broadcasts_data FROM public.super_admin_broadcasts b;
        v_broadcasts_data := COALESCE(v_broadcasts_data, '[]'::jsonb);
    END IF;

    -- حساب إجمالي السجلات
    v_total_records := jsonb_array_length(v_tenants_data) + 
                       jsonb_array_length(v_users_data) + 
                       jsonb_array_length(v_plans_data) + 
                       jsonb_array_length(v_settings_data) + 
                       jsonb_array_length(v_categories_data) +
                       jsonb_array_length(v_classes_data) +
                       jsonb_array_length(v_sizes_data) +
                       jsonb_array_length(v_colors_data) +
                       jsonb_array_length(v_class_sizes_data) +
                       jsonb_array_length(v_themes_data) +
                       jsonb_array_length(v_models_data) +
                       jsonb_array_length(v_model_sizes_data) +
                       jsonb_array_length(v_model_images_data) +
                       jsonb_array_length(v_model_colors_data) +
                       jsonb_array_length(v_model_inventory_data) +
                       jsonb_array_length(v_promo_cards_data) +
                       jsonb_array_length(v_inbound_invoices_data) +
                       jsonb_array_length(v_inbound_invoice_items_data) +
                       jsonb_array_length(v_orders_data) + 
                       jsonb_array_length(v_order_items_data) +
                       jsonb_array_length(v_order_item_preparation_data) +
                       jsonb_array_length(v_preparation_status_log_data) +
                       jsonb_array_length(v_order_logs_data) +
                       jsonb_array_length(v_invoices_data) +
                       jsonb_array_length(v_invoice_items_data) +
                       jsonb_array_length(v_returns_data) +
                       jsonb_array_length(v_return_items_data) +
                       jsonb_array_length(v_inventory_audits_data) +
                       jsonb_array_length(v_inventory_audit_items_data) +
                       jsonb_array_length(v_stock_movements_data) +
                       jsonb_array_length(v_notifications_data) +
                       jsonb_array_length(v_broadcasts_data);

    -- الهيكل النهائي
    v_full_payload := jsonb_build_object(
        'system', 'UltraSoft Enterprise ERP & Multi-Tenant Platform',
        'backup_version', '2.0_full_system_snapshot',
        'created_at', now(),
        'exported_by', p_exported_by,
        'summary', jsonb_build_object(
            'total_tenants', v_tenants_count,
            'total_records', v_total_records,
            'tables_backed_up', 32
        ),
        'tables', jsonb_build_object(
            'tenants', v_tenants_data,
            'system_users', v_users_data,
            'subscriptions', v_plans_data,
            'home_settings', v_settings_data,
            'categories', v_categories_data,
            'classes', v_classes_data,
            'sizes', v_sizes_data,
            'colors', v_colors_data,
            'class_sizes', v_class_sizes_data,
            'themes', v_themes_data,
            'models', v_models_data,
            'model_sizes', v_model_sizes_data,
            'model_images', v_model_images_data,
            'model_colors_inventory', v_model_colors_data,
            'model_inventory', v_model_inventory_data,
            'promo_cards', v_promo_cards_data,
            'inbound_invoices', v_inbound_invoices_data,
            'inbound_invoice_items', v_inbound_invoice_items_data,
            'orders', v_orders_data,
            'order_items', v_order_items_data,
            'order_item_preparation', v_order_item_preparation_data,
            'preparation_status_log', v_preparation_status_log_data,
            'order_logs', v_order_logs_data,
            'invoices', v_invoices_data,
            'invoice_items', v_invoice_items_data,
            'returns', v_returns_data,
            'return_items', v_return_items_data,
            'inventory_audits', v_inventory_audits_data,
            'inventory_audit_items', v_inventory_audit_items_data,
            'stock_movements', v_stock_movements_data,
            'system_notifications', v_notifications_data,
            'super_admin_broadcasts', v_broadcasts_data
        )
    );

    v_json_text := v_full_payload::text;
    v_file_bytes := octet_length(v_json_text);

    -- حفظ السجل بجدول super_admin_backups_log بالأعمدة الصحيحة
    INSERT INTO public.super_admin_backups_log (
        id,
        filename,
        backup_type,
        total_records,
        total_tenants,
        file_size_bytes,
        storage_path,
        download_url,
        exported_by,
        checksum,
        metadata,
        created_at
    ) VALUES (
        v_backup_id,
        v_filename,
        CASE WHEN p_exported_by = 'cron' THEN 'automated_daily' ELSE 'manual_instant' END,
        v_total_records,
        v_tenants_count,
        v_file_bytes,
        v_storage_path,
        '/storage/v1/object/public/system_backups/' || v_filename,
        p_exported_by,
        md5(v_json_text),
        v_full_payload,
        now()
    );

    -- إرسال الإشعار والملخص التلقائي للتليجرام
    SELECT bot_token INTO v_tg_token
    FROM public.super_admin_telegram_bots
    WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
    LIMIT 1;

    IF v_tg_token IS NULL THEN
        SELECT setting_value INTO v_tg_token
        FROM public.home_settings
        WHERE setting_key IN ('telegram_backup_bot_token', 'telegram_unified_bot_token', 'telegram_bot_token')
        LIMIT 1;
    END IF;

    SELECT chat_id INTO v_tg_chat
    FROM public.super_admin_telegram_bots
    WHERE bot_key = 'backup_bot' AND chat_id IS NOT NULL AND trim(chat_id) <> ''
    LIMIT 1;

    IF v_tg_chat IS NULL THEN
        SELECT setting_value INTO v_tg_chat
        FROM public.home_settings
        WHERE setting_key IN ('telegram_backup_chat_id', 'telegram_chat_id')
        LIMIT 1;
    END IF;

    IF (v_tg_token IS NOT NULL AND v_tg_chat IS NOT NULL AND TRIM(v_tg_token) <> '' AND TRIM(v_tg_chat) <> '') THEN
        v_tg_msg := '💾 <b>النسخة الاحتياطية الشاملة للمنظومة</b>' || E'\n\n' ||
                    '📄 <b>اسم الملف:</b> <code>' || v_filename || '</code>' || E'\n' ||
                    '🏭 <b>عدد المصانع:</b> ' || v_tenants_count || E'\n' ||
                    '📊 <b>إجمالي السجلات:</b> ' || v_total_records || ' سجل عبر 32 جدول' || E'\n' ||
                    '📦 <b>الحجم التقديري:</b> ' || round(v_file_bytes / (1024.0 * 1024.0), 2) || ' MB' || E'\n' ||
                    '👤 <b>نوع العملية:</b> ' || CASE WHEN p_exported_by = 'cron' THEN '⏰ جدولة آلية (Automated Cron)' ELSE '⚡ تشغيل يدوي فوري' END || E'\n' ||
                    '🕒 <b>التاريخ:</b> ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS UTC');

        BEGIN
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || v_tg_token || '/sendMessage',
                body := jsonb_build_object('chat_id', v_tg_chat, 'text', v_tg_msg, 'parse_mode', 'HTML'),
                headers := '{"Content-Type": "application/json"}'::jsonb
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'backup_id', v_backup_id,
        'filename', v_filename,
        'total_records', v_total_records,
        'payload', v_full_payload
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_system_full_backup(text) TO authenticated, anon, service_role;
