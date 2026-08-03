-- ============================================================
-- MIGRATION v33: CONVERT ALL EXISTING THEMES TO SYSTEM DEFAULT & ENFORCE TENANT ISOLATION
-- ============================================================

-- 1. Ensure `themes` table has required columns for isolation
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.themes ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- 2. Convert ALL existing themes in the database to System Default themes (Visible to everyone)
UPDATE public.themes 
SET is_system = true, 
    tenant_id = NULL;

-- Enable RLS on themes table
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can read system themes (is_system = true OR tenant_id IS NULL) OR their own tenant's custom themes
DROP POLICY IF EXISTS "tenant_isolation_select_themes" ON public.themes;
CREATE POLICY "tenant_isolation_select_themes" ON public.themes
FOR SELECT USING (
    is_system = true 
    OR tenant_id IS NULL 
    OR tenant_id = (SELECT tenant_id FROM public.system_users WHERE id = auth.uid())
);

-- Policy 2: Users can create/update/delete only their own tenant non-system themes
DROP POLICY IF EXISTS "tenant_isolation_modify_themes" ON public.themes;
CREATE POLICY "tenant_isolation_modify_themes" ON public.themes
FOR ALL USING (
    (is_system IS NOT TRUE) 
    AND (
        tenant_id = (SELECT tenant_id FROM public.system_users WHERE id = auth.uid())
        OR current_setting('app.current_tenant_id', true)::uuid = tenant_id
    )
);

-- ============================================================
-- 3. CREATE TENANT-ISOLATED SYSTEM DATA RESET FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_tenant_system_data(p_tenant_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_tenant UUID;
BEGIN
    IF p_tenant_id IS NOT NULL THEN
        target_tenant := p_tenant_id;
    ELSE
        SELECT tenant_id INTO target_tenant FROM public.system_users WHERE id = auth.uid();
        IF target_tenant IS NULL THEN
            target_tenant := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
        END IF;
    END IF;

    IF target_tenant IS NULL THEN
        RAISE EXCEPTION 'Tenant ID required for isolated data reset.';
    END IF;

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

END;
$$;

CREATE OR REPLACE FUNCTION public.reset_system_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.reset_tenant_system_data(NULL);
END;
$$;
