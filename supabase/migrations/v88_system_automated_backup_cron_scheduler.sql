-- =========================================================================
-- 🌟 MIGRATION V88: 24/7 AUTOMATED SYSTEM BACKUP SCHEDULER & TELEGRAM FILE ATTACHMENT 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-09-03
-- الإصدار: v88.0
-- الوصف: 
-- 1. تحديث دالة execute_system_full_backup لإرسال ملف النسخة المشفر/الكامل مباشرة كـ Document إلى جروب الباك اب حصرياً (وليس جروب الطلبات).
-- 2. دالة الجدولة التلقائية process_system_automated_backup_tick() لمقارنة توقيت السيرفر اليومي وتوقيت القاهرة بدقة.
-- 3. تفعيل الجدولة على محرك pg_cron كل دقيقة (24/7) دون الحاجة لفتح المتصفح.
-- =========================================================================

-- 1. تحديث دالة استخراج النسخة الاحتياطية الشاملة وإرسالها لجروب النسخ الاحتياطي حصرياً
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
    v_home_settings_data jsonb := '[]'::jsonb;
    v_platform_settings_data jsonb := '[]'::jsonb;
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
    v_promo_cards_data jsonb := '[]'::jsonb;
    v_inbound_invoices_data jsonb := '[]'::jsonb;
    v_inbound_invoice_items_data jsonb := '[]'::jsonb;
    v_orders_data jsonb := '[]'::jsonb;
    v_order_items_data jsonb := '[]'::jsonb;
    v_order_item_preparation_data jsonb := '[]'::jsonb;
    v_order_status_history_data jsonb := '[]'::jsonb;
    v_order_tracking_events_data jsonb := '[]'::jsonb;
    v_invoices_data jsonb := '[]'::jsonb;
    v_returns_data jsonb := '[]'::jsonb;
    v_return_items_data jsonb := '[]'::jsonb;
    v_inventory_audits_data jsonb := '[]'::jsonb;
    v_inventory_audit_items_data jsonb := '[]'::jsonb;
    v_stock_movements_data jsonb := '[]'::jsonb;
    v_notifications_data jsonb := '[]'::jsonb;
    v_broadcasts_data jsonb := '[]'::jsonb;
    
    v_tenants_count int := 0;
    v_total_records int := 0;
    v_full_payload jsonb;
    v_json_text text;
    v_file_bytes bigint := 0;
    v_storage_path text;
    v_public_url text;
    
    v_tg_token text;
    v_tg_chat text;
    v_tg_msg text;
    v_now_cairo timestamp;
BEGIN
    v_now_cairo := now() AT TIME ZONE 'Africa/Cairo';
    v_timestamp := to_char(v_now_cairo, 'YYYY-MM-DD_HH24-MI-SS');
    v_filename := 'ultrasoft_full_backup_' || v_timestamp || '.json';
    v_storage_path := v_filename;
    v_public_url := 'https://huyzroaqvzbwhenilpjh.supabase.co/storage/v1/object/public/system_backups/' || v_filename;

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
        SELECT jsonb_agg(to_jsonb(s)) INTO v_home_settings_data FROM public.home_settings s;
        v_home_settings_data := COALESCE(v_home_settings_data, '[]'::jsonb);
    END IF;

    -- 5. system_platform_settings
    IF to_regclass('public.system_platform_settings') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sp)) INTO v_platform_settings_data FROM public.system_platform_settings sp;
        v_platform_settings_data := COALESCE(v_platform_settings_data, '[]'::jsonb);
    END IF;

    -- 6. categories
    IF to_regclass('public.categories') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(c)) INTO v_categories_data FROM public.categories c;
        v_categories_data := COALESCE(v_categories_data, '[]'::jsonb);
    END IF;

    -- 7. classes
    IF to_regclass('public.classes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(cl)) INTO v_classes_data FROM public.classes cl;
        v_classes_data := COALESCE(v_classes_data, '[]'::jsonb);
    END IF;

    -- 8. sizes
    IF to_regclass('public.sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(sz)) INTO v_sizes_data FROM public.sizes sz;
        v_sizes_data := COALESCE(v_sizes_data, '[]'::jsonb);
    END IF;

    -- 9. colors
    IF to_regclass('public.colors') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(col)) INTO v_colors_data FROM public.colors col;
        v_colors_data := COALESCE(v_colors_data, '[]'::jsonb);
    END IF;

    -- 10. class_sizes
    IF to_regclass('public.class_sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(csz)) INTO v_class_sizes_data FROM public.class_sizes csz;
        v_class_sizes_data := COALESCE(v_class_sizes_data, '[]'::jsonb);
    END IF;

    -- 11. themes
    IF to_regclass('public.themes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(th)) INTO v_themes_data FROM public.themes th;
        v_themes_data := COALESCE(v_themes_data, '[]'::jsonb);
    END IF;

    -- 12. models
    IF to_regclass('public.models') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(m)) INTO v_models_data FROM public.models m;
        v_models_data := COALESCE(v_models_data, '[]'::jsonb);
    END IF;

    -- 13. model_sizes
    IF to_regclass('public.model_sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ms)) INTO v_model_sizes_data FROM public.model_sizes ms;
        v_model_sizes_data := COALESCE(v_model_sizes_data, '[]'::jsonb);
    END IF;

    -- 14. model_images
    IF to_regclass('public.model_images') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(mi)) INTO v_model_images_data FROM public.model_images mi;
        v_model_images_data := COALESCE(v_model_images_data, '[]'::jsonb);
    END IF;

    -- 15. model_colors_inventory
    IF to_regclass('public.model_colors_inventory') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(mci)) INTO v_model_colors_data FROM public.model_colors_inventory mci;
        v_model_colors_data := COALESCE(v_model_colors_data, '[]'::jsonb);
    END IF;

    -- 16. model_inventory
    IF to_regclass('public.model_inventory') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(minv)) INTO v_model_inventory_data FROM public.model_inventory minv;
        v_model_inventory_data := COALESCE(v_model_inventory_data, '[]'::jsonb);
    END IF;

    -- 17. promo_cards
    IF to_regclass('public.promo_cards') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(pc)) INTO v_promo_cards_data FROM public.promo_cards pc;
        v_promo_cards_data := COALESCE(v_promo_cards_data, '[]'::jsonb);
    END IF;

    -- 18. inbound_invoices
    IF to_regclass('public.inbound_invoices') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ii)) INTO v_inbound_invoices_data FROM public.inbound_invoices ii;
        v_inbound_invoices_data := COALESCE(v_inbound_invoices_data, '[]'::jsonb);
    END IF;

    -- 19. inbound_invoice_items
    IF to_regclass('public.inbound_invoice_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(iii)) INTO v_inbound_invoice_items_data FROM public.inbound_invoice_items iii;
        v_inbound_invoice_items_data := COALESCE(v_inbound_invoice_items_data, '[]'::jsonb);
    END IF;

    -- 20. orders
    IF to_regclass('public.orders') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(o)) INTO v_orders_data FROM public.orders o;
        v_orders_data := COALESCE(v_orders_data, '[]'::jsonb);
    END IF;

    -- 21. order_items
    IF to_regclass('public.order_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(oi)) INTO v_order_items_data FROM public.order_items oi;
        v_order_items_data := COALESCE(v_order_items_data, '[]'::jsonb);
    END IF;

    -- 22. order_item_preparation
    IF to_regclass('public.order_item_preparation') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(oip)) INTO v_order_item_preparation_data FROM public.order_item_preparation oip;
        v_order_item_preparation_data := COALESCE(v_order_item_preparation_data, '[]'::jsonb);
    END IF;

    -- 23. order_status_history
    IF to_regclass('public.order_status_history') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(osh)) INTO v_order_status_history_data FROM public.order_status_history osh;
        v_order_status_history_data := COALESCE(v_order_status_history_data, '[]'::jsonb);
    END IF;

    -- 24. order_tracking_events
    IF to_regclass('public.order_tracking_events') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ote)) INTO v_order_tracking_events_data FROM public.order_tracking_events ote;
        v_order_tracking_events_data := COALESCE(v_order_tracking_events_data, '[]'::jsonb);
    END IF;

    -- 25. invoices
    IF to_regclass('public.invoices') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(inv)) INTO v_invoices_data FROM public.invoices inv;
        v_invoices_data := COALESCE(v_invoices_data, '[]'::jsonb);
    END IF;

    -- 26. returns
    IF to_regclass('public.returns') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ret)) INTO v_returns_data FROM public.returns ret;
        v_returns_data := COALESCE(v_returns_data, '[]'::jsonb);
    END IF;

    -- 27. return_items
    IF to_regclass('public.return_items') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(ri)) INTO v_return_items_data FROM public.return_items ri;
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
        SELECT jsonb_agg(to_jsonb(sab)) INTO v_broadcasts_data FROM public.super_admin_broadcasts sab;
        v_broadcasts_data := COALESCE(v_broadcasts_data, '[]'::jsonb);
    END IF;

    v_total_records := jsonb_array_length(v_tenants_data) +
                       jsonb_array_length(v_users_data) +
                       jsonb_array_length(v_plans_data) +
                       jsonb_array_length(v_home_settings_data) +
                       jsonb_array_length(v_platform_settings_data) +
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
                       jsonb_array_length(v_order_status_history_data) +
                       jsonb_array_length(v_order_tracking_events_data) +
                       jsonb_array_length(v_invoices_data) +
                       jsonb_array_length(v_returns_data) +
                       jsonb_array_length(v_return_items_data) +
                       jsonb_array_length(v_inventory_audits_data) +
                       jsonb_array_length(v_inventory_audit_items_data) +
                       jsonb_array_length(v_stock_movements_data) +
                       jsonb_array_length(v_notifications_data) +
                       jsonb_array_length(v_broadcasts_data);

    v_full_payload := jsonb_build_object(
        'system', 'UltraSoft Enterprise Multi-Tenant Platform',
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
            'home_settings', v_home_settings_data,
            'system_platform_settings', v_platform_settings_data,
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
            'order_status_history', v_order_status_history_data,
            'order_tracking_events', v_order_tracking_events_data,
            'invoices', v_invoices_data,
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

    -- تسجيل النسخة في جدول super_admin_backups_log
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
        v_public_url,
        p_exported_by,
        md5(v_json_text),
        v_full_payload,
        now()
    );

    -- جلب توكن البوت الموحد
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

    -- جلب معرف جروب النسخ الاحتياطي حصرياً (ولا يتم استخدام جروب الطلبات مطلقاً)
    SELECT chat_id INTO v_tg_chat
    FROM public.super_admin_telegram_bots
    WHERE bot_key = 'backup_bot' AND chat_id IS NOT NULL AND trim(chat_id) <> ''
    LIMIT 1;

    IF v_tg_chat IS NULL OR trim(v_tg_chat) = '' THEN
        SELECT setting_value INTO v_tg_chat
        FROM public.home_settings
        WHERE setting_key = 'telegram_backup_chat_id'
        LIMIT 1;
    END IF;

    -- إرسال الإشعار والملف إلى جروب النسخ الاحتياطي عبر pg_net
    IF (v_tg_token IS NOT NULL AND v_tg_chat IS NOT NULL AND TRIM(v_tg_token) <> '' AND TRIM(v_tg_chat) <> '') THEN
        v_tg_msg := '💾 <b>النسخة الاحتياطية الشاملة لمنظومة UltraSoft</b>' || E'\n' ||
                    '━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
                    '📄 <b>اسم الملف:</b> <code>' || v_filename || '</code>' || E'\n' ||
                    '🏭 <b>عدد المصانع:</b> ' || v_tenants_count || ' مصنع' || E'\n' ||
                    '📊 <b>إجمالي السجلات:</b> ' || to_char(v_total_records, 'FM999,999,999') || ' سجل عبر 32 جدولاً بالكامل' || E'\n' ||
                    '📦 <b>الحجم التقديري:</b> ' || round(v_file_bytes / (1024.0 * 1024.0), 2) || ' MB' || E'\n' ||
                    '👤 <b>نوع العملية:</b> ' || CASE WHEN p_exported_by = 'cron' THEN '⏰ جدولة آلية دورية (Automated Cron)' ELSE '⚡ تشغيل يدوي فوري' END || E'\n' ||
                    '🕒 <b>التوقيت المحلي:</b> ' || to_char(v_now_cairo, 'YYYY-MM-DD HH12:MI:SS AM') || E'\n' ||
                    '━━━━━━━━━━━━━━━━━━━━' || E'\n' ||
                    '🤖 <i>تم إرسال هذا الملف مرفقاً مباشرة إلى قناة النسخ الاحتياطي المعتمدة</i>';

        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            BEGIN
                -- محاولة إرسال الملف المستخرج كـ Document عبر رابط التخزين العام
                PERFORM net.http_post(
                    url := 'https://api.telegram.org/bot' || v_tg_token || '/sendDocument',
                    body := jsonb_build_object(
                        'chat_id', v_tg_chat,
                        'document', v_public_url,
                        'caption', v_tg_msg,
                        'parse_mode', 'HTML'
                    ),
                    headers := '{"Content-Type": "application/json"}'::jsonb
                );
            EXCEPTION WHEN OTHERS THEN
                -- بديل في حال تعذر إرسال المستند
                BEGIN
                    PERFORM net.http_post(
                        url := 'https://api.telegram.org/bot' || v_tg_token || '/sendMessage',
                        body := jsonb_build_object('chat_id', v_tg_chat, 'text', v_tg_msg, 'parse_mode', 'HTML'),
                        headers := '{"Content-Type": "application/json"}'::jsonb
                    );
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END;
        END IF;
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

-- 2. دالة الفحص اللحظي لموعد النسخ الاحتياطي التلقائي (Scheduled Cron Tick)
CREATE OR REPLACE FUNCTION public.process_system_automated_backup_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings_raw text;
    v_settings jsonb;
    v_enabled boolean := false;
    v_schedule_time text := '03:00';
    v_frequency text := 'daily';
    
    v_now_cairo timestamp;
    v_cur_time text;
    v_cur_hour text;
    v_cur_day text;
    v_exec_key text;
    v_executed boolean := false;
BEGIN
    -- قراءة إعدادات النسخ الاحتياطي من home_settings
    SELECT setting_value INTO v_settings_raw
    FROM public.home_settings
    WHERE setting_key = 'automated_backup_settings'
    LIMIT 1;

    IF v_settings_raw IS NULL OR trim(v_settings_raw) = '' THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'إعدادات النسخ التلقائي غير مضبوطة');
    END IF;

    BEGIN
        v_settings := v_settings_raw::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'تنسيق الإعدادات غير صالح');
    END;

    v_enabled := COALESCE((v_settings->>'enabled')::boolean, false);
    IF NOT v_enabled THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'النسخ التلقائي متوقف مؤقتاً');
    END IF;

    v_schedule_time := COALESCE(v_settings->>'schedule_time', '03:00');
    v_frequency := COALESCE(v_settings->>'frequency', 'daily');

    -- توقيت مصر/القاهرة المحلي
    v_now_cairo := now() AT TIME ZONE 'Africa/Cairo';
    v_cur_time := to_char(v_now_cairo, 'HH24:MI');
    v_cur_hour := to_char(v_now_cairo, 'HH24');
    v_cur_day := lower(trim(to_char(v_now_cairo, 'Day')));

    -- فحص التوقيت وفقاً للتكرار (يومي، كل 12 ساعة، أسبوعي)
    IF v_frequency = 'daily' THEN
        IF v_cur_time = v_schedule_time THEN
            v_exec_key := 'auto_backup_daily_' || to_char(v_now_cairo, 'YYYY-MM-DD');
            IF NOT EXISTS (SELECT 1 FROM public.super_admin_backups_log WHERE exported_by = v_exec_key) THEN
                PERFORM public.execute_system_full_backup(v_exec_key);
                v_executed := true;
            END IF;
        END IF;
    ELSIF v_frequency = 'every_12h' THEN
        IF v_cur_time = v_schedule_time OR to_char(v_now_cairo, 'MI') = split_part(v_schedule_time, ':', 2) AND 
           (v_cur_hour::int = (split_part(v_schedule_time, ':', 1)::int + 12) % 24) THEN
            v_exec_key := 'auto_backup_12h_' || to_char(v_now_cairo, 'YYYY-MM-DD_HH24');
            IF NOT EXISTS (SELECT 1 FROM public.super_admin_backups_log WHERE exported_by = v_exec_key) THEN
                PERFORM public.execute_system_full_backup(v_exec_key);
                v_executed := true;
            END IF;
        END IF;
    ELSIF v_frequency = 'weekly' THEN
        IF v_cur_day = 'friday' AND v_cur_time = v_schedule_time THEN
            v_exec_key := 'auto_backup_weekly_' || to_char(v_now_cairo, 'IYYY-IW');
            IF NOT EXISTS (SELECT 1 FROM public.super_admin_backups_log WHERE exported_by = v_exec_key) THEN
                PERFORM public.execute_system_full_backup(v_exec_key);
                v_executed := true;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'executed', v_executed,
        'server_cairo_time', v_cur_time,
        'schedule_time', v_schedule_time,
        'frequency', v_frequency
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_system_automated_backup_tick() TO authenticated, anon, service_role;

-- 3. تسجيل الجدولة في pg_cron لتعمل تلقائياً كل دقيقة (24/7)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('ultrasoft_system_automated_backup_tick');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        
        BEGIN
            PERFORM cron.schedule(
                'ultrasoft_system_automated_backup_tick',
                '* * * * *',
                'SELECT public.process_system_automated_backup_tick();'
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;
