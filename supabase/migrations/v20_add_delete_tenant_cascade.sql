-- =========================================================================
-- 🚀 MIGRATION V20: CASCADE TENANT DELETION FUNCTION (PROTECT DEFAULT TENANT)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds public.delete_tenant_cascade PL/pgSQL function to 
--    permanently remove a tenant along with ALL associated data, while protecting
--    the default primary marketing tenant.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(p_tenant_id uuid)
RETURNS boolean AS $$
BEGIN
    -- Prevent deleting the default primary marketing tenant
    IF p_tenant_id = '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'لا يمكن حذف المصنع الرئيسي الافتراضي للنظام!';
    END IF;

    -- 1. Delete order items for orders belonging to this tenant
    DELETE FROM public.order_items 
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = p_tenant_id);

    -- 2. Delete orders, invoices, returns, inbound invoices, stock movements
    DELETE FROM public.orders WHERE tenant_id = p_tenant_id;
    DELETE FROM public.invoices WHERE tenant_id = p_tenant_id;
    DELETE FROM public.returns WHERE tenant_id = p_tenant_id;
    DELETE FROM public.inbound_invoices WHERE tenant_id = p_tenant_id;
    DELETE FROM public.stock_movements WHERE tenant_id = p_tenant_id;

    -- 3. Delete model images, inventory, model sizes, models
    DELETE FROM public.model_images WHERE model_id IN (SELECT id FROM public.models WHERE tenant_id = p_tenant_id);
    DELETE FROM public.model_inventory WHERE model_id IN (SELECT id FROM public.models WHERE tenant_id = p_tenant_id);
    DELETE FROM public.model_sizes WHERE model_id IN (SELECT id FROM public.models WHERE tenant_id = p_tenant_id);
    DELETE FROM public.models WHERE tenant_id = p_tenant_id;

    -- 4. Delete categories, sizes, colors, classes
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
    DELETE FROM public.sizes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.colors WHERE tenant_id = p_tenant_id;
    DELETE FROM public.classes WHERE tenant_id = p_tenant_id;

    -- 5. Delete users, subscriptions, domains, home settings
    DELETE FROM public.system_users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.subscriptions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_domains WHERE tenant_id = p_tenant_id;
    DELETE FROM public.home_settings WHERE tenant_id = p_tenant_id;

    -- 6. Finally delete the tenant row
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
