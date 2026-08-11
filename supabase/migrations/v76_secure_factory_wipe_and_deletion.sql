-- =========================================================================
-- 🛡️ MIGRATION V76: SECURE FACTORY DATA WIPE & DELETION ENGINE
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-09
-- الإصدار: v76.2
-- الوصف:
-- 1. تحديث دالة super_admin_wipe_tenant_data ودالة delete_tenant_cascade:
--    - حماية وحفظ كامل سجلات النظام (system_audit_logs) وسجلات استهلاك الكريديتس (excel_credits_log) وعدم مسحها نهائياً.
--    - تدوين حادثة إعادة الهيكلة / الحذف في السجل بصورة آلية وثابته.
-- 2. تعديل قيد الربط لـ system_audit_logs ليكون ON DELETE SET NULL لحفظ السجل التاريخي للنظام دون فقدان.
-- =========================================================================

-- تعديل قيد الربط لمنع الحذف التلقائي لسجلات النظام
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'system_audit_logs_tenant_id_fkey'
    ) THEN
        ALTER TABLE public.system_audit_logs DROP CONSTRAINT system_audit_logs_tenant_id_fkey;
        ALTER TABLE public.system_audit_logs 
            ADD CONSTRAINT system_audit_logs_tenant_id_fkey 
            FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
    END IF;
END $$;

-- دالة مساعدة لحذف البيانات من أي جدول تشغيلي بشكل آمن
CREATE OR REPLACE FUNCTION public.safe_delete_tenant_records(
    p_table_name text,
    p_tenant_id uuid
) RETURNS void AS $$
BEGIN
    -- استثناء سجلات المراجعة والكريديتس وحمايتها من المسح نهائياً
    IF p_table_name IN ('system_audit_logs', 'excel_credits_log', 'super_admin_security_logs', 'super_admin_backups_log') THEN
        RETURN;
    END IF;

    IF to_regclass('public.' || quote_ident(p_table_name)) IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = %L', p_table_name, p_tenant_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة مساعدة لحذف البنود الفرعية التابعة لمستندات المصنع
CREATE OR REPLACE FUNCTION public.safe_delete_tenant_subitems(
    p_child_table text,
    p_fk_column text,
    p_parent_table text,
    p_tenant_id uuid
) RETURNS void AS $$
BEGIN
    IF to_regclass('public.' || quote_ident(p_child_table)) IS NOT NULL AND to_regclass('public.' || quote_ident(p_parent_table)) IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE tenant_id = %L)', p_child_table, p_fk_column, p_parent_table, p_tenant_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. 🧹 Super Admin Tenant Data Wipe Procedure
CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text;
    v_calling_name text := 'السوبر أدمن';
    v_tenant_name text := 'المصنع';
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد تفريغ بياناته.';
    END IF;

    -- تجنيب المصنع الرئيسي الافتراضي للنظام
    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن تفريغ بيانات المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- جلب اسم المصنع لتثبيته في السجل
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;

    -- التحقق من صلاحيات المنفذ (السوبر أدمن)
    IF auth.uid() IS NOT NULL THEN
        SELECT role, COALESCE(name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    ELSIF p_user_id IS NOT NULL THEN
        SELECT role, COALESCE(name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = p_user_id AND is_active = true;
    ELSE
        v_calling_role := 'super_admin';
    END IF;

    IF v_calling_role IS NOT NULL AND v_calling_role != 'super_admin' AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الخطيرة.';
    END IF;

    -- أ) مسح سجلات الطلبات التشغيلية وبنودها
    PERFORM public.safe_delete_tenant_subitems('order_items', 'order_id', 'orders', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('order_logs', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('orders', p_tenant_id);

    -- ب) مسح الفواتير والمستندات المالية والإيداعات التشغيلية
    PERFORM public.safe_delete_tenant_records('invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('returns', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('inbound_invoice_items', 'inbound_invoice_id', 'inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposit_transactions', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposit_reports', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposits', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('stock_movements', p_tenant_id);

    -- ج) مسح الموديلات والمخزون والألوان والمقاسات
    PERFORM public.safe_delete_tenant_records('inventory_logs', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_images', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_inventory', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_sizes', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_colors', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('models', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('categories', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('sizes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('colors', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('classes', p_tenant_id);

    -- د) مسح الإشعارات وكروت البرومو
    PERFORM public.safe_delete_tenant_records('promo_cards', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('notifications', p_tenant_id);

    -- هـ) إعادة تصفير إحصائيات مستخدمي هذا المصنع دون مسحهم
    IF to_regclass('public.system_users') IS NOT NULL THEN
        UPDATE public.system_users 
        SET invoice_count = 0, login_count = 0 
        WHERE tenant_id = p_tenant_id;
    END IF;

    -- و) 🛑 تدوين العملية في سجلات النظام وسجل الكريديتس دون مسح أي سجلات سابقة!
    IF to_regclass('public.system_audit_logs') IS NOT NULL THEN
        INSERT INTO public.system_audit_logs (
            tenant_id,
            user_id,
            user_name,
            user_role,
            module,
            action_type,
            entity_type,
            entity_id,
            details
        ) VALUES (
            p_tenant_id,
            COALESCE(p_user_id, auth.uid()),
            COALESCE(v_calling_name, 'السوبر أدمن'),
            'super_admin',
            'security',
            'wipe_data',
            'tenant',
            p_tenant_id::text,
            jsonb_build_object(
                'event', 'تم إعادة تهيئة وتفريغ جميع البيانات التشغيلية للمصنع مع الحفاظ على سجل النظام والكريديتس',
                'tenant_name', COALESCE(v_tenant_name, p_tenant_id::text),
                'timestamp', NOW()
            )
        );
    END IF;

    IF to_regclass('public.excel_credits_log') IS NOT NULL THEN
        INSERT INTO public.excel_credits_log (
            tenant_id,
            user_id,
            user_name,
            operation_type,
            location_name,
            credits_deducted,
            items_count,
            pricing_mode,
            remaining_balance_after
        ) VALUES (
            p_tenant_id,
            COALESCE(p_user_id, auth.uid()),
            COALESCE(v_calling_name, 'السوبر أدمن'),
            'wipe_tenant_data',
            'إعادة تهيئة بيانات المصنع وتصفير التشغيل',
            0,
            0,
            'system_action',
            0
        );
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 🗑️ Super Admin Cascade Delete Tenant Procedure
CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text;
    v_calling_name text := 'السوبر أدمن';
    v_tenant_name text := 'المصنع';
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد حذفه.';
    END IF;

    -- تجنيب المصنع الرئيسي الافتراضي للنظام
    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن حذف المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- جلب اسم المصنع لتثبيته في السجل قبل الحذف
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;

    -- التحقق من صلاحيات المنفذ (السوبر أدمن)
    IF auth.uid() IS NOT NULL THEN
        SELECT role, COALESCE(name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    ELSIF p_user_id IS NOT NULL THEN
        SELECT role, COALESCE(name, username) INTO v_calling_role, v_calling_name
        FROM public.system_users
        WHERE id = p_user_id AND is_active = true;
    ELSE
        v_calling_role := 'super_admin';
    END IF;

    IF v_calling_role IS NOT NULL AND v_calling_role != 'super_admin' AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الخطيرة.';
    END IF;

    -- أ) 🛑 تدوين حادثة الحذف نهائياً في سجلات النظام وسجل الكريديتس قبل حذف الكيان
    IF to_regclass('public.system_audit_logs') IS NOT NULL THEN
        INSERT INTO public.system_audit_logs (
            tenant_id,
            user_id,
            user_name,
            user_role,
            module,
            action_type,
            entity_type,
            entity_id,
            details
        ) VALUES (
            p_tenant_id,
            COALESCE(p_user_id, auth.uid()),
            COALESCE(v_calling_name, 'السوبر أدمن'),
            'super_admin',
            'security',
            'delete_tenant',
            'tenant',
            p_tenant_id::text,
            jsonb_build_object(
                'event', 'تم حذف المصنع نهائياً من المنظومة مع الحفاظ على سجل المراجعة التاريخي والكريديتس',
                'tenant_name', COALESCE(v_tenant_name, p_tenant_id::text),
                'timestamp', NOW()
            )
        );
    END IF;

    IF to_regclass('public.excel_credits_log') IS NOT NULL THEN
        INSERT INTO public.excel_credits_log (
            tenant_id,
            user_id,
            user_name,
            operation_type,
            location_name,
            credits_deducted,
            items_count,
            pricing_mode,
            remaining_balance_after
        ) VALUES (
            p_tenant_id,
            COALESCE(p_user_id, auth.uid()),
            COALESCE(v_calling_name, 'السوبر أدمن'),
            'delete_tenant',
            'حذف المصنع نهائياً من المنظومة',
            0,
            0,
            'system_action',
            0
        );
    END IF;

    -- ب) مسح سجلات الطلبات التشغيلية وبنودها
    PERFORM public.safe_delete_tenant_subitems('order_items', 'order_id', 'orders', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('order_logs', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('orders', p_tenant_id);

    -- ج) مسح الفواتير والمستندات المالية والإيداعات والحركات
    PERFORM public.safe_delete_tenant_records('invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('returns', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('inbound_invoice_items', 'inbound_invoice_id', 'inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposit_transactions', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposit_reports', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('deposits', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('stock_movements', p_tenant_id);

    -- د) مسح الموديلات والمخزون والصور والألوان والمقاسات والفئات
    PERFORM public.safe_delete_tenant_records('inventory_logs', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_images', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_inventory', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_sizes', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('model_colors', 'model_id', 'models', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('models', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('categories', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('sizes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('colors', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('classes', p_tenant_id);

    -- هـ) مسح الإشعارات والبرومو والإعدادات والنطاقات والمستخدمين والاشتراكات
    PERFORM public.safe_delete_tenant_records('promo_cards', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('notifications', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('home_settings', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('tenant_domains', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('system_users', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('subscriptions', p_tenant_id);

    -- و) حذف سجل المصنع نفسه نهائياً من جدول tenants (مع احتفاظ system_audit_logs و excel_credits_log بالسجلات الموثقة)
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- منح الصلاحيات للاستدعاء من المستخدِمين المعرفين
GRANT EXECUTE ON FUNCTION public.safe_delete_tenant_records(text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_tenant_subitems(text, text, text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_wipe_tenant_data(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant_cascade(uuid, uuid) TO authenticated, anon;
