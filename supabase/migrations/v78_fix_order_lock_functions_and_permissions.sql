-- =========================================================================
-- 🚀 MIGRATION V78: FIX ACQUIRE & RELEASE ORDER LOCK RPC FUNCTIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-11
-- 💡 Description: Removes restrictive auth.uid() checks in acquire_order_lock and 
--    release_order_lock so that frontend users authenticated via custom sessions
--    or anon keys can lock/unlock orders seamlessly while maintaining lock conflict checks.
-- =========================================================================

-- 1. FIX ACQUIRE ORDER LOCK RPC
CREATE OR REPLACE FUNCTION public.acquire_order_lock(
    p_order_id uuid,
    p_assigned_admin_name text
)
RETURNS boolean AS $$
DECLARE
    v_my_role text;
    v_is_super boolean;
BEGIN
    -- 1.1 التحقق من وجود الأوردر
    IF NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
    ) THEN
        RAISE EXCEPTION 'الأوردر المطلوب غير موجود بالسيستم.';
    END IF;

    v_my_role := public.get_my_role();
    v_is_super := public.is_super_admin();

    -- 1.2 التحقق مما إذا كان الأوردر مقفولاً بالفعل بواسطة إداري/موظف آخر
    IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
        AND o.is_locked = true
        AND o.assigned_admin_name IS NOT NULL
        AND o.assigned_admin_name != ''
        AND o.assigned_admin_name IS DISTINCT FROM p_assigned_admin_name
        AND v_my_role NOT IN ('owner', 'super_admin')
        AND v_is_super IS NOT TRUE
    ) THEN
        RAISE EXCEPTION 'عفواً، هذا الأوردر مقفول حالياً بواسطة مستخدم آخر.';
    END IF;

    -- 1.3 تحديث حالة وقفل الأوردر
    UPDATE public.orders
    SET is_locked = true,
        assigned_admin_name = p_assigned_admin_name,
        status = 'editing'
    WHERE id = p_order_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. FIX RELEASE ORDER LOCK RPC
CREATE OR REPLACE FUNCTION public.release_order_lock(
    p_order_id uuid
)
RETURNS boolean AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
    ) THEN
        RAISE EXCEPTION 'الأوردر المطلوب غير موجود بالسيستم.';
    END IF;

    UPDATE public.orders
    SET is_locked = false,
        assigned_worker_id = NULL,
        assigned_admin_name = NULL,
        status = 'created'
    WHERE id = p_order_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. GRANT EXECUTE PERMISSIONS
GRANT EXECUTE ON FUNCTION public.acquire_order_lock(uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_lock(uuid) TO authenticated, anon, service_role;
