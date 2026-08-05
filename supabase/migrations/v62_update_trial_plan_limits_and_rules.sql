-- Migration v62: Sync trial plan limits and rules 100% with semi_annual plan

-- 1. Sync subscription_plan_limits table for 'trial' from 'semi_annual'
UPDATE public.subscription_plan_limits t
SET 
    max_products = s.max_products,
    max_total_products = s.max_total_products,
    max_invoices = s.max_invoices,
    max_users = s.max_users,
    monthly_excel_credits = s.monthly_excel_credits,
    credits_reset_frequency = s.credits_reset_frequency,
    bulk_edit_pricing_mode = s.bulk_edit_pricing_mode,
    bulk_edit_per_op_cost = s.bulk_edit_per_op_cost,
    bulk_edit_per_item_cost = s.bulk_edit_per_item_cost,
    bulk_edit_max_cap = s.bulk_edit_max_cap,
    excel_upload_colors_cost = s.excel_upload_colors_cost,
    excel_upload_items_cost = s.excel_upload_items_cost,
    excel_upload_stock_cost = s.excel_upload_stock_cost,
    updated_at = NOW()
FROM public.subscription_plan_limits s
WHERE t.plan_key = 'trial' AND s.plan_key = 'semi_annual';

-- 2. Update existing trial subscriptions to set base_plan = 'semi_annual' in custom_limits
UPDATE public.subscriptions
SET custom_limits = jsonb_set(
    COALESCE(custom_limits, '{}'::jsonb),
    '{base_plan}',
    '"semi_annual"'::jsonb
)
WHERE plan = 'trial';
