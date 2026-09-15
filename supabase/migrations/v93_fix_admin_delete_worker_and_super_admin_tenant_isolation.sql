-- =========================================================================
-- 🚀 MIGRATION V93: FIX ADMIN DELETE WORKER & SUPER ADMIN TENANT ISOLATION
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-04
-- 💡 Description: 
--    1. عزل حساب السوبر أدمن بالكامل عن المصنع الرئيسي أو أي مصنع آخر بجعل tenant_id = NULL
--    2. إصلاح وترقية دالة admin_delete_worker لدعم p_caller_id ورفع قيود auth.uid() المباشرة
--       لمنع خطأ 400 Bad Request عند الحذف بواسطة جلسة النظام
--    3. تنظيف أي ارتباطات خارجية (Foreign Keys) للمستخدم المحذوف بأمان قبل إتمام الحذف
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. عزل حسابات السوبر أدمن (Super Admin) لتكون حسابات منصة عامة بدون تبعية لأي مصنع
-- -------------------------------------------------------------------------
UPDATE public.system_users 
SET tenant_id = NULL 
WHERE role = 'super_admin';

-- -------------------------------------------------------------------------
-- 2. ترقية دالة حذف الموظف/المشرف admin_delete_worker بصلاحيات مرنة وآمنة
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_delete_worker(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_worker(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.admin_delete_worker(
    p_user_id uuid,
    p_caller_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text := NULL;
    v_calling_tenant_id uuid := NULL;
    v_target_role text := NULL;
    v_target_tenant_id uuid := NULL;
    v_target_username text := NULL;
BEGIN
    -- أ) التحقق من هوية وصلاحية المنفذ
    IF auth.role() = 'service_role' THEN
        v_calling_role := 'super_admin';
    ELSIF auth.uid() IS NOT NULL THEN
        SELECT role, tenant_id INTO v_calling_role, v_calling_tenant_id
        FROM public.system_users
        WHERE id = auth.uid() AND is_active = true;
    END IF;

    -- الاعتماد على p_caller_id في حال عدم توفر auth.uid() عبر جلسة التوثيق المحلية
    IF v_calling_role IS NULL AND p_caller_id IS NOT NULL THEN
        SELECT role, tenant_id INTO v_calling_role, v_calling_tenant_id
        FROM public.system_users
        WHERE id = p_caller_id AND is_active = true;
    END IF;

    -- في حال عدم التحقق من هوية المنفذ
    IF v_calling_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. يرجى تسجيل الدخول بحساب مالك المصنع أو السوبر أدمن.';
    END IF;

    -- التحقق من امتلاك المنفذ لصلاحية كافية (مالك أو سوبر أدمن أو مشرف)
    IF v_calling_role NOT IN ('owner', 'super_admin', 'admin') THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمالك فقط.';
    END IF;

    -- ب) جلب بيانات المستخدم المطلوب حذفه
    SELECT role, tenant_id, username INTO v_target_role, v_target_tenant_id, v_target_username
    FROM public.system_users
    WHERE id = p_user_id;

    IF v_target_role IS NULL THEN
        -- المستخدم غير موجود في system_users، نتأكد من تنظيفه من auth.users إن وُجد
        DELETE FROM auth.identities WHERE user_id = p_user_id;
        DELETE FROM auth.users WHERE id = p_user_id;
        RETURN true;
    END IF;

    -- جـ) ضوابط الأمان الصارمة للحذف
    -- 1. منع حذف حساب السوبر أدمن نهائياً من داخل إدارة المصنع
    IF v_target_role = 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن حذف حساب السوبر أدمن.';
    END IF;

    -- 2. منع المستخدم من حذف حسابه الشخصي
    IF (auth.uid() IS NOT NULL AND p_user_id = auth.uid()) 
       OR (p_caller_id IS NOT NULL AND p_user_id = p_caller_id) THEN
        RAISE EXCEPTION 'لا يمكنك حذف حسابك الشخصي.';
    END IF;

    -- 3. منع حذف حساب المالك إلا بواسطة السوبر أدمن
    IF v_target_role = 'owner' AND v_calling_role != 'super_admin' THEN
        RAISE EXCEPTION 'غير مسموح بحذف حساب مالك المصنع.';
    END IF;

    -- 4. منع المشرف (Admin) من حذف مالك أو مشرف آخر
    IF v_calling_role = 'admin' AND v_target_role IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'المشرف يمكنه فقط إدارة وحذف حسابات العمال.';
    END IF;

    -- 5. التحقق من العزل الصارم بين المصانع (Tenant Isolation)
    IF v_calling_role != 'super_admin' THEN
        IF v_calling_tenant_id IS NOT NULL AND v_target_tenant_id IS NOT NULL 
           AND v_calling_tenant_id != v_target_tenant_id THEN
            RAISE EXCEPTION 'غير مصرح لك بحذف مستخدم يتبع مصنعاً آخر.';
        END IF;
    END IF;

    -- د) فك الارتباطات الخارجية بأمان لتفادي أخطاء قيود المفاتيح الأجنبية (Foreign Key Violations)
    IF to_regclass('public.orders') IS NOT NULL THEN
        UPDATE public.orders SET assigned_worker_id = NULL WHERE assigned_worker_id = p_user_id;
    END IF;

    IF to_regclass('public.tenant_settings') IS NOT NULL THEN
        UPDATE public.tenant_settings SET updated_by = NULL WHERE updated_by = p_user_id;
    END IF;

    IF to_regclass('public.super_admin_telegram_bots') IS NOT NULL THEN
        UPDATE public.super_admin_telegram_bots SET updated_by = NULL WHERE updated_by = p_user_id;
    END IF;

    IF to_regclass('public.platform_settings') IS NOT NULL THEN
        UPDATE public.platform_settings SET updated_by = NULL WHERE updated_by = p_user_id;
    END IF;

    -- هـ) حذف المستخدم نهائياً من الجداول
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM public.system_users WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة التوافقية (Function Overload) للاستدعاء بمعامل واحد فقط
CREATE OR REPLACE FUNCTION public.admin_delete_worker(
    p_user_id uuid
)
RETURNS boolean AS $$
BEGIN
    RETURN public.admin_delete_worker(p_user_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- 3. منح الصلاحيات لجميع الأدوار
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_delete_worker(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_worker(uuid) TO authenticated, anon, service_role;
