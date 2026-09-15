-- =========================================================================
-- 🌟 MIGRATION V91: DYNAMIC PER-TENANT BACKUP & SECURE ENCRYPTION ENGINE 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-09-04
-- الإصدار: v91.0
-- الوصف: 
-- 1. دالة ديناميكية شاملة execute_tenant_dynamic_backup(p_tenant_id, p_preset)
--    تستخرج كافة جداول المنظومة الحالية والمستقبلية الخاصة بالمصنع بدون أي تثبيت مسبق
-- 2. دالة get_tenant_dynamic_tables_info(p_tenant_id) لجلب خريطة الجداول الحية وإحصائياتها
-- 3. تأكيد وتثبيت دالة get_tenant_backup_encryption_key(p_tenant_id) لضمان مفتاح 256-bit فريد لكل مصنع
-- =========================================================================

-- 1. التأكد من وجود عمود ومفاتيح التشفير لكل مصنع
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS backup_encryption_key text;

UPDATE public.tenants 
SET backup_encryption_key = encode(gen_random_bytes(32), 'hex') 
WHERE backup_encryption_key IS NULL OR backup_encryption_key = '';

-- 2. دالة جلب مفتاح تشفير المصنع المخصص والفريد 256-bit
CREATE OR REPLACE FUNCTION public.get_tenant_backup_encryption_key(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key text;
BEGIN
    SELECT backup_encryption_key INTO v_key
    FROM public.tenants
    WHERE id = p_tenant_id;
    
    IF v_key IS NULL OR v_key = '' THEN
        v_key := encode(gen_random_bytes(32), 'hex');
        UPDATE public.tenants
        SET backup_encryption_key = v_key
        WHERE id = p_tenant_id;
    END IF;

    RETURN v_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_backup_encryption_key(uuid) TO anon, authenticated, service_role;

-- 3. دالة استعلام خريطة وجداول المصنع ديناميكياً
CREATE OR REPLACE FUNCTION public.get_tenant_dynamic_tables_info(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table_rec record;
    v_has_tenant_id boolean;
    v_row_count bigint;
    v_result jsonb := '[]'::jsonb;
    v_excluded_tables text[] := ARRAY[
        'tenants', 
        'super_admin_broadcasts', 
        'super_admin_telegram_bots', 
        'super_admin_backups_log', 
        'super_admin_security_logs', 
        'tenant_scheduled_report_logs',
        'system_platform_settings', 
        'system_subscription_plans', 
        'subscription_plan_limits', 
        'subscription_comparison_features'
    ];
BEGIN
    FOR v_table_rec IN 
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
          AND t.table_name != ALL(v_excluded_tables)
        ORDER BY t.table_name
    LOOP
        -- التحقق هل الجدول يمتلك عمود tenant_id
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns c
            WHERE c.table_schema = 'public' 
              AND c.table_name = v_table_rec.table_name 
              AND c.column_name = 'tenant_id'
        ) INTO v_has_tenant_id;

        v_row_count := 0;

        BEGIN
            IF v_has_tenant_id THEN
                EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = %L', v_table_rec.table_name, p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name IN ('model_sizes', 'model_images', 'model_colors_inventory') THEN
                EXECUTE format('SELECT count(*) FROM public.%I WHERE model_id IN (SELECT id FROM public.models WHERE tenant_id = %L)', v_table_rec.table_name, p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'themes' THEN
                EXECUTE format('SELECT count(*) FROM public.themes WHERE is_system = true OR tenant_id = %L OR tenant_id IS NULL', p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'order_item_preparation' THEN
                EXECUTE format('SELECT count(*) FROM public.order_item_preparation WHERE order_item_id IN (SELECT id FROM public.order_items WHERE tenant_id = %L)', p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'preparation_status_log' THEN
                EXECUTE format('SELECT count(*) FROM public.preparation_status_log WHERE order_item_id IN (SELECT id FROM public.order_items WHERE tenant_id = %L)', p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'invoice_items' THEN
                EXECUTE format('SELECT count(*) FROM public.invoice_items WHERE invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id = %L)', p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'return_items' THEN
                EXECUTE format('SELECT count(*) FROM public.return_items WHERE return_id IN (SELECT id FROM public.returns WHERE tenant_id = %L)', p_tenant_id)
                INTO v_row_count;
            ELSIF v_table_rec.table_name = 'inventory_audit_items' THEN
                EXECUTE format('SELECT count(*) FROM public.inventory_audit_items WHERE audit_id IN (SELECT id FROM public.inventory_audits WHERE tenant_id = %L)', p_tenant_id)
                INTO v_row_count;
            ELSE
                -- أي جدول عام آخر بدون tenant_id
                EXECUTE format('SELECT count(*) FROM public.%I', v_table_rec.table_name)
                INTO v_row_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_row_count := 0;
        END;

        v_result := v_result || jsonb_build_object(
            'table_name', v_table_rec.table_name,
            'has_tenant_id', v_has_tenant_id,
            'row_count', v_row_count
        );
    END LOOP;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_dynamic_tables_info(uuid) TO anon, authenticated, service_role;

-- 4. المحرك الديناميكي الرئيسي للنسخ الاحتياطي الخاص بكل مصنع
CREATE OR REPLACE FUNCTION public.execute_tenant_dynamic_backup(
    p_tenant_id uuid,
    p_preset text DEFAULT 'full_system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_name text := 'المصنع';
    v_enc_key text;
    v_table_rec record;
    v_has_tenant_id boolean;
    v_tbl_data jsonb;
    v_tbl_count bigint;
    v_total_records bigint := 0;
    v_tables_count int := 0;
    v_tables_map jsonb := '{}'::jsonb;
    v_excluded_tables text[] := ARRAY[
        'tenants', 
        'super_admin_broadcasts', 
        'super_admin_telegram_bots', 
        'super_admin_backups_log', 
        'super_admin_security_logs', 
        'tenant_scheduled_report_logs',
        'system_platform_settings', 
        'system_subscription_plans', 
        'subscription_plan_limits', 
        'subscription_comparison_features'
    ];
    v_now_cairo timestamp;
    v_timestamp text;
    v_filename text;
BEGIN
    -- 1. جلب اسم المصنع ومفتاح التشفير الفريد المخصص له
    SELECT name, backup_encryption_key INTO v_tenant_name, v_enc_key
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_tenant_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'المصنع غير موجود بالمنظومة');
    END IF;

    IF v_enc_key IS NULL OR v_enc_key = '' THEN
        v_enc_key := public.get_tenant_backup_encryption_key(p_tenant_id);
    END IF;

    v_now_cairo := now() AT TIME ZONE 'Africa/Cairo';
    v_timestamp := to_char(v_now_cairo, 'YYYY-MM-DD_HH24-MI-SS');
    v_filename := 'backup_' || regexp_replace(v_tenant_name, '[\s/\\]+', '_', 'g') || '_' || p_preset || '_' || v_timestamp || '.json';

    -- 2. استخراج الجداول ديناميكياً بحسب الـ Preset
    FOR v_table_rec IN 
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
          AND t.table_name != ALL(v_excluded_tables)
          AND (
              -- إذا كانت نسخة شاملة: جلب كل الجداول بدون استثناء
              p_preset = 'full_system'
              -- أو تصفيات مخصصة بحسب الـ Preset المختار
              OR (p_preset = 'models_only' AND v_table_rec.table_name IN ('categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory'))
              OR (p_preset = 'models_colors' AND v_table_rec.table_name IN ('categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory'))
              OR (p_preset = 'models_colors_stock' AND v_table_rec.table_name IN ('categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory'))
              OR (p_preset = 'models_colors_stock_movements' AND v_table_rec.table_name IN ('categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory', 'stock_movements'))
              OR (p_preset = 'invoices_orders' AND v_table_rec.table_name IN ('invoices', 'invoice_items', 'inbound_invoices', 'inbound_invoice_items', 'orders', 'order_items', 'order_logs', 'returns', 'return_items'))
          )
        ORDER BY t.table_name
    LOOP
        -- فحص وجود عمود tenant_id
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns c
            WHERE c.table_schema = 'public' 
              AND c.table_name = v_table_rec.table_name 
              AND c.column_name = 'tenant_id'
        ) INTO v_has_tenant_id;

        v_tbl_data := '[]'::jsonb;
        v_tbl_count := 0;

        BEGIN
            IF v_has_tenant_id THEN
                -- جلب بيانات المصنع المحدد مباشرة
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.%I t WHERE t.tenant_id = %L', v_table_rec.table_name, p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name IN ('model_sizes', 'model_images', 'model_colors_inventory') THEN
                -- جداول تفاصيل الموديلات المرتبطة بـ model_id
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.%I t WHERE t.model_id IN (SELECT id FROM public.models WHERE tenant_id = %L)', v_table_rec.table_name, p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'themes' THEN
                -- المظاهر: مظهر المصنع بالإضافة للمظاهر العامة
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.themes t WHERE t.is_system = true OR t.tenant_id = %L OR t.tenant_id IS NULL', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'order_item_preparation' THEN
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.order_item_preparation t WHERE t.order_item_id IN (SELECT id FROM public.order_items WHERE tenant_id = %L)', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'preparation_status_log' THEN
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.preparation_status_log t WHERE t.order_item_id IN (SELECT id FROM public.order_items WHERE tenant_id = %L)', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'invoice_items' THEN
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.invoice_items t WHERE t.invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id = %L)', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'return_items' THEN
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.return_items t WHERE t.return_id IN (SELECT id FROM public.returns WHERE tenant_id = %L)', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSIF v_table_rec.table_name = 'inventory_audit_items' THEN
                EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) FROM public.inventory_audit_items t WHERE t.audit_id IN (SELECT id FROM public.inventory_audits WHERE tenant_id = %L)', p_tenant_id)
                INTO v_tbl_data, v_tbl_count;
            ELSE
                -- أي جدول غير مرتبط أو ليس لديه tenant_id: لا يتم إدراجه لحماية الخصوصية
                v_tbl_data := '[]'::jsonb;
                v_tbl_count := 0;
            END IF;

            v_tables_map := jsonb_set(v_tables_map, ARRAY[v_table_rec.table_name], v_tbl_data, true);
            v_total_records := v_total_records + COALESCE(v_tbl_count, 0);
            v_tables_count := v_tables_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_tables_map := jsonb_set(v_tables_map, ARRAY[v_table_rec.table_name], '[]'::jsonb, true);
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'tenant_name', v_tenant_name,
        'preset_id', p_preset,
        'filename', v_filename,
        'created_at', to_char(v_now_cairo, 'YYYY-MM-DD"T"HH24:MI:SS'),
        'total_records', v_total_records,
        'tables_count', v_tables_count,
        'tables', v_tables_map
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'فشل استخراج النسخة الاحتياطية للمصنع: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_tenant_dynamic_backup(uuid, text) TO anon, authenticated, service_role;
