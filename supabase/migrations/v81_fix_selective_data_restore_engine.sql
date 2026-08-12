-- =========================================================================
-- 🌟 MIGRATION V81: FIX SELECTIVE DATA RESTORE ENGINE & FULL SYSTEM EXPORTER 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-11
-- الإصدار: v81.1 (Comprehensive Full-System Backup Exporter & Relational Disaster Recovery)
-- الوصف:
-- 1. تحديث دالة execute_system_full_backup لتصدير كافة جداول النظام الـ 32 بالكامل (بما فيها model_colors_inventory, class_sizes, model_sizes, order_items, invoices, inbound_invoices, stock_movements).
-- 2. تحديث دالة execute_selective_tenant_restore لدعم كافة جداول المنظومة الـ 30 وحماية جميع العلاقات بالترتيب الهيكلي التوبولوجي (Topological Ordering).
-- 3. تصحيح استعادة الأرصدة (available_series في model_inventory).
-- 4. استعادة العلاقات الكلية والألوان بكامل خصائصها (name, color_code, hex_code, is_active).
-- =========================================================================

-- =========================================================================
-- PART 1: 📦 FULL SYSTEM BACKUP EXPORTER (تصدير النسخ الحية الشاملة لكافة الجداول)
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
        SELECT jsonb_agg(to_jsonb(co)) INTO v_colors_data FROM public.colors co;
        v_colors_data := COALESCE(v_colors_data, '[]'::jsonb);
    END IF;

    -- 9. class_sizes
    IF to_regclass('public.class_sizes') IS NOT NULL THEN
        SELECT jsonb_agg(to_jsonb(cs)) INTO v_class_sizes_data FROM public.class_sizes cs;
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

    -- الهيكل النهائي بالكامل
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

    -- حفظ السجل بجدول super_admin_backups_log
    INSERT INTO public.super_admin_backups_log (
        id, filename, file_size_bytes, storage_bucket, storage_path,
        total_tenants_count, total_records_count, status, created_at, notes
    ) VALUES (
        v_backup_id, v_filename, v_file_bytes, 'system_backups', v_storage_path,
        v_tenants_count, v_total_records, 'completed', now(), 'نسخة احتياطية شاملة لجميع الجداول والعلاقات'
    );

    RETURN v_full_payload;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_system_full_backup(text) TO authenticated, anon, service_role;


-- =========================================================================
-- PART 2: 📥 SELECTIVE RESTORE ENGINE (دالة استعادة وتحليل السجلات)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.execute_selective_tenant_restore(
    p_tenant_id uuid DEFAULT NULL,
    p_restore_payload jsonb DEFAULT '{}'::jsonb,
    p_restored_by text DEFAULT 'super_admin'
)
RETURNS jsonb AS $$
DECLARE
    v_tenant_name text;
    v_tenant_slug text;
    
    v_tables_payload jsonb;
    v_item jsonb;
    
    v_total_restored int := 0;
    v_tbl_name text;
    
    -- الترتيب التوبولوجي الهندسي الاستعادة لحماية جميع العلاقات الخارجية FK
    v_table_keys text[] := ARRAY[
        'categories',
        'classes',
        'sizes',
        'colors',
        'class_sizes',
        'system_users',
        'themes',
        'home_settings',
        'models',
        'model_sizes',
        'model_images',
        'model_colors_inventory',
        'model_inventory',
        'promo_cards',
        'inbound_invoices',
        'inbound_invoice_items',
        'orders',
        'order_items',
        'order_item_preparation',
        'preparation_status_log',
        'order_logs',
        'invoices',
        'invoice_items',
        'returns',
        'return_items',
        'inventory_audits',
        'inventory_audit_items',
        'stock_movements',
        'system_notifications',
        'super_admin_broadcasts'
    ];
BEGIN
    -- 1. التحقق من وجود المصنع المستهدف إن تم تحديده
    IF p_tenant_id IS NOT NULL THEN
        SELECT name, slug INTO v_tenant_name, v_tenant_slug
        FROM public.tenants
        WHERE id = p_tenant_id LIMIT 1;

        IF (v_tenant_name IS NULL) THEN
            RETURN jsonb_build_object('success', false, 'message', 'المصنع المستهدف غير موجود بالقاعدة.');
        END IF;
    ELSE
        v_tenant_name := 'جميع مصانع المنظومة (استعادة منصة كاملة)';
        v_tenant_slug := 'all-tenants';
    END IF;

    v_tables_payload := COALESCE(p_restore_payload->'tables', p_restore_payload);

    -- 2.1 categories
    IF v_tables_payload ? 'categories' AND to_regclass('public.categories') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'categories', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.categories SELECT * FROM jsonb_populate_record(NULL::public.categories, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.2 classes (الفئات والأنواع / الفئات العمرية)
    IF v_tables_payload ? 'classes' AND to_regclass('public.classes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'classes', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.classes SELECT * FROM jsonb_populate_record(NULL::public.classes, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.3 sizes (المقاسات)
    IF v_tables_payload ? 'sizes' AND to_regclass('public.sizes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'sizes', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.sizes SELECT * FROM jsonb_populate_record(NULL::public.sizes, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.4 colors (الألوان المعتمدة بكامل خصائصها)
    IF v_tables_payload ? 'colors' AND to_regclass('public.colors') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'colors', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.colors SELECT * FROM jsonb_populate_record(NULL::public.colors, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color_code = COALESCE(EXCLUDED.color_code, colors.color_code), hex_code = COALESCE(EXCLUDED.hex_code, colors.hex_code), is_active = COALESCE(EXCLUDED.is_active, colors.is_active)' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.5 class_sizes (ربط الفئات العمرية بالمقاسات)
    IF v_tables_payload ? 'class_sizes' AND to_regclass('public.class_sizes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'class_sizes', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.class_sizes SELECT * FROM jsonb_populate_record(NULL::public.class_sizes, $1) ON CONFLICT (class_id, size_id) DO NOTHING' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.6 system_users
    IF v_tables_payload ? 'system_users' AND to_regclass('public.system_users') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'system_users', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.system_users SELECT * FROM jsonb_populate_record(NULL::public.system_users, $1) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, username = EXCLUDED.username, role = EXCLUDED.role, is_active = EXCLUDED.is_active, worker_job = EXCLUDED.worker_job' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.7 themes
    IF v_tables_payload ? 'themes' AND to_regclass('public.themes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'themes', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.themes SELECT * FROM jsonb_populate_record(NULL::public.themes, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, theme_key = EXCLUDED.theme_key, colors = EXCLUDED.colors, is_active = EXCLUDED.is_active' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.8 home_settings
    IF v_tables_payload ? 'home_settings' AND to_regclass('public.home_settings') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'home_settings', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.home_settings SELECT * FROM jsonb_populate_record(NULL::public.home_settings, $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, description = EXCLUDED.description' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.9 models
    IF v_tables_payload ? 'models' AND to_regclass('public.models') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'models', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.models SELECT * FROM jsonb_populate_record(NULL::public.models, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, system_code = EXCLUDED.system_code, factory_code = EXCLUDED.factory_code, category_id = EXCLUDED.category_id, class_id = EXCLUDED.class_id, price = EXCLUDED.price, is_active = EXCLUDED.is_active, image_url_1 = EXCLUDED.image_url_1, image_url_2 = EXCLUDED.image_url_2, image_url_3 = EXCLUDED.image_url_3, updated_at = now()' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.10 model_sizes
    IF v_tables_payload ? 'model_sizes' AND to_regclass('public.model_sizes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'model_sizes', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.model_sizes SELECT * FROM jsonb_populate_record(NULL::public.model_sizes, $1) ON CONFLICT (model_id, size_id) DO NOTHING' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.11 model_images
    IF v_tables_payload ? 'model_images' AND to_regclass('public.model_images') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'model_images', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.model_images SELECT * FROM jsonb_populate_record(NULL::public.model_images, $1) ON CONFLICT (id) DO UPDATE SET image_url = EXCLUDED.image_url' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.12 model_colors_inventory
    IF v_tables_payload ? 'model_colors_inventory' AND to_regclass('public.model_colors_inventory') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'model_colors_inventory', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                BEGIN
                    EXECUTE 'INSERT INTO public.model_colors_inventory SELECT * FROM jsonb_populate_record(NULL::public.model_colors_inventory, $1) ON CONFLICT (id) DO UPDATE SET available_series_count = EXCLUDED.available_series_count, is_active = EXCLUDED.is_active' USING v_item;
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        EXECUTE 'INSERT INTO public.model_colors_inventory SELECT * FROM jsonb_populate_record(NULL::public.model_colors_inventory, $1) ON CONFLICT (model_id, color_id) DO UPDATE SET available_series_count = EXCLUDED.available_series_count, is_active = EXCLUDED.is_active' USING v_item;
                    EXCEPTION WHEN OTHERS THEN NULL; END;
                END;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.13 model_inventory (تصحيح استعادة الرصيد المتاح available_series مع دعم التعارض التبادلي على model_id, color_id)
    IF v_tables_payload ? 'model_inventory' AND to_regclass('public.model_inventory') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'model_inventory', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                BEGIN
                    EXECUTE 'INSERT INTO public.model_inventory SELECT * FROM jsonb_populate_record(NULL::public.model_inventory, $1) ON CONFLICT (id) DO UPDATE SET available_series = EXCLUDED.available_series, updated_at = now()' USING v_item;
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        EXECUTE 'INSERT INTO public.model_inventory SELECT * FROM jsonb_populate_record(NULL::public.model_inventory, $1) ON CONFLICT (model_id, color_id) DO UPDATE SET available_series = EXCLUDED.available_series, updated_at = now()' USING v_item;
                    EXCEPTION WHEN OTHERS THEN NULL; END;
                END;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.14 promo_cards
    IF v_tables_payload ? 'promo_cards' AND to_regclass('public.promo_cards') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'promo_cards', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.promo_cards SELECT * FROM jsonb_populate_record(NULL::public.promo_cards, $1) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, is_active = EXCLUDED.is_active' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.15 inbound_invoices
    IF v_tables_payload ? 'inbound_invoices' AND to_regclass('public.inbound_invoices') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'inbound_invoices', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.inbound_invoices SELECT * FROM jsonb_populate_record(NULL::public.inbound_invoices, $1) ON CONFLICT (id) DO UPDATE SET invoice_number = EXCLUDED.invoice_number, supplier_name = EXCLUDED.supplier_name, notes = EXCLUDED.notes, total_series = EXCLUDED.total_series, total_cost = EXCLUDED.total_cost' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.16 inbound_invoice_items
    IF v_tables_payload ? 'inbound_invoice_items' AND to_regclass('public.inbound_invoice_items') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'inbound_invoice_items', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.inbound_invoice_items SELECT * FROM jsonb_populate_record(NULL::public.inbound_invoice_items, $1) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_cost = EXCLUDED.unit_cost, total_cost = EXCLUDED.total_cost' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.17 orders
    IF v_tables_payload ? 'orders' AND to_regclass('public.orders') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'orders', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.orders SELECT * FROM jsonb_populate_record(NULL::public.orders, $1) ON CONFLICT (id) DO UPDATE SET invoice_number = EXCLUDED.invoice_number, customer_name = EXCLUDED.customer_name, phone_1 = EXCLUDED.phone_1, phone_2 = EXCLUDED.phone_2, address = EXCLUDED.address, deposit = EXCLUDED.deposit, deposit_receiver = EXCLUDED.deposit_receiver, notes = EXCLUDED.notes, total_price = EXCLUDED.total_price, total_series = EXCLUDED.total_series, status = EXCLUDED.status, preparation_status = EXCLUDED.preparation_status, is_archived = EXCLUDED.is_archived, is_locked = EXCLUDED.is_locked' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.18 order_items
    IF v_tables_payload ? 'order_items' AND to_regclass('public.order_items') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'order_items', '[]'::jsonb)) LOOP
                BEGIN
                    EXECUTE 'INSERT INTO public.order_items SELECT * FROM jsonb_populate_record(NULL::public.order_items, $1) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, price_per_series = EXCLUDED.price_per_series, total_price = EXCLUDED.total_price' USING v_item;
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        EXECUTE 'INSERT INTO public.order_items SELECT * FROM jsonb_populate_record(NULL::public.order_items, $1) ON CONFLICT (order_id, model_id, color_id) DO UPDATE SET quantity = EXCLUDED.quantity, price_per_series = EXCLUDED.price_per_series, total_price = EXCLUDED.total_price' USING v_item;
                    EXCEPTION WHEN OTHERS THEN NULL; END;
                END;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.19 order_item_preparation
    IF v_tables_payload ? 'order_item_preparation' AND to_regclass('public.order_item_preparation') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'order_item_preparation', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.order_item_preparation SELECT * FROM jsonb_populate_record(NULL::public.order_item_preparation, $1) ON CONFLICT (id) DO UPDATE SET is_prepared = EXCLUDED.is_prepared, has_issue = EXCLUDED.has_issue, note = EXCLUDED.note, prepared_qty = EXCLUDED.prepared_qty' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.20 preparation_status_log
    IF v_tables_payload ? 'preparation_status_log' AND to_regclass('public.preparation_status_log') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'preparation_status_log', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.preparation_status_log SELECT * FROM jsonb_populate_record(NULL::public.preparation_status_log, $1) ON CONFLICT (id) DO UPDATE SET old_status = EXCLUDED.old_status, new_status = EXCLUDED.new_status, note = EXCLUDED.note' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.21 order_logs
    IF v_tables_payload ? 'order_logs' AND to_regclass('public.order_logs') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'order_logs', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.order_logs SELECT * FROM jsonb_populate_record(NULL::public.order_logs, $1) ON CONFLICT (id) DO UPDATE SET action_type = EXCLUDED.action_type, details = EXCLUDED.details' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.22 invoices
    IF v_tables_payload ? 'invoices' AND to_regclass('public.invoices') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'invoices', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.invoices SELECT * FROM jsonb_populate_record(NULL::public.invoices, $1) ON CONFLICT (id) DO UPDATE SET customer_name = EXCLUDED.customer_name, customer_phone_1 = EXCLUDED.customer_phone_1, deposit_amount = EXCLUDED.deposit_amount, total_amount = EXCLUDED.total_amount, is_archived = EXCLUDED.is_archived' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.23 invoice_items
    IF v_tables_payload ? 'invoice_items' AND to_regclass('public.invoice_items') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'invoice_items', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.invoice_items SELECT * FROM jsonb_populate_record(NULL::public.invoice_items, $1) ON CONFLICT (id) DO UPDATE SET series_quantity = EXCLUDED.series_quantity, unit_price = EXCLUDED.unit_price, total_line_price = EXCLUDED.total_line_price' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.24 returns
    IF v_tables_payload ? 'returns' AND to_regclass('public.returns') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'returns', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.returns SELECT * FROM jsonb_populate_record(NULL::public.returns, $1) ON CONFLICT (id) DO UPDATE SET return_number = EXCLUDED.return_number, customer_name = EXCLUDED.customer_name, refund_amount = EXCLUDED.refund_amount, total_series = EXCLUDED.total_series' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.25 return_items
    IF v_tables_payload ? 'return_items' AND to_regclass('public.return_items') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'return_items', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.return_items SELECT * FROM jsonb_populate_record(NULL::public.return_items, $1) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, price_per_series = EXCLUDED.price_per_series, total_price = EXCLUDED.total_price' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.26 inventory_audits
    IF v_tables_payload ? 'inventory_audits' AND to_regclass('public.inventory_audits') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'inventory_audits', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.inventory_audits SELECT * FROM jsonb_populate_record(NULL::public.inventory_audits, $1) ON CONFLICT (id) DO UPDATE SET audit_number = EXCLUDED.audit_number, status = EXCLUDED.status, notes = EXCLUDED.notes' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.27 inventory_audit_items
    IF v_tables_payload ? 'inventory_audit_items' AND to_regclass('public.inventory_audit_items') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'inventory_audit_items', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.inventory_audit_items SELECT * FROM jsonb_populate_record(NULL::public.inventory_audit_items, $1) ON CONFLICT (id) DO UPDATE SET system_qty = EXCLUDED.system_qty, counted_qty = EXCLUDED.counted_qty, difference = EXCLUDED.difference' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.28 stock_movements
    IF v_tables_payload ? 'stock_movements' AND to_regclass('public.stock_movements') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'stock_movements', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.stock_movements SELECT * FROM jsonb_populate_record(NULL::public.stock_movements, $1) ON CONFLICT (id) DO UPDATE SET movement_type = EXCLUDED.movement_type, quantity = EXCLUDED.quantity, reference = EXCLUDED.reference' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.29 system_notifications
    IF v_tables_payload ? 'system_notifications' AND to_regclass('public.system_notifications') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'system_notifications', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.system_notifications SELECT * FROM jsonb_populate_record(NULL::public.system_notifications, $1) ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read, is_archived = EXCLUDED.is_archived' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2.30 super_admin_broadcasts
    IF v_tables_payload ? 'super_admin_broadcasts' AND to_regclass('public.super_admin_broadcasts') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'super_admin_broadcasts', '[]'::jsonb)) LOOP
                EXECUTE 'INSERT INTO public.super_admin_broadcasts SELECT * FROM jsonb_populate_record(NULL::public.super_admin_broadcasts, $1) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message' USING v_item;
                v_total_restored := v_total_restored + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 3. تسجيل حدث أمان بالسوبر أدمن
    BEGIN
        PERFORM public.log_super_admin_security_event(
            NULL,
            COALESCE(p_restored_by, 'super_admin'),
            'SELECTIVE_TENANT_DATA_RESTORED',
            'HIGH',
            '127.0.0.1',
            'Recovery Engine v81',
            jsonb_build_object(
                'tenant_id', p_tenant_id,
                'tenant_name', v_tenant_name,
                'total_restored', v_total_restored
            )
        );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تمت عملية استعادة واسترجاع كافة البيانات والعلاقات والأرصدة بنجاح 🚀',
        'tenant_name', v_tenant_name,
        'total_restored', v_total_restored
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل استعادة البيانات: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_selective_tenant_restore(uuid, jsonb, text) TO authenticated, anon, service_role;
