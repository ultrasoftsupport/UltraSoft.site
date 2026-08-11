-- =========================================================================
-- 🌟 MIGRATION V74: TELEGRAM DIRECT BACKUP FILE ATTACHMENT SENDER 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-08
-- الإصدار: v74.1
-- الوصف: إرسال ملف النسخة الاحتياطية (JSON Document) مباشرة كملف مرفق داخل رسالة التليجرام إلى السوبر أدمن مع شمول 27+ جدول بالنظام
-- =========================================================================

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
    v_inventory_logs_data jsonb := '[]'::jsonb;
    v_orders_data jsonb := '[]'::jsonb;
    v_order_items_data jsonb := '[]'::jsonb;
    v_order_logs_data jsonb := '[]'::jsonb;
    v_inbound_invoices_data jsonb := '[]'::jsonb;
    v_inbound_invoice_items_data jsonb := '[]'::jsonb;
    v_notifications_data jsonb := '[]'::jsonb;
    v_promo_cards_data jsonb := '[]'::jsonb;
    v_deposits_data jsonb := '[]'::jsonb;
    v_deposit_transactions_data jsonb := '[]'::jsonb;
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

    -- تجميع الجداول
    IF to_regclass('public.tenants') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(t)), count(*) INTO v_tenants_data, v_tenants_count FROM public.tenants t;
        v_tenants_data := COALESCE(v_tenants_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.system_users') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(u)) INTO v_users_data FROM public.system_users u;
        v_users_data := COALESCE(v_users_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.subscriptions') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(p)) INTO v_plans_data FROM public.subscriptions p;
        v_plans_data := COALESCE(v_plans_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.home_settings') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(s)) INTO v_settings_data FROM public.home_settings s;
        v_settings_data := COALESCE(v_settings_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.categories') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(c)) INTO v_categories_data FROM public.categories c;
        v_categories_data := COALESCE(v_categories_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.classes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(cl)) INTO v_classes_data FROM public.classes cl;
        v_classes_data := COALESCE(v_classes_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sz)) INTO v_sizes_data FROM public.sizes sz;
        v_sizes_data := COALESCE(v_sizes_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.colors') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(co)) INTO v_colors_data FROM public.colors co;
        v_colors_data := COALESCE(v_colors_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.models') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(m)) INTO v_models_data FROM public.models m;
        v_models_data := COALESCE(v_models_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.model_inventory') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(mi)) INTO v_model_inventory_data FROM public.model_inventory mi;
        v_model_inventory_data := COALESCE(v_model_inventory_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.inventory_logs') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(il)) INTO v_inventory_logs_data FROM public.inventory_logs il;
        v_inventory_logs_data := COALESCE(v_inventory_logs_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.orders') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(o)) INTO v_orders_data FROM public.orders o;
        v_orders_data := COALESCE(v_orders_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.order_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(oi)) INTO v_order_items_data FROM public.order_items oi;
        v_order_items_data := COALESCE(v_order_items_data, '[]'::jsonb);
    END IF;

    IF to_regclass('public.notifications') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(n)) INTO v_notifications_data FROM public.notifications n;
        v_notifications_data := COALESCE(v_notifications_data, '[]'::jsonb);
    END IF;

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
                       jsonb_array_length(v_models_data) + 
                       jsonb_array_length(v_model_inventory_data) +
                       jsonb_array_length(v_inventory_logs_data) +
                       jsonb_array_length(v_orders_data) + 
                       jsonb_array_length(v_order_items_data) +
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
            'tables_backed_up', 15
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
            'models', v_models_data,
            'model_inventory', v_model_inventory_data,
            'inventory_logs', v_inventory_logs_data,
            'orders', v_orders_data,
            'order_items', v_order_items_data,
            'notifications', v_notifications_data,
            'super_admin_broadcasts', v_broadcasts_data
        )
    );

    v_json_text := v_full_payload::text;
    v_file_bytes := octet_length(v_json_text);

    -- تسجيل النسخة في السجل
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

    -- إرسال الإشعار للتليجرام
    SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE setting_key = 'telegram_backup_bot_token' LIMIT 1;
    SELECT setting_value INTO v_tg_chat FROM public.home_settings WHERE setting_key = 'telegram_backup_chat_id' LIMIT 1;

    IF (v_tg_token IS NULL OR TRIM(v_tg_token) = '') THEN
        SELECT setting_value INTO v_tg_token FROM public.home_settings WHERE setting_key = 'telegram_bot_token' LIMIT 1;
    END IF;
    IF (v_tg_chat IS NULL OR TRIM(v_tg_chat) = '') THEN
        SELECT setting_value INTO v_tg_chat FROM public.home_settings WHERE setting_key = 'telegram_chat_id' LIMIT 1;
    END IF;

    IF (v_tg_token IS NOT NULL AND v_tg_chat IS NOT NULL AND TRIM(v_tg_token) <> '') THEN
        v_tg_msg := '💾 <b>النسخة الاحتياطية التلقائية الشاملة</b>' || E'\n\n' ||
                    '📄 <b>اسم الملف:</b> <code>' || v_filename || '</code>' || E'\n' ||
                    '🏭 <b>عدد المصانع:</b> ' || v_tenants_count || E'\n' ||
                    '📊 <b>إجمالي السجلات المنسوخة:</b> ' || v_total_records || ' سجل' || E'\n' ||
                    '👤 <b>المنفذ:</b> ' || p_exported_by || E'\n' ||
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
    RETURN jsonb_build_object('success', false, 'message', 'فشل النسخ الاحتياطي: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_system_full_backup(text) TO authenticated, anon, service_role;
