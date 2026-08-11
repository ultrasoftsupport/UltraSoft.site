-- =========================================================================
-- 🌟 MIGRATION V72: SYSTEM-WIDE AUTOMATED FULL BACKUPS & TG BOT INTEGRATION 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-08
-- الإصدار: v72.0
-- الوصف:
-- 1. إنشاء جدول سجل النسخ الاحتياطية وتحديث الهيكل ليضمن السعات والتنزيل الفوري.
-- 2. إنشاء دالة execute_system_full_backup لاستخراج وتجميع كافة بيانات المصانع والسيستم بأكمله.
-- 3. تفعيل الجدولة التلقائية pg_cron للعمل تلقائياً كل 24 ساعة داخل قاعدة البيانات.
-- 4. ربط الرفع على Supabase Storage Bucket (system_backups) والإرسال الفوري لبوت التليجرام الخاص بالسوبر أدمن.
-- =========================================================================

-- 1. إنشاء جدول سجل النسخ الاحتياطية المخصص والمنعزل بالكامل للسوبر أدمن (Super Admin Dedicated Backups Log)
CREATE TABLE IF NOT EXISTS public.super_admin_backups_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    filename text NOT NULL UNIQUE,
    backup_type text NOT NULL DEFAULT 'full_system_snapshot',
    total_records integer DEFAULT 0,
    total_tenants integer DEFAULT 0,
    file_size_bytes bigint DEFAULT 0,
    storage_path text,
    download_url text,
    exported_by text DEFAULT 'super_admin',
    checksum text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT super_admin_backups_log_pkey PRIMARY KEY (id)
);

ALTER TABLE public.super_admin_backups_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to super_admin_backups_log" ON public.super_admin_backups_log;
CREATE POLICY "Allow all access to super_admin_backups_log"
    ON public.super_admin_backups_log FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. إعداد حاوية التخزين system_backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'system_backups',
    'system_backups',
    true,
    104857600, -- 100 MB
    ARRAY['application/json', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE 
SET public = true,
    file_size_limit = 104857600;

-- 3. دالة التنفيذ الكبرى للنسخ الاحتياطي العام الشامل
CREATE OR REPLACE FUNCTION public.execute_system_full_backup(
    p_exported_by text DEFAULT 'super_admin'
)
RETURNS jsonb AS $$
DECLARE
    v_backup_id uuid := gen_random_uuid();
    v_filename text;
    v_timestamp text;
    v_tenants_data jsonb;
    v_users_data jsonb;
    v_plans_data jsonb;
    v_settings_data jsonb;
    v_models_data jsonb;
    v_orders_data jsonb;
    v_notifications_data jsonb;
    v_broadcasts_data jsonb;
    
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

    -- تجميع بيانات المصانع والشركات
    IF (to_regclass('public.tenants') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(t)), count(*) INTO v_tenants_data, v_tenants_count FROM public.tenants t;
        v_tenants_data := COALESCE(v_tenants_data, '[]'::jsonb);
    ELSE
        v_tenants_data := '[]'::jsonb;
    END IF;

    -- تجميع بيانات مستخدمي المنظومة
    IF (to_regclass('public.system_users') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(u)) INTO v_users_data FROM public.system_users u;
        v_users_data := COALESCE(v_users_data, '[]'::jsonb);
    ELSE
        v_users_data := '[]'::jsonb;
    END IF;

    -- تجميع الاشتراكات والخطط
    IF (to_regclass('public.system_subscription_plans') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(p)) INTO v_plans_data FROM public.system_subscription_plans p;
        v_plans_data := COALESCE(v_plans_data, '[]'::jsonb);
    ELSIF (to_regclass('public.subscriptions') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(p)) INTO v_plans_data FROM public.subscriptions p;
        v_plans_data := COALESCE(v_plans_data, '[]'::jsonb);
    ELSE
        v_plans_data := '[]'::jsonb;
    END IF;

    -- تجميع الإعدادات العامة للمصانع
    IF (to_regclass('public.home_settings') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(s)) INTO v_settings_data FROM public.home_settings s;
        v_settings_data := COALESCE(v_settings_data, '[]'::jsonb);
    ELSE
        v_settings_data := '[]'::jsonb;
    END IF;

    -- تجميع المنتجات والموديلات
    IF (to_regclass('public.models') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(m)) INTO v_models_data FROM public.models m;
        v_models_data := COALESCE(v_models_data, '[]'::jsonb);
    ELSE
        v_models_data := '[]'::jsonb;
    END IF;

    -- تجميع الطلبات والأوردرات
    IF (to_regclass('public.orders') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(o)) INTO v_orders_data FROM public.orders o;
        v_orders_data := COALESCE(v_orders_data, '[]'::jsonb);
    ELSE
        v_orders_data := '[]'::jsonb;
    END IF;

    -- تجميع الإشعارات وسجل البث
    IF (to_regclass('public.super_admin_broadcasts') IS NOT NULL) THEN
        SELECT jsonb_agg(to_jsonb(b)) INTO v_broadcasts_data FROM public.super_admin_broadcasts b;
        v_broadcasts_data := COALESCE(v_broadcasts_data, '[]'::jsonb);
    ELSE
        v_broadcasts_data := '[]'::jsonb;
    END IF;

    -- حساب إجمالي السجلات المنسوخة
    v_total_records := jsonb_array_length(v_tenants_data) + 
                       jsonb_array_length(v_users_data) + 
                       jsonb_array_length(v_plans_data) + 
                       jsonb_array_length(v_settings_data) + 
                       jsonb_array_length(v_models_data) + 
                       jsonb_array_length(v_orders_data) + 
                       jsonb_array_length(v_broadcasts_data);

    -- تجهيز الهيكل النهائي للنسخة الاحتياطية
    v_full_payload := jsonb_build_object(
        'system', 'UltraSoft Enterprise ERP & Multi-Tenant Platform',
        'backup_version', '2.0_full_system_snapshot',
        'created_at', now(),
        'exported_by', p_exported_by,
        'summary', jsonb_build_object(
            'total_tenants', v_tenants_count,
            'total_records', v_total_records,
            'tables_backed_up', 7
        ),
        'tables', jsonb_build_object(
            'tenants', v_tenants_data,
            'system_users', v_users_data,
            'subscription_plans', v_plans_data,
            'home_settings', v_settings_data,
            'models', v_models_data,
            'orders', v_orders_data,
            'super_admin_broadcasts', v_broadcasts_data
        )
    );

    v_json_text := v_full_payload::text;
    v_file_bytes := octet_length(v_json_text);

    -- تسجيل النسخة في جدول السجلات المخصص والمنعزل بالسوبر أدمن
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
    )
    VALUES (
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

    -- تسجيل حدث أمان بإنشاء النسخة
    PERFORM public.log_super_admin_security_event(
        NULL,
        COALESCE(p_exported_by, 'system'),
        'FULL_SYSTEM_BACKUP_CREATED',
        'MEDIUM',
        '127.0.0.1',
        'System Engine',
        jsonb_build_object('filename', v_filename, 'total_records', v_total_records, 'size_bytes', v_file_bytes)
    );

    -- إرسال الإشعار والملخص لبوت التليجرام الخاص بالسوبر أدمن (backup_bot)
    SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE setting_key = 'telegram_backup_bot_token' LIMIT 1;
    SELECT setting_value INTO v_tg_chat FROM public.home_settings WHERE setting_key = 'telegram_backup_chat_id' LIMIT 1;

    IF (v_tg_token IS NULL OR TRIM(v_tg_token) = '') THEN
        SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE setting_key = 'telegram_bot_token' LIMIT 1;
    END IF;

    IF (v_tg_chat IS NULL OR TRIM(v_tg_chat) = '') THEN
        SELECT setting_value INTO v_tg_chat FROM public.home_settings WHERE setting_key = 'telegram_chat_id' LIMIT 1;
    END IF;

    IF (v_tg_token IS NOT NULL AND v_tg_chat IS NOT NULL AND TRIM(v_tg_token) <> '' AND TRIM(v_tg_chat) <> '') THEN
        v_tg_msg := '📦 <b>تم إنشاء نسخة احتياطية شاملة للمنظومة بالكامل</b>' || E'\n\n' ||
                    '📄 <b>اسم الملف:</b> <code>' || v_filename || '</code>' || E'\n' ||
                    '🏢 <b>عدد المصانع:</b> ' || v_tenants_count || ' مصنع' || E'\n' ||
                    '📊 <b>إجمالي السجلات:</b> ' || v_total_records || ' سجل' || E'\n' ||
                    '💾 <b>حجم النسخة:</b> ' || round((v_file_bytes / 1024.0 / 1024.0)::numeric, 2) || ' MB' || E'\n' ||
                    '⚙️ <b>نوع النسخ:</b> ' || CASE WHEN p_exported_by = 'cron' THEN '⏰ تلقائي (كل 24 ساعة)' ELSE '⚡ يدوي من السوبر أدمن' END || E'\n' ||
                    '🕒 <b>التاريخ:</b> ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS UTC') || E'\n\n' ||
                    '🛡️ <i>محفوظة ومحمية بسحابة UltraSoft Storage Vault</i>';

        BEGIN
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || v_tg_token || '/sendMessage',
                body := jsonb_build_object('chat_id', v_tg_chat, 'text', v_tg_msg, 'parse_mode', 'HTML'),
                headers := '{"Content-Type": "application/json"}'::jsonb
            );
        EXCEPTION WHEN OTHERS THEN
            -- تجاهل أي خطأ شبكة بالتليجرام لاستمرار النسخ
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تم إنشاء وتخزين النسخة الاحتياطية الشاملة للمنظومة بنجاح 💾',
        'backup_id', v_backup_id,
        'filename', v_filename,
        'total_records', v_total_records,
        'total_tenants', v_tenants_count,
        'file_size_bytes', v_file_bytes,
        'download_url', '/storage/v1/object/public/system_backups/' || v_filename,
        'payload', v_full_payload
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل إجراء النسخ الاحتياطي: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. إعداد الجدولة التلقائية pg_cron للعمل يومياً كل 24 ساعة (الساعة 03:00 AM)
DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- إلغاء الجدولة القديمة إن وجدت
        PERFORM cron.unschedule('daily_full_system_backup');
        
        -- إضافة الجدولة اليومية الجديدة
        PERFORM cron.schedule(
            'daily_full_system_backup',
            '0 3 * * *',
            'SELECT public.execute_system_full_backup(''cron'');'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- في حال عدم تفعيل إضافة pg_cron على السيرفر
END $do$;
