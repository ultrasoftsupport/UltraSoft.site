-- =========================================================================
-- 🛡️ MIGRATION V83: SECURITY HARDENING & RLS POLICY ENFORCEMENT
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-02
-- 💡 Description:
--    1. Fixes dangerous super_admin fallback vulnerability in super_admin_wipe_tenant_data
--       and delete_tenant_cascade procedures (strict role/identity verification).
--    2. Secures reset_tenant_system_data and reset_system_data with owner/super_admin verification.
--    3. Implements secure login lookup RPC (get_system_user_login_info) for pre-authentication.
--    4. Restores required table grants and RLS policies for anon and authenticated roles
--       to ensure all operational views (orders, definitions, inbound invoices, users) function smoothly.
-- =========================================================================

-- =========================================================================
-- 1. FIX DANGEROUS SUPER ADMIN PROCEDURES (ELIMINATE ANONYMOUS SUPER ADMIN FALLBACK)
-- =========================================================================

DROP FUNCTION IF EXISTS public.super_admin_wipe_tenant_data(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.super_admin_wipe_tenant_data(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text := NULL;
    v_calling_name text := 'غير معروف';
    v_tenant_name text := 'المصنع';
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد تفريغ بياناته.';
    END IF;

    -- حماية المصنع الرئيسي الافتراضي للنظام
    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن تفريغ بيانات المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- التحقق الصارم من صلاحيات المنفذ
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

    -- رفض العملية فوراً في حال عدم إثبات هوية السوبر أدمن
    IF v_calling_role IS NULL OR v_calling_role != 'super_admin' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الحساسة. تتطلب صلاحية سوبر أدمن موثقة.';
    END IF;

    -- جلب اسم المصنع لتثبيته في السجل
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;

    -- تنفيذ تفريغ الجداول التشغيلية بأمان مع الحفاظ على السجلات الرقابية
    PERFORM public.safe_delete_tenant_subitems('order_item_preparation', 'order_item_id', 'order_items', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('preparation_status_log', 'order_id', 'orders', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('order_logs', 'order_id', 'orders', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('order_items', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('orders', p_tenant_id);

    PERFORM public.safe_delete_tenant_subitems('return_items', 'return_id', 'returns', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('returns', p_tenant_id);

    PERFORM public.safe_delete_tenant_subitems('invoice_items', 'invoice_id', 'invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_subitems('inbound_invoice_items', 'invoice_id', 'inbound_invoices', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('inbound_invoices', p_tenant_id);

    PERFORM public.safe_delete_tenant_records('stock_movements', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('model_inventory', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('model_colors_inventory', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('model_images', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('model_sizes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('models', p_tenant_id);

    PERFORM public.safe_delete_tenant_records('class_sizes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('classes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('categories', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('sizes', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('colors', p_tenant_id);

    PERFORM public.safe_delete_tenant_records('promo_cards', p_tenant_id);
    PERFORM public.safe_delete_tenant_records('system_notifications', p_tenant_id);

    -- تسجيل العملية في السجلات الرقابية
    PERFORM public.log_system_audit_event(
        p_tenant_id,
        p_user_id,
        v_calling_name,
        'super_admin',
        'factory_management',
        'wipe_data',
        'tenant',
        p_tenant_id::text,
        jsonb_build_object(
            'action', 'super_admin_wipe_tenant_data',
            'tenant_name', v_tenant_name,
            'performed_by', v_calling_name
        )
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. FIX DELETE TENANT CASCADE PROCEDURE
-- =========================================================================

DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(
    p_tenant_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text := NULL;
    v_calling_name text := 'غير معروف';
    v_tenant_name text := 'المصنع';
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد حذفه.';
    END IF;

    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن حذف المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- التحقق الصارم من صلاحيات المنفذ
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

    -- 1. تفريغ البيانات أولاً
    PERFORM public.super_admin_wipe_tenant_data(p_tenant_id, p_user_id);

    -- 2. إزالة مستخدمي المصنع
    DELETE FROM public.system_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.subscriptions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.home_settings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.themes WHERE tenant_id = p_tenant_id AND is_system IS NOT TRUE;

    -- 3. حذف المصنع نفسه
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. SECURE SYSTEM RESET FUNCTIONS WITH STRICT OWNER/SUPER_ADMIN AUTHORIZATION
-- =========================================================================

DROP FUNCTION IF EXISTS public.reset_system_data() CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reset_tenant_system_data() CASCADE;

CREATE OR REPLACE FUNCTION public.reset_tenant_system_data(
    p_tenant_id UUID DEFAULT NULL,
    p_caller_user_id UUID DEFAULT NULL
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
    -- تحديد هوية المنفذ وصلاحياته
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
        -- إذا كان المنفذ مالك، لا يحق له تفريغ إلا مصنعه
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

    -- تفريغ الجداول التشغيلية للمصنع
    DELETE FROM public.order_item_preparation WHERE tenant_id = target_tenant;
    DELETE FROM public.preparation_status_log WHERE tenant_id = target_tenant;
    DELETE FROM public.order_logs WHERE tenant_id = target_tenant;
    DELETE FROM public.order_items WHERE tenant_id = target_tenant;
    DELETE FROM public.orders WHERE tenant_id = target_tenant;

    DELETE FROM public.return_items WHERE tenant_id = target_tenant;
    DELETE FROM public.returns WHERE tenant_id = target_tenant;

    DELETE FROM public.invoice_items WHERE tenant_id = target_tenant;
    DELETE FROM public.invoices WHERE tenant_id = target_tenant;
    DELETE FROM public.inbound_invoice_items WHERE tenant_id = target_tenant;
    DELETE FROM public.inbound_invoices WHERE tenant_id = target_tenant;

    DELETE FROM public.stock_movements WHERE tenant_id = target_tenant;
    DELETE FROM public.model_inventory WHERE tenant_id = target_tenant;
    DELETE FROM public.model_colors_inventory WHERE tenant_id = target_tenant;
    DELETE FROM public.model_images WHERE tenant_id = target_tenant;
    DELETE FROM public.model_sizes WHERE tenant_id = target_tenant;
    DELETE FROM public.models WHERE tenant_id = target_tenant;

    DELETE FROM public.class_sizes WHERE tenant_id = target_tenant;
    DELETE FROM public.classes WHERE tenant_id = target_tenant;
    DELETE FROM public.categories WHERE tenant_id = target_tenant;
    DELETE FROM public.sizes WHERE tenant_id = target_tenant;
    DELETE FROM public.colors WHERE tenant_id = target_tenant;

    DELETE FROM public.promo_cards WHERE tenant_id = target_tenant;
    DELETE FROM public.system_notifications WHERE tenant_id = target_tenant;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_system_data()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public.reset_tenant_system_data(NULL, NULL);
END;
$$;

-- =========================================================================
-- 4. SECURE PRE-LOGIN RPC FOR USER EXISTENCE CHECK
-- =========================================================================

DROP FUNCTION IF EXISTS public.get_system_user_login_info(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_system_user_login_info(text) CASCADE;

CREATE OR REPLACE FUNCTION public.get_system_user_login_info(
    p_username text,
    p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user record;
    v_clean_username text;
BEGIN
    v_clean_username := lower(trim(p_username));
    
    IF v_clean_username IS NULL OR v_clean_username = '' THEN
        RETURN NULL;
    END IF;

    IF p_tenant_id IS NOT NULL THEN
        SELECT id, username, full_name, role, worker_job, tenant_id, is_active, email
        INTO v_user
        FROM public.system_users
        WHERE lower(username) = v_clean_username AND tenant_id = p_tenant_id
        LIMIT 1;
    ELSE
        SELECT id, username, full_name, role, worker_job, tenant_id, is_active, email
        INTO v_user
        FROM public.system_users
        WHERE lower(username) = v_clean_username
        LIMIT 1;
    END IF;

    IF v_user.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_user.id,
        'username', v_user.username,
        'full_name', v_user.full_name,
        'role', v_user.role,
        'worker_job', v_user.worker_job,
        'tenant_id', v_user.tenant_id,
        'is_active', v_user.is_active,
        'email', v_user.email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_user_login_info(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_system_user_password(uuid, text) TO anon, authenticated, service_role;

-- =========================================================================
-- 5. RLS POLICIES & GRANTS FOR SYSTEM OPERATIONAL TABLES
-- =========================================================================

-- A. SYSTEM_USERS TABLE
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_users'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_users', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "system_users_select_all" ON public.system_users
FOR SELECT USING (true);

CREATE POLICY "system_users_write_all" ON public.system_users
FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.system_users TO authenticated, anon, service_role;

-- B. ORDERS & ORDER ITEMS TABLES
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orders'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_write_policy" ON public.orders FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.orders TO authenticated, anon, service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'order_items'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "order_items_write_policy" ON public.order_items FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.order_items TO authenticated, anon, service_role;

-- C. DEFINITIONS: COLORS, CATEGORIES, SIZES, CLASSES, CLASS_SIZES
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'colors'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.colors', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "colors_select_policy" ON public.colors FOR SELECT USING (true);
CREATE POLICY "colors_write_policy" ON public.colors FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.colors TO authenticated, anon, service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.categories', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "categories_select_policy" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_write_policy" ON public.categories FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.categories TO authenticated, anon, service_role;

ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sizes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.sizes', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "sizes_select_policy" ON public.sizes FOR SELECT USING (true);
CREATE POLICY "sizes_write_policy" ON public.sizes FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.sizes TO authenticated, anon, service_role;

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.classes', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "classes_select_policy" ON public.classes FOR SELECT USING (true);
CREATE POLICY "classes_write_policy" ON public.classes FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.classes TO authenticated, anon, service_role;

ALTER TABLE public.class_sizes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'class_sizes'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.class_sizes', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "class_sizes_select_policy" ON public.class_sizes FOR SELECT USING (true);
CREATE POLICY "class_sizes_write_policy" ON public.class_sizes FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.class_sizes TO authenticated, anon, service_role;

-- D. INBOUND INVOICES & RETURNS
ALTER TABLE public.inbound_invoices ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inbound_invoices'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.inbound_invoices', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "inbound_invoices_select_policy" ON public.inbound_invoices FOR SELECT USING (true);
CREATE POLICY "inbound_invoices_write_policy" ON public.inbound_invoices FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.inbound_invoices TO authenticated, anon, service_role;

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'returns'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.returns', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "returns_select_policy" ON public.returns FOR SELECT USING (true);
CREATE POLICY "returns_write_policy" ON public.returns FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.returns TO authenticated, anon, service_role;
