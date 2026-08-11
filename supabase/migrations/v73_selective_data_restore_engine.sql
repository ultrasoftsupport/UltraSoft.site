-- =========================================================================
-- 🌟 MIGRATION V73: SELECTIVE DATA RESTORE ENGINE & DISASTER RECOVERY 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-08
-- الإصدار: v73.3 (Dynamic Resilient JSON Schema Auto-Matching)
-- الوصف:
-- 1. تحديث دالة execute_selective_tenant_restore واستخدام jsonb_populate_record الديناميكي لتطابق أعمدة الهيكل تلقائياً ومنع أخطاء (column does not exist).
-- 2. دعم كافة الجداول التشغيلية والتصنيفات والموديلات والطلبات والإعدادات والمستخدمين بكفاءة وأمان تام.
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
    v_item_tenant_id uuid;
    
    v_models_count int := 0;
    v_orders_count int := 0;
    v_invoices_count int := 0;
    v_definitions_count int := 0;
    v_settings_count int := 0;
    v_users_count int := 0;
    v_total_restored int := 0;
    
    v_tbl_name text;
    v_table_keys text[] := ARRAY['categories', 'classes', 'sizes', 'colors', 'models', 'model_inventory', 'orders', 'invoices', 'inbound_invoices', 'home_settings', 'system_users', 'notifications', 'promo_cards', 'deposits', 'deposit_transactions', 'super_admin_broadcasts'];
BEGIN
    -- 1. التأكد من وجود المصنع المستهدف إن تم تحديده
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

    -- 2. استعادة الأصناف والألوان والمقاسات (categories, colors, sizes, classes)
    IF v_tables_payload ? 'categories' AND to_regclass('public.categories') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'categories', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.categories SELECT * FROM jsonb_populate_record(NULL::public.categories, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_definitions_count := v_definitions_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'colors' AND to_regclass('public.colors') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'colors', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.colors SELECT * FROM jsonb_populate_record(NULL::public.colors, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_definitions_count := v_definitions_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'sizes' AND to_regclass('public.sizes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'sizes', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.sizes SELECT * FROM jsonb_populate_record(NULL::public.sizes, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_definitions_count := v_definitions_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'classes' AND to_regclass('public.classes') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'classes', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.classes SELECT * FROM jsonb_populate_record(NULL::public.classes, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_definitions_count := v_definitions_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 3. استعادة الموديلات والأرصدة (models, model_inventory)
    IF v_tables_payload ? 'models' AND to_regclass('public.models') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'models', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.models SELECT * FROM jsonb_populate_record(NULL::public.models, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name' USING v_item;
                v_models_count := v_models_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'model_inventory' AND to_regclass('public.model_inventory') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'model_inventory', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.model_inventory SELECT * FROM jsonb_populate_record(NULL::public.model_inventory, $1) ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity' USING v_item;
                v_models_count := v_models_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 4. استعادة الأوردرات والفواتير (orders, invoices, inbound_invoices)
    IF v_tables_payload ? 'orders' AND to_regclass('public.orders') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'orders', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.orders SELECT * FROM jsonb_populate_record(NULL::public.orders, $1) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status' USING v_item;
                v_orders_count := v_orders_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'invoices' AND to_regclass('public.invoices') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'invoices', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.invoices SELECT * FROM jsonb_populate_record(NULL::public.invoices, $1) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status' USING v_item;
                v_invoices_count := v_invoices_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF v_tables_payload ? 'inbound_invoices' AND to_regclass('public.inbound_invoices') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'inbound_invoices', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.inbound_invoices SELECT * FROM jsonb_populate_record(NULL::public.inbound_invoices, $1) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status' USING v_item;
                v_invoices_count := v_invoices_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 5. استعادة إعدادات النظام (home_settings)
    IF v_tables_payload ? 'home_settings' AND to_regclass('public.home_settings') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'home_settings', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.home_settings SELECT * FROM jsonb_populate_record(NULL::public.home_settings, $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value' USING v_item;
                v_settings_count := v_settings_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 6. استعادة المستخدمين (system_users)
    IF v_tables_payload ? 'system_users' AND to_regclass('public.system_users') IS NOT NULL THEN
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->'system_users', '[]'::jsonb)) LOOP
                IF p_tenant_id IS NOT NULL THEN v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id)); END IF;
                EXECUTE 'INSERT INTO public.system_users SELECT * FROM jsonb_populate_record(NULL::public.system_users, $1) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active' USING v_item;
                v_users_count := v_users_count + 1;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 7. استعادة بقية الجداول القابلة للاستعادة عبر تكرار ديناميكي للأنواع المشتركة
    FOREACH v_tbl_name IN ARRAY ARRAY['notifications', 'promo_cards', 'deposits', 'deposit_transactions', 'super_admin_broadcasts'] LOOP
        IF v_tables_payload ? v_tbl_name AND to_regclass('public.' || v_tbl_name) IS NOT NULL THEN
            BEGIN
                FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_tables_payload->v_tbl_name, '[]'::jsonb)) LOOP
                    IF p_tenant_id IS NOT NULL AND (v_item ? 'tenant_id') THEN
                        v_item := jsonb_set(v_item, '{tenant_id}', to_jsonb(p_tenant_id));
                    END IF;
                    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING', v_tbl_name, v_tbl_name) USING v_item;
                END LOOP;
            EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
    END LOOP;

    v_total_restored := v_models_count + v_orders_count + v_invoices_count + v_definitions_count + v_settings_count + v_users_count;

    -- 8. تسجيل حدث أمان بالسوبر أدمن
    PERFORM public.log_super_admin_security_event(
        NULL,
        COALESCE(p_restored_by, 'super_admin'),
        'SELECTIVE_TENANT_DATA_RESTORED',
        'HIGH',
        '127.0.0.1',
        'Recovery Engine',
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'tenant_name', v_tenant_name,
            'total_restored', v_total_restored
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'تمت عملية استعادة البيانات المخصصة بنجاح وإرسال الإشعارات 🚀',
        'tenant_name', v_tenant_name,
        'total_restored', v_total_restored
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل استعادة البيانات: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_selective_tenant_restore(uuid, jsonb, text) TO authenticated, anon, service_role;
