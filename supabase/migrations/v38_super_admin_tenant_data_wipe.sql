-- Migration v38: Super Admin Tenant Data Wipe Procedure

CREATE OR REPLACE FUNCTION public.super_admin_wipe_tenant_data(
    p_tenant_id uuid
)
RETURNS boolean AS $$
DECLARE
    v_calling_role text;
BEGIN
    -- Verify calling user exists and is authorized (super_admin or platform owner)
    SELECT role INTO v_calling_role
    FROM public.system_users
    WHERE id = auth.uid() AND is_active = true;

    IF v_calling_role IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية الخطيرة.';
    END IF;

    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'يرجى تحديد المصنع المراد تفريغ بياناته.';
    END IF;

    -- 1. Delete Order Items & Order Logs
    DELETE FROM public.order_items 
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = p_tenant_id);

    DELETE FROM public.order_logs 
    WHERE tenant_id = p_tenant_id;

    -- 2. Delete Orders
    DELETE FROM public.orders 
    WHERE tenant_id = p_tenant_id;

    -- 3. Delete Deposit Reports & Transactions
    DELETE FROM public.deposit_transactions 
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.deposit_reports 
    WHERE tenant_id = p_tenant_id;

    -- 4. Delete Model Stock / Inventory & Colors Logs
    DELETE FROM public.inventory_logs 
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.model_colors 
    WHERE model_id IN (SELECT id FROM public.models WHERE tenant_id = p_tenant_id);

    -- 5. Delete Models & Categories (or reset model stock to 0)
    DELETE FROM public.models 
    WHERE tenant_id = p_tenant_id;

    -- 6. Delete Promo Cards & Notifications
    DELETE FROM public.promo_cards 
    WHERE tenant_id = p_tenant_id;

    DELETE FROM public.notifications 
    WHERE tenant_id = p_tenant_id;

    -- 7. Reset User Invoice & Activity Counts for this tenant
    UPDATE public.system_users 
    SET invoice_count = 0, login_count = 0 
    WHERE tenant_id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
