-- =========================================================================
-- 🚀 MIGRATION V68: FIX RLS POLICIES FOR ORDERS, ORDER ITEMS & OPERATIONAL TABLES
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-06
-- 💡 Description: Fixes RLS policies on orders, order_items, system_users, returns,
--    system_audit_logs, and inbound_invoices to grant access to both authenticated and anon roles 
--    with strict tenant isolation (public.current_tenant_id()).
-- =========================================================================

-- 1. ORDERS TABLE
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
DROP POLICY IF EXISTS "orders_public_select" ON public.orders;
DROP POLICY IF EXISTS "Allow select orders by tenant" ON public.orders;
DROP POLICY IF EXISTS "Allow write orders by tenant" ON public.orders;

CREATE POLICY "Allow select orders by tenant" ON public.orders
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write orders by tenant" ON public.orders
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 2. ORDER_ITEMS TABLE
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
DROP POLICY IF EXISTS "Allow select order_items by tenant" ON public.order_items;
DROP POLICY IF EXISTS "Allow write order_items by tenant" ON public.order_items;

CREATE POLICY "Allow select order_items by tenant" ON public.order_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE orders.id = order_items.order_id 
        AND (
            orders.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

CREATE POLICY "Allow write order_items by tenant" ON public.order_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE orders.id = order_items.order_id 
        AND (
            orders.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE orders.id = order_items.order_id 
        AND (
            orders.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

-- 3. SYSTEM_USERS TABLE
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_users_select" ON public.system_users;
DROP POLICY IF EXISTS "Allow select system_users by tenant" ON public.system_users;

CREATE POLICY "Allow select system_users by tenant" ON public.system_users
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 4. RETURNS & INBOUND INVOICES
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "returns_select" ON public.returns;
DROP POLICY IF EXISTS "returns_admin_all" ON public.returns;
DROP POLICY IF EXISTS "Allow select returns by tenant" ON public.returns;

CREATE POLICY "Allow select returns by tenant" ON public.returns
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

ALTER TABLE public.inbound_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inbound_invoices_select" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_admin_all" ON public.inbound_invoices;
DROP POLICY IF EXISTS "Allow select inbound_invoices by tenant" ON public.inbound_invoices;

CREATE POLICY "Allow select inbound_invoices by tenant" ON public.inbound_invoices
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 5. SYSTEM_AUDIT_LOGS TABLE
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select system_audit_logs by tenant" ON public.system_audit_logs;

CREATE POLICY "Allow select system_audit_logs by tenant" ON public.system_audit_logs
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- Grants for anon and authenticated roles
GRANT ALL ON public.orders TO authenticated, anon, service_role;
GRANT ALL ON public.order_items TO authenticated, anon, service_role;
GRANT ALL ON public.system_users TO authenticated, anon, service_role;
GRANT ALL ON public.returns TO authenticated, anon, service_role;
GRANT ALL ON public.inbound_invoices TO authenticated, anon, service_role;
GRANT ALL ON public.system_audit_logs TO authenticated, anon, service_role;
