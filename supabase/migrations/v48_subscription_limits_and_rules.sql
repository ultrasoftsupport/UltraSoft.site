-- =========================================================================
-- 🌟 Migration v48: Dynamic Subscription Limits & Credits Consumption Engine
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plan_limits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_key text NOT NULL UNIQUE, -- 'quarterly', 'semi_annual', 'annual'
    max_products integer NOT NULL DEFAULT 200, -- -1 for unlimited
    max_users integer NOT NULL DEFAULT 4,
    monthly_excel_credits integer NOT NULL DEFAULT 200, -- -1 for unlimited
    credits_reset_frequency text NOT NULL DEFAULT 'monthly', -- 'monthly', 'quarterly', 'annual'
    
    -- Bulk Edit Rules
    bulk_edit_pricing_mode text NOT NULL DEFAULT 'per_item', -- 'per_operation', 'per_item'
    bulk_edit_per_op_cost numeric(10,2) NOT NULL DEFAULT 5.00,
    bulk_edit_per_item_cost numeric(10,2) NOT NULL DEFAULT 1.00,
    bulk_edit_max_cap numeric(10,2) NOT NULL DEFAULT 50.00,
    
    -- Excel Upload Specific Rules
    excel_upload_colors_cost numeric(10,2) NOT NULL DEFAULT 1.00,
    excel_upload_items_cost numeric(10,2) NOT NULL DEFAULT 1.00,
    excel_upload_stock_cost numeric(10,2) NOT NULL DEFAULT 1.00,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS Enablement
ALTER TABLE public.subscription_plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on subscription_plan_limits" ON public.subscription_plan_limits;
CREATE POLICY "Allow public read on subscription_plan_limits" 
ON public.subscription_plan_limits FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access on subscription_plan_limits" ON public.subscription_plan_limits;
CREATE POLICY "Allow authenticated full access on subscription_plan_limits" 
ON public.subscription_plan_limits FOR ALL USING (true) WITH CHECK (true);

-- Seed Default Limits for system subscription plans
INSERT INTO public.subscription_plan_limits 
(plan_key, max_products, max_users, monthly_excel_credits, credits_reset_frequency, bulk_edit_pricing_mode, bulk_edit_per_op_cost, bulk_edit_per_item_cost, bulk_edit_max_cap, excel_upload_colors_cost, excel_upload_items_cost, excel_upload_stock_cost)
VALUES
('quarterly', 200, 4, 200, 'monthly', 'per_item', 5, 1, 50, 1, 1, 1),
('semi_annual', 600, 10, 500, 'monthly', 'per_item', 5, 1, 50, 0.8, 0.8, 0.8),
('annual', -1, 25, -1, 'monthly', 'per_operation', 0, 0, 0, 0, 0, 0)
ON CONFLICT (plan_key) DO UPDATE SET
    max_products = EXCLUDED.max_products,
    max_users = EXCLUDED.max_users,
    monthly_excel_credits = EXCLUDED.monthly_excel_credits,
    credits_reset_frequency = EXCLUDED.credits_reset_frequency,
    bulk_edit_pricing_mode = EXCLUDED.bulk_edit_pricing_mode,
    bulk_edit_per_op_cost = EXCLUDED.bulk_edit_per_op_cost,
    bulk_edit_per_item_cost = EXCLUDED.bulk_edit_per_item_cost,
    bulk_edit_max_cap = EXCLUDED.bulk_edit_max_cap,
    excel_upload_colors_cost = EXCLUDED.excel_upload_colors_cost,
    excel_upload_items_cost = EXCLUDED.excel_upload_items_cost,
    excel_upload_stock_cost = EXCLUDED.excel_upload_stock_cost,
    updated_at = now();
