-- =========================================================================
-- 🌟 MIGRATION V89: FIX PERSISTENT SAVE FOR AUTOMATED BACKUP SETTINGS 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-09-03
-- الإصدار: v89.0
-- الوصف: 
-- 1. إصلاح خطأ تسجيل الأمان في دالة save_automated_backup_settings لمنع ارتداد الإعدادات للقيم القديمة.
-- 2. حفظ الإعدادات في جدولي system_platform_settings و home_settings معاً لضمان الثبات الكامل.
-- 3. تحديث دالة get_automated_backup_settings للقراءة المباشرة والدقيقة.
-- =========================================================================

-- 1. إصلاح وتأمين دالة حفظ إعدادات النسخ الاحتياطي التلقائي
CREATE OR REPLACE FUNCTION public.save_automated_backup_settings(
    p_settings jsonb,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_username text := 'super_admin';
BEGIN
    IF p_settings IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'بيانات الإعدادات غير صالحة.');
    END IF;

    -- أ) حفظ الإعدادات في home_settings
    UPDATE public.home_settings 
    SET setting_value = p_settings::text 
    WHERE setting_key = 'automated_backup_settings';
    
    IF NOT FOUND THEN
        INSERT INTO public.home_settings (setting_key, setting_value) 
        VALUES ('automated_backup_settings', p_settings::text);
    END IF;

    -- ب) حفظ الإعدادات في جدول الهيكلة الحديثة system_platform_settings
    IF to_regclass('public.system_platform_settings') IS NOT NULL THEN
        INSERT INTO public.system_platform_settings (
            setting_key,
            setting_value,
            description,
            updated_at
        ) VALUES (
            'automated_backup_settings',
            p_settings,
            'إعدادات النسخ الاحتياطي التلقائي الشامل',
            now()
        )
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            updated_at = now();
    END IF;

    -- ج) تسجيل العملية في سجل الأمان بأعمدة الجدول الصحيحة مع حماية من الأخطاء
    BEGIN
        IF to_regclass('public.super_admin_security_logs') IS NOT NULL THEN
            IF p_user_id IS NOT NULL THEN
                SELECT COALESCE(username, 'super_admin') INTO v_username 
                FROM public.system_users 
                WHERE id = p_user_id;
            END IF;

            INSERT INTO public.super_admin_security_logs (
                user_id,
                username,
                event_type,
                severity,
                details
            ) VALUES (
                p_user_id,
                COALESCE(v_username, 'super_admin'),
                'AUTOMATED_BACKUP_SETTINGS_UPDATE',
                'LOW',
                p_settings
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- عدم إيقاف الحفظ في حال حدوث أي خطأ في جدول السجلات
        NULL;
    END;

    RETURN jsonb_build_object('success', true, 'message', 'تم حفظ إعدادات النسخ الاحتياطي التلقائي بنجاح 💾');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل حفظ إعدادات النسخ التلقائي: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_automated_backup_settings(jsonb, uuid) TO anon, authenticated, service_role;

-- 2. تحديث دالة قراءة إعدادات النسخ الاحتياطي التلقائي
CREATE OR REPLACE FUNCTION public.get_automated_backup_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_val jsonb;
    v_raw text;
BEGIN
    -- أ) محاولة القراءة من system_platform_settings أولاً
    IF to_regclass('public.system_platform_settings') IS NOT NULL THEN
        SELECT setting_value INTO v_val
        FROM public.system_platform_settings
        WHERE setting_key = 'automated_backup_settings'
        LIMIT 1;

        IF v_val IS NOT NULL THEN
            RETURN v_val;
        END IF;
    END IF;

    -- ب) محاولة القراءة من home_settings
    SELECT setting_value INTO v_raw
    FROM public.home_settings
    WHERE setting_key = 'automated_backup_settings'
    LIMIT 1;

    IF v_raw IS NOT NULL AND trim(v_raw) <> '' THEN
        BEGIN
            RETURN v_raw::jsonb;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- ج) القيم الافتراضية في حال عدم وجود إعدادات سابقة
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_automated_backup_settings() TO anon, authenticated, service_role;
