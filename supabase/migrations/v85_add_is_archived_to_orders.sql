-- =========================================================================
-- 🚀 MIGRATION V85: ADD IS_ARCHIVED COLUMN TO ORDERS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-02
-- 💡 Description: Adds is_archived boolean column to public.orders table
--    with index for fast per-tenant filtering of active and archived orders.
-- =========================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Create index for high-performance active/archived queries
CREATE INDEX IF NOT EXISTS idx_orders_tenant_archived ON public.orders(tenant_id, is_archived);

-- Update any NULL values to false
UPDATE public.orders SET is_archived = false WHERE is_archived IS NULL;
