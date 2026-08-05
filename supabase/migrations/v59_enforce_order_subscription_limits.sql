-- =========================================================================
-- 🚀 MIGRATION V59: ENFORCE ORDER/INVOICE SUBSCRIPTION LIMITS (max_orders)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description: Enforces max_orders subscription limit on public.orders BEFORE INSERT
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_order_subscription_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_max_orders integer;
    v_current_count integer;
BEGIN
    -- Fetch active subscription limit for tenant
    SELECT max_orders INTO v_max_orders
    FROM public.subscriptions
    WHERE tenant_id = NEW.tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If unlimited (-1 or >= 99999), allow insertion
    IF v_max_orders IS NULL OR v_max_orders = -1 OR v_max_orders >= 99999 THEN
        RETURN NEW;
    END IF;

    -- Count total existing orders for tenant
    SELECT count(*) INTO v_current_count
    FROM public.orders
    WHERE tenant_id = NEW.tenant_id;

    IF v_current_count >= v_max_orders THEN
        RAISE EXCEPTION 'SUBSCRIPTION_LIMIT_EXCEEDED: تم الوصول للحد الأقصى لعدد الطلبات بالفاتورة المتاحة بالباقة (الحد الأقصى: % طلب). يرجى الترقية.', v_max_orders
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_order_subscription_limits ON public.orders;
CREATE TRIGGER trg_check_order_subscription_limits
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.check_order_subscription_limits();
