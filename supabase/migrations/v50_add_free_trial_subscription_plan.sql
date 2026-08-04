-- =========================================================================
-- 🚀 MIGRATION V50: ADD FREE TRIAL SUBSCRIPTION PLAN (5 DAYS)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Adds 'trial' plan to system_subscription_plans & subscription_plan_limits.
--    Gives full features & limits of 6-month plan for 5 days free trial.
-- =========================================================================

-- 1. Insert/UPSERT 'trial' Plan into system_subscription_plans
INSERT INTO public.system_subscription_plans 
(key, name, badge_text, discount_tag, savings_tag, period_months, price, currency, subtitle, max_products_label, max_products_val, excel_credits_label, excel_credits_val, max_users_label, max_users_val, features_list, color_scheme, is_featured, sort_order)
VALUES 
(
    'trial',
    'الباقة التجريبية المجانية',
    'تجربة مجانية (5 أيام)',
    'مجاناً 100%',
    '5 أيام تجريبية',
    0,
    0,
    'ج.م',
    'كافة خصائص ومميزات باقة الـ 6 أشهر مجاناً وبدون أي رسوم لمدة 5 أيام',
    'حتى 600 موديل (3 أضعاف)',
    600,
    '500 كريديت / شهرياً',
    500,
    'حتى 10 مستخدمين',
    10,
    '["تجربة مجانية بالكامل بدون أي رسوم أو فيزا", "كافة خصائص ومميزات باقة الـ 6 أشهر", "حتى 600 موديل نشط بالمعرض", "500 كريديت رفع وتعديل (Excel)", "حتى 10 مستخدمين وفريق عمل كامل", "دعم فني وتدريب كامل خلال فترة التجربة"]'::jsonb,
    'purple',
    false,
    0
)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    badge_text = EXCLUDED.badge_text,
    discount_tag = EXCLUDED.discount_tag,
    savings_tag = EXCLUDED.savings_tag,
    period_months = EXCLUDED.period_months,
    price = EXCLUDED.price,
    subtitle = EXCLUDED.subtitle,
    max_products_label = EXCLUDED.max_products_label,
    max_products_val = EXCLUDED.max_products_val,
    excel_credits_label = EXCLUDED.excel_credits_label,
    excel_credits_val = EXCLUDED.excel_credits_val,
    max_users_label = EXCLUDED.max_users_label,
    max_users_val = EXCLUDED.max_users_val,
    features_list = EXCLUDED.features_list,
    color_scheme = EXCLUDED.color_scheme,
    sort_order = EXCLUDED.sort_order;

-- 2. Insert/UPSERT 'trial' Limits into subscription_plan_limits
INSERT INTO public.subscription_plan_limits 
(plan_key, max_products, max_total_products, max_invoices, max_users, monthly_excel_credits, credits_reset_frequency, bulk_edit_pricing_mode, bulk_edit_per_op_cost, bulk_edit_per_item_cost, bulk_edit_max_cap, excel_upload_colors_cost, excel_upload_items_cost, excel_upload_stock_cost)
VALUES
('trial', 600, 1500, 3000, 10, 500, 'monthly', 'per_item', 5, 1, 50, 0.8, 0.8, 0.8)
ON CONFLICT (plan_key) DO UPDATE SET
    max_products = EXCLUDED.max_products,
    max_total_products = EXCLUDED.max_total_products,
    max_invoices = EXCLUDED.max_invoices,
    max_users = EXCLUDED.max_users,
    monthly_excel_credits = EXCLUDED.monthly_excel_credits,
    credits_reset_frequency = EXCLUDED.credits_reset_frequency;
