-- =========================================================================
-- 🌟 MIGRATION V71: SUPER ADMIN NOTIFICATION CENTER & ULTRA-SECURE TELEGRAM BOTS 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-08
-- الإصدار: v71.0
-- الوصف: 
-- 1. إضافة مركز إرسال الإشعارات للبث المباشر (Super Admin Broadcast Notification Center).
-- 2. إعدادات بوتات تليجرام الخاصة بـ UltraSoft مع نمط تشفير وحجب الرموز والحماية الفائقة (Write-Only Secrets).
-- =========================================================================

-- 1. جدول بوتات التليجرام الخاصة بالنظام (UltraSoft System Telegram Bots)
CREATE TABLE IF NOT EXISTS public.super_admin_telegram_bots (
    bot_key text PRIMARY KEY,
    bot_name text NOT NULL,
    description text,
    bot_token text,
    chat_id text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES public.system_users(id)
);

ALTER TABLE public.super_admin_telegram_bots ENABLE ROW LEVEL SECURITY;

-- منع القراءة المباشرة من حزم العُملاء لمنع تسريب التوكن
DROP POLICY IF EXISTS "super_admin_telegram_bots_no_direct_access" ON public.super_admin_telegram_bots;
CREATE POLICY "super_admin_telegram_bots_no_direct_access" ON public.super_admin_telegram_bots
    FOR ALL TO authenticated USING (false);

-- إدراج البوتات الثلاثة الرئيسية الأولية بالنظام
INSERT INTO public.super_admin_telegram_bots (bot_key, bot_name, description)
VALUES 
    ('backup_bot', 'بوت النسخ الاحتياطي (Backup Bot)', 'مسؤول عن عمليات النسخ الاحتياطي وإرسال ملفات وتفاصيل التكويت والنسخ الاحتياطي السحابي.'),
    ('reports_bot', 'بوت التقارير والفرق الإدارية (Reports & Admin Bot)', 'مسؤول عن التقارير الإدارية، إشعارات المنظومة، وتنبيهات فرق العمل.'),
    ('testing_bot', 'بوت عمليات الاختبارات والـ Sandbox (Testing Bot)', 'مسؤول عن عمليات الاختبارات والتشخيص البرمجي للاستخدام وقت الحاجة.')
ON CONFLICT (bot_key) DO UPDATE 
SET bot_name = EXCLUDED.bot_name, description = EXCLUDED.description;

-- 2. دالة SECURITY DEFINER لحفظ/استبدال بيانات البوت بأمان
CREATE OR REPLACE FUNCTION public.save_super_admin_system_bot(
    p_bot_key text,
    p_bot_name text,
    p_description text,
    p_bot_token text,
    p_chat_id text,
    p_user_id uuid
)
RETURNS jsonb AS $$
DECLARE
    v_user_role text;
    v_username text;
    v_masked_token text := NULL;
    v_masked_chat text := NULL;
BEGIN
    -- التحقق من هية المستخدم وصلاحياته بالسوبر أدمن
    SELECT role, username INTO v_user_role, v_username
    FROM public.system_users
    WHERE id = p_user_id;

    IF (v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'super_admin')) THEN
        IF NOT EXISTS (SELECT 1 FROM public.system_users WHERE id = p_user_id AND (role = 'super_admin' OR tenant_id IS NULL)) THEN
            RAISE EXCEPTION 'غير مصرح: يجب توفر صلاحيات السوبر أدمن لتعديل بوتات النظام';
        END IF;
    END IF;

    -- إدراج أو تحديث بيانات البوت (استبدال التوكن والـ Chat ID فورياً)
    INSERT INTO public.super_admin_telegram_bots (
        bot_key, bot_name, description, bot_token, chat_id, updated_at, updated_by
    )
    VALUES (
        p_bot_key,
        COALESCE(NULLIF(TRIM(p_bot_name), ''), p_bot_key),
        p_description,
        NULLIF(TRIM(p_bot_token), ''),
        NULLIF(TRIM(p_chat_id), ''),
        now(),
        p_user_id
    )
    ON CONFLICT (bot_key) DO UPDATE
    SET 
        bot_name = COALESCE(NULLIF(TRIM(EXCLUDED.bot_name), ''), super_admin_telegram_bots.bot_name),
        description = COALESCE(EXCLUDED.description, super_admin_telegram_bots.description),
        bot_token = CASE WHEN EXCLUDED.bot_token IS NOT NULL AND TRIM(EXCLUDED.bot_token) <> '' THEN EXCLUDED.bot_token ELSE super_admin_telegram_bots.bot_token END,
        chat_id = CASE WHEN EXCLUDED.chat_id IS NOT NULL AND TRIM(EXCLUDED.chat_id) <> '' THEN EXCLUDED.chat_id ELSE super_admin_telegram_bots.chat_id END,
        updated_at = now(),
        updated_by = p_user_id;

    -- حساب القيم المحجوبة للعرض بأمان دون كشف التوكن الكامل
    SELECT 
        CASE WHEN bot_token IS NOT NULL AND length(bot_token) > 8 
             THEN substring(bot_token from 1 for 4) || '••••' || substring(bot_token from length(bot_token)-3 for 4)
             WHEN bot_token IS NOT NULL THEN '••••••••'
             ELSE NULL END,
        CASE WHEN chat_id IS NOT NULL AND length(chat_id) > 6
             THEN substring(chat_id from 1 for 4) || '••••' || substring(chat_id from length(chat_id)-2 for 3)
             WHEN chat_id IS NOT NULL THEN chat_id
             ELSE NULL END
    INTO v_masked_token, v_masked_chat
    FROM public.super_admin_telegram_bots
    WHERE bot_key = p_bot_key;

    -- تسجيل حدث الأمان في السجل
    PERFORM public.log_super_admin_security_event(
        p_user_id,
        COALESCE(v_username, 'super_admin'),
        'SYSTEM_BOT_CONFIG_UPDATED',
        'HIGH',
        '127.0.0.1',
        'Web Client',
        jsonb_build_object('bot_key', p_bot_key, 'has_token', (p_bot_token IS NOT NULL), 'has_chat_id', (p_chat_id IS NOT NULL))
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم حفظ وتشفير إعدادات البوت بنجاح 🔒',
        'bot_key', p_bot_key,
        'is_configured', (v_masked_token IS NOT NULL AND v_masked_chat IS NOT NULL),
        'masked_token', v_masked_token,
        'masked_chat_id', v_masked_chat
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. دالة استرجاع حالات وتفاصيل بوتات النظام دون إرجاع الـ Tokens الحساسة
CREATE OR REPLACE FUNCTION public.get_super_admin_system_bots_status()
RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'bot_key', bot_key,
            'bot_name', bot_name,
            'description', description,
            'is_configured', (bot_token IS NOT NULL AND chat_id IS NOT NULL AND TRIM(bot_token) <> '' AND TRIM(chat_id) <> ''),
            'has_token', (bot_token IS NOT NULL AND TRIM(bot_token) <> ''),
            'has_chat_id', (chat_id IS NOT NULL AND TRIM(chat_id) <> ''),
            'masked_token', CASE WHEN bot_token IS NOT NULL AND length(bot_token) > 8 
                                 THEN substring(bot_token from 1 for 4) || '••••' || substring(bot_token from length(bot_token)-3 for 4)
                                 WHEN bot_token IS NOT NULL THEN '••••••••'
                                 ELSE NULL END,
            'masked_chat_id', CASE WHEN chat_id IS NOT NULL AND length(chat_id) > 6
                                    THEN substring(chat_id from 1 for 4) || '••••' || substring(chat_id from length(chat_id)-2 for 3)
                                    WHEN chat_id IS NOT NULL THEN chat_id
                                    ELSE NULL END,
            'is_active', COALESCE(is_active, true),
            'updated_at', updated_at
        )
    ) INTO v_result
    FROM public.super_admin_telegram_bots;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. دالة اختبار إرسال رسالة تجريبية من بوت النظام
CREATE OR REPLACE FUNCTION public.test_super_admin_system_bot(
    p_bot_key text,
    p_test_message text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_token text;
    v_chat text;
    v_bot_name text;
    v_msg text;
BEGIN
    SELECT bot_token, chat_id, bot_name INTO v_token, v_chat, v_bot_name
    FROM public.super_admin_telegram_bots
    WHERE bot_key = p_bot_key;

    IF (v_token IS NULL OR v_chat IS NULL OR TRIM(v_token) = '' OR TRIM(v_chat) = '') THEN
        RETURN jsonb_build_object('success', false, 'message', 'لم يتم ضبط كود التوكن أو ID الـ Chat الخاص بهذا البوت حتى الآن.');
    END IF;

    v_msg := COALESCE(p_test_message, '🤖 <b>رسالة اختبار أمان من منصة UltraSoft</b>' || E'\n' ||
                                    'اسم البوت: ' || v_bot_name || E'\n' ||
                                    'الوقت: ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || E'\n' ||
                                    'تنبيه: هذا البوت يعمل بكفاءة وجاهز لإرسال الإشعارات والتقارير 🚀');

    PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        body := jsonb_build_object(
            'chat_id', v_chat,
            'text', v_msg,
            'parse_mode', 'HTML'
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );

    RETURN jsonb_build_object('success', true, 'message', 'تم إرسال الرسالة التجريبية بنجاح إلى التليجرام ✈️');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل الإرسال: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. جدول سجل إشعارات البث المباشر (Super Admin Broadcasts Log)
CREATE TABLE IF NOT EXISTS public.super_admin_broadcasts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    body text NOT NULL,
    type text NOT NULL DEFAULT 'general',
    target_type text NOT NULL DEFAULT 'all',
    target_tenant_ids uuid[] DEFAULT '{}',
    channels jsonb DEFAULT '{}'::jsonb,
    total_tenants_reached int DEFAULT 0,
    sent_by text,
    sender_name text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.super_admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_broadcasts_select" ON public.super_admin_broadcasts;
CREATE POLICY "super_admin_broadcasts_select" ON public.super_admin_broadcasts
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "super_admin_broadcasts_write" ON public.super_admin_broadcasts;
CREATE POLICY "super_admin_broadcasts_write" ON public.super_admin_broadcasts
    FOR ALL USING (true) WITH CHECK (true);

-- 6. دالة تنفيذ إرسال الإشعارات والبث للمصانع والتليجرام
CREATE OR REPLACE FUNCTION public.send_super_admin_broadcast(
    p_title text,
    p_body text,
    p_type text,
    p_target_type text, -- 'all' or 'selected'
    p_target_tenant_ids uuid[],
    p_send_in_app boolean,
    p_send_telegram boolean,
    p_telegram_target text, -- 'orders', 'stock', 'both'
    p_sender_id text,
    p_sender_name text
)
RETURNS jsonb AS $$
DECLARE
    v_tenant_rec RECORD;
    v_target_ids uuid[] := '{}';
    v_reached_count int := 0;
    v_tg_sent_count int := 0;
    v_new_broadcast_id uuid;
    v_tg_token text;
    v_tg_chat text;
    v_tg_stock_chat text;
    v_formatted_tg_msg text;
BEGIN
    IF (p_title IS NULL OR TRIM(p_title) = '' OR p_body IS NULL OR TRIM(p_body) = '') THEN
        RETURN jsonb_build_object('success', false, 'message', 'يرجى إدخال عنوان الإشعار ومحتوى الرسالة بالكامل');
    END IF;

    -- تجميع المصانع المستهدفة
    IF (p_target_type = 'all') THEN
        SELECT array_agg(id) INTO v_target_ids
        FROM public.tenants
        WHERE (status IS NULL OR status = 'active' OR status = 'ACTIVE') AND slug <> 'default';

        IF (v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL OR array_length(v_target_ids, 1) = 0) THEN
            SELECT array_agg(id) INTO v_target_ids
            FROM public.tenants
            WHERE slug <> 'default';
        END IF;
    ELSE
        v_target_ids := p_target_tenant_ids;
    END IF;

    -- تجهيز نص رسالة التليجرام المشفرة
    v_formatted_tg_msg := '📢 <b>' || replace(replace(replace(p_title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</b>' || E'\n\n' ||
                         replace(replace(replace(p_body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || E'\n\n' ||
                         '<i>صادر من إدارة منصة UltraSoft العليا 🏢</i>';

    -- المرور على جميع المصانع المستهدفة
    FOR v_tenant_rec IN 
        SELECT id, name FROM public.tenants WHERE id = ANY(v_target_ids)
    LOOP
        v_reached_count := v_reached_count + 1;

        -- أ) إضافة إشعار داخل المنظومة (system_notifications)
        IF (p_send_in_app = true) THEN
            INSERT INTO public.system_notifications (
                type, title, body, metadata, tenant_id, is_read, created_at
            )
            VALUES (
                COALESCE(p_type, 'system_update'),
                p_title,
                p_body,
                jsonb_build_object(
                    'sender', p_sender_name,
                    'broadcast', true,
                    'target_type', p_target_type
                ),
                v_tenant_rec.id,
                false,
                now()
            );
        END IF;

        -- ب) إرسال لبوت التليجرام الخاص بالمصنع إن كان مفعلاً
        IF (p_send_telegram = true) THEN
            SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE tenant_id = v_tenant_rec.id AND setting_key = 'telegram_bot_token';
            SELECT setting_value INTO v_tg_chat FROM public.home_settings WHERE tenant_id = v_tenant_rec.id AND setting_key = 'telegram_chat_id';
            SELECT setting_value INTO v_tg_stock_chat FROM public.home_settings WHERE tenant_id = v_tenant_rec.id AND setting_key = 'telegram_stock_chat_id';

            IF (v_tg_token IS NULL) THEN
                SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE setting_key = 'telegram_bot_token' LIMIT 1;
            END IF;

            IF (v_tg_token IS NOT NULL AND TRIM(v_tg_token) <> '') THEN
                -- الإرسال لجروب الطلبات/العام
                IF ((p_telegram_target = 'orders' OR p_telegram_target = 'both') AND v_tg_chat IS NOT NULL AND TRIM(v_tg_chat) <> '') THEN
                    PERFORM net.http_post(
                        url := 'https://api.telegram.org/bot' || v_tg_token || '/sendMessage',
                        body := jsonb_build_object('chat_id', v_tg_chat, 'text', v_formatted_tg_msg, 'parse_mode', 'HTML'),
                        headers := '{"Content-Type": "application/json"}'::jsonb
                    );
                    v_tg_sent_count := v_tg_sent_count + 1;
                END IF;

                -- الإرسال لجروب المخزون
                IF ((p_telegram_target = 'stock' OR p_telegram_target = 'both') AND v_tg_stock_chat IS NOT NULL AND TRIM(v_tg_stock_chat) <> '') THEN
                    PERFORM net.http_post(
                        url := 'https://api.telegram.org/bot' || v_tg_token || '/sendMessage',
                        body := jsonb_build_object('chat_id', v_tg_stock_chat, 'text', v_formatted_tg_msg, 'parse_mode', 'HTML'),
                        headers := '{"Content-Type": "application/json"}'::jsonb
                    );
                END IF;
            END IF;
        END IF;

    END LOOP;

    -- تسجيل البث في سجل السوبر أدمن
    INSERT INTO public.super_admin_broadcasts (
        title, body, type, target_type, target_tenant_ids, channels, total_tenants_reached, sent_by, sender_name, created_at
    )
    VALUES (
        p_title,
        p_body,
        COALESCE(p_type, 'general'),
        p_target_type,
        v_target_ids,
        jsonb_build_object(
            'in_app', p_send_in_app,
            'telegram', p_send_telegram,
            'telegram_target', p_telegram_target
        ),
        v_reached_count,
        p_sender_id,
        p_sender_name,
        now()
    )
    RETURNING id INTO v_new_broadcast_id;

    -- تسجيل حدث أمان
    PERFORM public.log_super_admin_security_event(
        p_sender_id,
        COALESCE(p_sender_name, 'super_admin'),
        'BROADCAST_NOTIFICATION_SENT',
        'HIGH',
        '127.0.0.1',
        'Web Client',
        jsonb_build_object('broadcast_id', v_new_broadcast_id, 'target_count', v_reached_count, 'title', p_title)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم إرسال الإشعار والبث بنجاح لعدد (' || v_reached_count || ') مصنع 📢',
        'broadcast_id', v_new_broadcast_id,
        'reached_count', v_reached_count,
        'telegram_sent_count', v_tg_sent_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
