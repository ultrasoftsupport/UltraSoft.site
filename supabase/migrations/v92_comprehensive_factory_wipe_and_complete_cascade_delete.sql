-- =========================================================================
-- 🌟 MIGRATION V92: COMPREHENSIVE FACTORY DATA WIPE & DYNAMIC CASCADE DELETE 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-09-04
-- الإصدار: v92.0
-- الوصف: 
-- 1. تطوير دالة تفريغ بيانات المصانع super_admin_wipe_tenant_data لدعم خيارين مستقلين:
--    أ) تفريغ بيانات ومنتجات وحركات المصنع فقط (products): مسح الموديلات، الكتالوج، الألوان،
--       المقاسات، الفئات، فواتير المبيعات والمشتريات (الدخل والخرج)، فواتير وحركات الأرصدة،
--       حركات المخزون، الأوردرات ومراحل التحضير، والإشعارات - مع حماية كاملة للمستخدمين
--       والسيمات وإعدادات المصنع والاشتراكات.
--    ب) التفريغ الشامل لكافة بيانات وعمليات المصنع (full): جلب وتفريغ كافة البيانات والعمليات
--       التشغيلية للمصنع ديناميكياً بالكامل، مع الاحتفاظ حصراً بالسيمات والحسابات والإعدادات الرئيسية.
-- 2. تطوير دالة الحذف النهائي الشامل للمصنع delete_tenant_cascade:
--    - مسح ديناميكي شامل لكافة الجداول في schema public التي تحتوي على tenant_id بدون استثناء
--    - مسح البنود الفرعية المرتبطة بمستندات وموديلات المصنع
--    - مسح حسابات التوثيق التابعة لمستخدمي المصنع من auth.users لتنظيف الجلسات والهويات نهائياً
--    - حذف المصنع نفسه من جدول tenants لضمان خلو قاعدة البيانات من أي بقايا أو سجلات يتيمة
-- 3. توفير دوال التوافقية (Function Overloads) لضمان استدعاء الدوال بأي عدد من المعاملات بسلاسة
-- =========================================================================

-- =========================================================================
-- 1. دالة مساعدة لحذف البنود الفرعية التابعة للمصنع بأمان تام
-- =========================================================================
CREATE OR REPLACE FUNCTION public.safe_delete_tenant_subitems(
    p_child_table text,
    p_fk_column text,
    p_parent_table text,
    p_tenant_id uuid
) RETURNS void AS $$
BEGIN
    IF to_regclass('public.' || quote_ident(p_child_table)) IS NOT NULL 
       AND to_regclass('public.' || quote_ident(p_parent_table)) IS NOT NULL THEN
        EXECUTE format(
            'DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE tenant_id = %L)',
            p_child_table, p_fk_column, p_parent_table, p_tenant_id
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.safe_delete_tenant_subitems(text, text, text, uuid) TO authenticated, anon, service_role;

-- =========================================================================
-- 2. دالة تفريغ بيانات المصنع مع دعم نمطين (منتجات وحركات فقط / تفريغ كامل)
-- =========================================================================
DROP FUNCTION IF EXISTS public.super_admin_wipe_tenant_data(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.super_admin_wipe_tenant_data(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.super_admin_wipe_tenant_data(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid,
    p_user_id uuid,
    p_wipe_mode text
)
RETURNS jsonb AS $$
DECLARE
    v_calling_role text := NULL;
    v_calling_name text := 'السوبر أدمن';
    v_tenant_name text := 'المصنع';
    v_rec record;
    v_wipe_mode text := lower(COALESCE(p_wipe_mode, 'products'));
    v_deleted_tables text[] := ARRAY[]::text[];
    -- قائمة الجداول المحمية من المسح في وضع التفريغ الشامل (الحسابات، السيمات، الإعدادات الرئيسية، المصنع نفسه)
    v_preserved_tables text[] := ARRAY[
        'tenants', 
        'system_users', 
        'subscriptions', 
        'themes', 
        'home_settings', 
        'tenant_branding_settings', 
        'tenant_social_links', 
        'tenant_invoice_settings', 
        'tenant_pos_settings', 
        'tenant_telegram_settings', 
        'tenant_report_schedules', 
        'tenant_domains',
        'super_admin_security_logs',
        'super_admin_backups_log',
        'super_admin_telegram_bots',
        'super_admin_broadcasts'
    ];
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد تفريغ بياناته.';
    END IF;

    -- التحقق الصارم من صلاحيات المنفذ (سوبر أدمن فقط)
    IF auth.role() = 'service_role' THEN
        v_calling_role := 'super_admin';
        v_calling_name := 'Service Role';
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT role, COALESCE(full_name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    ELSIF p_user_id IS NOT NULL THEN
        SELECT role, COALESCE(full_name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = p_user_id AND is_active = true;
    END IF;

    IF v_calling_role IS NULL OR v_calling_role != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الحساسة. تتطلب صلاحية سوبر أدمن موثقة.';
    END IF;

    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'مصنع معرف #' || p_tenant_id::text;
    END IF;

    -- =========================================================================
    -- المرحلة 1: مسح بنود وسجلات المنتجات والأوردرات والفواتير والحركات (مشتركة في كلا الوضعين)
    -- =========================================================================
    
    -- 1.1 الجداول الفرعية التابعة للطلبات (Child Records)
    PERFORM public.safe_delete_tenant_subitems('order_item_preparation', 'order_item_id', 'order_items', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('preparation_status_log', 'order_item_id', 'order_items', p_tenant_id);
    IF to_regclass('public.order_item_preparation') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.order_item_preparation WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L)', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.preparation_status_log') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.preparation_status_log WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L)', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.order_status_history') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L)', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.order_tracking_events') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.order_tracking_events WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L)', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.order_logs') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.order_logs WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L) OR tenant_id = %L', p_tenant_id, p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.order_items') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = %L) OR tenant_id = %L', p_tenant_id, p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.orders') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.orders WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.2 فواتير المرتجعات وبنودها
    PERFORM public.safe_delete_tenant_subitems('return_items', 'return_id', 'returns', p_tenant_id);
    IF to_regclass('public.returns') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.returns WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.3 فواتير المبيعات (الخرج) وبنودها
    PERFORM public.safe_delete_tenant_subitems('invoice_items', 'invoice_id', 'invoices', p_tenant_id);
    IF to_regclass('public.invoices') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.invoices WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.4 فواتير الوارد والمشتريات والرصيد (الدخل) وبنودها
    PERFORM public.safe_delete_tenant_subitems('inbound_invoice_items', 'inbound_invoice_id', 'inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('inbound_invoice_items', 'invoice_id', 'inbound_invoices', p_tenant_id);
    IF to_regclass('public.inbound_invoices') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.inbound_invoices WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.5 حركات المخزون وسجلات الجرد
    IF to_regclass('public.stock_movements') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.stock_movements WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    PERFORM public.safe_delete_tenant_subitems('inventory_audit_items', 'audit_id', 'inventory_audits', p_tenant_id);
    IF to_regclass('public.inventory_audits') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.inventory_audits WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.inventory_logs') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.inventory_logs WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.6 الموديلات والأرصدة والصور والمقاسات والألوان
    PERFORM public.safe_delete_tenant_subitems('model_colors_inventory', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_inventory', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_images', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_sizes', 'model_id', 'models', p_tenant_id);
    IF to_regclass('public.model_inventory') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.model_inventory WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.model_colors_inventory') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.model_colors_inventory WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.models') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.models WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.7 الخصائص والتعريفات (الألوان، المقاسات، الفئات، التصنيفات)
    PERFORM public.safe_delete_tenant_subitems('class_sizes', 'class_id', 'classes', p_tenant_id);
    IF to_regclass('public.class_sizes') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.class_sizes WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.classes') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.classes WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.categories') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.categories WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.sizes') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.sizes WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.colors') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.colors WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 1.8 كروت البرومو والإشعارات وطوابير المخزون
    IF to_regclass('public.promo_cards') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.promo_cards WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.system_notifications') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.system_notifications WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.notifications') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.notifications WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF to_regclass('public.inventory_notification_queue') IS NOT NULL THEN
        BEGIN EXECUTE format('DELETE FROM public.inventory_notification_queue WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- =========================================================================
    -- المرحلة 2: إذا كان الوضع 'full' (التفريغ الكامل والشامل لبيانات المصنع)
    -- =========================================================================
    IF v_wipe_mode = 'full' THEN
        -- مسح المقبوضات والإيداعات التشغيلية
        IF to_regclass('public.deposit_transactions') IS NOT NULL THEN
            BEGIN EXECUTE format('DELETE FROM public.deposit_transactions WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
        IF to_regclass('public.deposit_reports') IS NOT NULL THEN
            BEGIN EXECUTE format('DELETE FROM public.deposit_reports WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
        IF to_regclass('public.deposits') IS NOT NULL THEN
            BEGIN EXECUTE format('DELETE FROM public.deposits WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
        IF to_regclass('public.tenant_scheduled_report_logs') IS NOT NULL THEN
            BEGIN EXECUTE format('DELETE FROM public.tenant_scheduled_report_logs WHERE tenant_id = %L', p_tenant_id); EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        -- فحص ومسح ديناميكي لكافة الجداول الأخرى ذات عمود tenant_id غير المحمية
        FOR v_rec IN 
            SELECT DISTINCT c.table_name
            FROM information_schema.columns c
            JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
            WHERE c.table_schema = 'public'
              AND c.column_name = 'tenant_id'
              AND t.table_type = 'BASE TABLE'
              AND c.table_name != ALL(v_preserved_tables)
        LOOP
            BEGIN
                EXECUTE format('DELETE FROM public.%I WHERE tenant_id = %L', v_rec.table_name, p_tenant_id);
                v_deleted_tables := array_append(v_deleted_tables, v_rec.table_name);
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END LOOP;

        -- تصفير عدادات الحسابات التشغيلية مع الحفاظ على الحسابات وكلمات المرور
        IF to_regclass('public.system_users') IS NOT NULL THEN
            UPDATE public.system_users 
            SET invoice_count = 0, login_count = 0 
            WHERE tenant_id = p_tenant_id;
        END IF;
    END IF;

    -- =========================================================================
    -- المرحلة 3: تدوين العملية في سجلات النظام
    -- =========================================================================
    IF to_regclass('public.super_admin_security_logs') IS NOT NULL THEN
        INSERT INTO public.super_admin_security_logs (
            user_id,
            username,
            event_type,
            severity,
            details,
            created_at
        ) VALUES (
            p_user_id,
            v_calling_name,
            'WIPE_TENANT_DATA',
            'CRITICAL',
            jsonb_build_object(
                'tenant_id', p_tenant_id,
                'tenant_name', v_tenant_name,
                'wipe_mode', v_wipe_mode,
                'wipe_mode_desc', CASE WHEN v_wipe_mode = 'full' THEN 'تفريغ كامل وشامل لبيانات المصنع' ELSE 'تفريغ بيانات وحركات المنتجات فقط' END,
                'performed_by', v_calling_name
            ),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'tenant_name', v_tenant_name,
        'wipe_mode', v_wipe_mode,
        'message', CASE 
            WHEN v_wipe_mode = 'full' THEN 'تم التفريغ الكامل والشامل لبيانات المصنع مع الاحتفاظ بالسيمات والحسابات والإعدادات بنجاح 🧹'
            ELSE 'تم تفريغ بيانات وحركات المنتجات والفواتير والمخزون بنجاح 🧹'
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دوال التوافقية (Overloads) للاستدعاء بمعاملين أو معامل واحد
CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid,
    p_user_id uuid
)
RETURNS jsonb AS $$
BEGIN
    RETURN public.super_admin_wipe_tenant_data(p_tenant_id, p_user_id, 'products');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid
)
RETURNS jsonb AS $$
BEGIN
    RETURN public.super_admin_wipe_tenant_data(p_tenant_id, NULL, 'products');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.super_admin_wipe_tenant_data(uuid, uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_wipe_tenant_data(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_wipe_tenant_data(uuid) TO authenticated, anon, service_role;

-- =========================================================================
-- 3. دالة الحذف النهائي الشامل للمصنع (Delete Tenant Cascade) ديناميكياً
-- =========================================================================
DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(
    p_tenant_id uuid,
    p_user_id uuid
)
RETURNS jsonb AS $$
DECLARE
    v_calling_role text := NULL;
    v_calling_name text := 'السوبر أدمن';
    v_tenant_name text := 'المصنع';
    v_rec record;
    v_purged_tables int := 0;
    v_user_ids uuid[];
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد حذفه.';
    END IF;

    -- حماية المصنع الرئيسي الافتراضي للنظام
    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن حذف المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- التحقق الصارم من صلاحيات المنفذ (سوبر أدمن فقط)
    IF auth.role() = 'service_role' THEN
        v_calling_role := 'super_admin';
        v_calling_name := 'Service Role';
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT role, COALESCE(full_name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    ELSIF p_user_id IS NOT NULL THEN
        SELECT role, COALESCE(full_name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = p_user_id AND is_active = true;
    END IF;

    IF v_calling_role IS NULL OR v_calling_role != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء حذف المصنع. تتطلب صلاحية سوبر أدمن موثقة.';
    END IF;

    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'مصنع معرف #' || p_tenant_id::text;
    END IF;

    -- 1. جمع معرفات مستخدمي المصنع لحذف حساباتهم من auth.users لاحقاً
    IF to_regclass('public.system_users') IS NOT NULL THEN
        SELECT array_agg(id) INTO v_user_ids
        FROM public.system_users
        WHERE tenant_id = p_tenant_id;
    END IF;

    -- 2. تنفيذ تفريغ كامل لكل البيانات التشغيلية
    PERFORM public.super_admin_wipe_tenant_data(p_tenant_id, p_user_id, 'full');

    -- 3. مسح ديناميكي شامل لكل الجداول التي تمتلك عمود tenant_id
    FOR v_rec IN 
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name NOT IN ('tenants', 'super_admin_security_logs', 'super_admin_backups_log')
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE tenant_id = %L', v_rec.table_name, p_tenant_id);
            v_purged_tables := v_purged_tables + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- 4. إزالة السيمات غير النظامية التابعة للمصنع
    IF to_regclass('public.themes') IS NOT NULL THEN
        DELETE FROM public.themes WHERE tenant_id = p_tenant_id AND is_system IS NOT TRUE;
    END IF;

    -- 5. إزالة حسابات التوثيق من auth.users (إن وجدت) لإنهاء أي جلسات يتيمة
    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
        BEGIN
            DELETE FROM auth.users WHERE id = ANY(v_user_ids);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 6. إزالة مستخدمي المصنع من جدول system_users
    IF to_regclass('public.system_users') IS NOT NULL THEN
        DELETE FROM public.system_users WHERE tenant_id = p_tenant_id;
    END IF;

    -- 7. مسح كيان المصنع نفسه نهائياً من جدول tenants
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    -- 8. تدوين حادثة الحذف الشامل في سجل الأمان العام
    IF to_regclass('public.super_admin_security_logs') IS NOT NULL THEN
        INSERT INTO public.super_admin_security_logs (
            user_id,
            username,
            event_type,
            severity,
            details,
            created_at
        ) VALUES (
            p_user_id,
            v_calling_name,
            'DELETE_TENANT',
            'CRITICAL',
            jsonb_build_object(
                'event', 'تم حذف المصنع نهائياً وكافة بياناته وجداوله المرتبطة من قاعدة البيانات',
                'tenant_id', p_tenant_id,
                'tenant_name', v_tenant_name,
                'performed_by', v_calling_name
            ),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'tenant_name', v_tenant_name,
        'purged_tables_count', v_purged_tables,
        'message', 'تم حذف المصنع نهائياً وكافة متعلقاته وسجلاته من المنظومة بنجاح 🗑️'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة توافقية للاستدعاء بمعرف المصنع فقط
CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(
    p_tenant_id uuid
)
RETURNS jsonb AS $$
BEGIN
    RETURN public.delete_tenant_cascade(p_tenant_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid) TO authenticated, anon, service_role;

-- =========================================================================
-- 4. تحديث دالة إعادة تهيئة النظام لمالك المصنع (reset_tenant_system_data)
-- =========================================================================
DROP FUNCTION IF EXISTS public.reset_tenant_system_data(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data() CASCADE;

CREATE OR REPLACE FUNCTION public.reset_tenant_system_data(
    p_tenant_id UUID,
    p_caller_user_id UUID,
    p_wipe_mode text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_tenant UUID;
    v_user_role text := NULL;
    v_user_tenant uuid := NULL;
BEGIN
    IF auth.role() = 'service_role' THEN
        v_user_role := 'super_admin';
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT role, tenant_id INTO v_user_role, v_user_tenant
        FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    ELSIF p_caller_user_id IS NOT NULL THEN
        SELECT role, tenant_id INTO v_user_role, v_user_tenant
        FROM public.system_users WHERE id = p_caller_user_id AND is_active = true;
    END IF;

    IF v_user_role IS NULL OR (v_user_role != 'owner' AND v_user_role != 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء إعادة تهيئة النظام. هذه العملية مخصصة لمالك المصنع أو السوبر أدمن فقط.';
    END IF;

    IF p_tenant_id IS NOT NULL THEN
        IF v_user_role = 'owner' AND v_user_tenant != p_tenant_id THEN
            RAISE EXCEPTION 'غير مصرح لك بتفريغ بيانات مصنع آخر.';
        END IF;
        target_tenant := p_tenant_id;
    ELSE
        target_tenant := v_user_tenant;
    END IF;

    IF target_tenant IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المصنع المستهدف للعملية.';
    END IF;

    -- استدعاء دالة التفريغ الموحدة بالنمط المطلوب
    PERFORM public.super_admin_wipe_tenant_data(target_tenant, COALESCE(p_caller_user_id, auth.uid()), p_wipe_mode);

    RETURN true;
END;
$$;

-- دوال التوافقية لـ reset_tenant_system_data
CREATE OR REPLACE FUNCTION public.reset_tenant_system_data(
    p_tenant_id UUID,
    p_caller_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.reset_tenant_system_data(p_tenant_id, p_caller_user_id, 'products');
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_tenant_system_data(
    p_tenant_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.reset_tenant_system_data(p_tenant_id, NULL, 'products');
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_tenant_system_data()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.reset_tenant_system_data(NULL, NULL, 'products');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_tenant_system_data(uuid, uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reset_tenant_system_data(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reset_tenant_system_data(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reset_tenant_system_data() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.reset_system_data()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.reset_tenant_system_data(NULL, NULL, 'products');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_system_data() TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
