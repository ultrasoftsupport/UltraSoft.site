-- =========================================================================
-- 🚀 MIGRATION V60: EXCEL CREDITS CONSUMPTION ENGINE & CONSUMPTION AUDIT LOG
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description: Creates excel_credits_log table, deduct_excel_credits RPC,
--    add_credits_to_tenant RPC, and get_tenant_credit_rules RPC.
-- =========================================================================

-- Safely add updated_at column to subscriptions if missing
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.subscriptions ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
END $$;

-- 1. Create Credit Consumption Audit Log Table
CREATE TABLE IF NOT EXISTS public.excel_credits_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    user_id uuid,
    user_name text,
    operation_type text NOT NULL, -- 'bulk_edit', 'excel_models_import', 'excel_stock_import', 'credit_recharge'
    location_name text NOT NULL,  -- 'التعديلات المجمعة', 'استيراد موديلات إكسيل', 'رفع مخزون إكسيل', 'شحن كريديت'
    credits_deducted numeric(10,2) NOT NULL DEFAULT 0.00,
    items_count integer NOT NULL DEFAULT 0,
    pricing_mode text NOT NULL DEFAULT 'per_item', -- 'per_item', 'per_operation', 'recharge'
    remaining_balance_after numeric(10,2) DEFAULT 0.00,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS on excel_credits_log
ALTER TABLE public.excel_credits_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for authenticated users in same tenant" ON public.excel_credits_log;
CREATE POLICY "Allow select for authenticated users in same tenant"
ON public.excel_credits_log FOR SELECT
TO authenticated
USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.excel_credits_log;
CREATE POLICY "Allow all for authenticated users"
ON public.excel_credits_log FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

-- 2. Create RPC Function to Get Tenant Credit Rules
CREATE OR REPLACE FUNCTION public.get_tenant_credit_rules(p_tenant_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_plan_limits record;
    v_monthly_credits integer;
    v_consumed_credits numeric;
    v_remaining_credits numeric;
    v_pricing_mode text;
    v_per_op_cost numeric;
    v_per_item_cost numeric;
    v_max_cap numeric;
    v_excel_colors_cost numeric;
    v_excel_items_cost numeric;
    v_excel_stock_cost numeric;
    v_plan_key text;
    v_base_plan_key text;
    v_result jsonb;
BEGIN
    -- Fetch active subscription for tenant
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    v_plan_key := COALESCE(v_sub.plan, 'quarterly');
    
    -- Extract base plan key if plan is custom (e.g. 'custom' or 'quarterly_custom' -> 'quarterly')
    v_base_plan_key := COALESCE(
        v_sub.custom_limits->>'base_plan',
        CASE 
            WHEN v_plan_key LIKE '%trial%' THEN 'semi_annual'
            WHEN v_plan_key LIKE '%semi%' THEN 'semi_annual'
            WHEN v_plan_key LIKE '%annual%' THEN 'annual'
            WHEN v_plan_key LIKE '%quarterly%' THEN 'quarterly'
            ELSE 'semi_annual'
        END
    );

    -- Fetch plan limits defaults using base plan
    SELECT * INTO v_plan_limits
    FROM public.subscription_plan_limits
    WHERE plan_key = v_base_plan_key;

    IF v_plan_limits.id IS NULL THEN
        SELECT * INTO v_plan_limits
        FROM public.subscription_plan_limits
        WHERE plan_key = 'quarterly';
    END IF;

    -- Resolve Monthly Credits & Consumed Credits
    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, v_plan_limits.monthly_excel_credits, 200);
    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);

    IF v_monthly_credits = -1 OR v_monthly_credits >= 99999 THEN
        v_remaining_credits := 99999;
    ELSE
        v_remaining_credits := GREATEST(0, v_monthly_credits - v_consumed_credits);
    END IF;

    -- Resolve Pricing Mode, Rates & Maximum Cap
    v_pricing_mode := COALESCE(v_sub.custom_limits->>'bulk_edit_pricing_mode', v_plan_limits.bulk_edit_pricing_mode, 'per_item');
    v_per_op_cost := COALESCE((v_sub.custom_limits->>'bulk_edit_per_op_cost')::numeric, v_plan_limits.bulk_edit_per_op_cost, 5.00);
    v_per_item_cost := COALESCE((v_sub.custom_limits->>'bulk_edit_per_item_cost')::numeric, v_plan_limits.bulk_edit_per_item_cost, 1.00);
    v_max_cap := COALESCE((v_sub.custom_limits->>'bulk_edit_max_cap')::numeric, v_plan_limits.bulk_edit_max_cap, 50.00);
    v_excel_colors_cost := COALESCE((v_sub.custom_limits->>'excel_upload_colors_cost')::numeric, v_plan_limits.excel_upload_colors_cost, 1.00);
    v_excel_items_cost := COALESCE((v_sub.custom_limits->>'excel_upload_items_cost')::numeric, v_plan_limits.excel_upload_items_cost, 1.00);
    v_excel_stock_cost := COALESCE((v_sub.custom_limits->>'excel_upload_stock_cost')::numeric, v_plan_limits.excel_upload_stock_cost, 1.00);

    v_result := jsonb_build_object(
        'monthly_excel_credits', v_monthly_credits,
        'consumed_excel_credits', v_consumed_credits,
        'remaining_credits', v_remaining_credits,
        'is_unlimited', (v_monthly_credits = -1 OR v_monthly_credits >= 99999),
        'base_plan', v_base_plan_key,
        'bulk_edit_pricing_mode', v_pricing_mode,
        'bulk_edit_per_op_cost', v_per_op_cost,
        'bulk_edit_per_item_cost', v_per_item_cost,
        'bulk_edit_max_cap', v_max_cap,
        'excel_upload_colors_cost', v_excel_colors_cost,
        'excel_upload_items_cost', v_excel_items_cost,
        'excel_upload_stock_cost', v_excel_stock_cost
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Atomic Credit Deduction & Logging RPC
CREATE OR REPLACE FUNCTION public.deduct_excel_credits(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_operation_type text,
    p_location_name text,
    p_credits_to_deduct numeric,
    p_items_count integer,
    p_pricing_mode text
)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_plan_limits record;
    v_plan_key text;
    v_base_plan_key text;
    v_monthly_credits integer;
    v_consumed_credits numeric;
    v_new_consumed numeric;
    v_remaining numeric;
    v_final_deduction numeric;
    v_custom_limits jsonb;
    v_max_cap numeric;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على اشتراك فعال للمصنع.';
    END IF;

    v_plan_key := COALESCE(v_sub.plan, 'quarterly');

    -- Extract base plan key
    v_base_plan_key := COALESCE(
        v_sub.custom_limits->>'base_plan',
        CASE 
            WHEN v_plan_key LIKE '%quarterly%' THEN 'quarterly'
            WHEN v_plan_key LIKE '%semi%' THEN 'semi_annual'
            WHEN v_plan_key LIKE '%annual%' THEN 'annual'
            WHEN v_plan_key LIKE '%trial%' THEN 'trial'
            ELSE 'quarterly'
        END
    );

    -- Fetch plan limits defaults using base plan
    SELECT * INTO v_plan_limits
    FROM public.subscription_plan_limits
    WHERE plan_key = v_base_plan_key;

    IF v_plan_limits.id IS NULL THEN
        SELECT * INTO v_plan_limits
        FROM public.subscription_plan_limits
        WHERE plan_key = 'quarterly';
    END IF;

    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, v_plan_limits.monthly_excel_credits, 200);

    -- Unlimited Plan Case (-1 or >= 99999)
    IF v_monthly_credits = -1 OR v_monthly_credits >= 99999 THEN
        INSERT INTO public.excel_credits_log (
            tenant_id, user_id, user_name, operation_type, location_name,
            credits_deducted, items_count, pricing_mode, remaining_balance_after
        ) VALUES (
            p_tenant_id, p_user_id, p_user_name, p_operation_type, p_location_name,
            0, p_items_count, p_pricing_mode, 99999
        );

        RETURN jsonb_build_object('success', true, 'remaining', 99999, 'is_unlimited', true);
    END IF;

    v_max_cap := COALESCE((v_sub.custom_limits->>'bulk_edit_max_cap')::numeric, v_plan_limits.bulk_edit_max_cap, 50.00);

    -- Apply max cap limit if per_item mode is used and max cap > 0
    IF p_pricing_mode = 'per_item' AND v_max_cap > 0 AND p_credits_to_deduct > v_max_cap THEN
        v_final_deduction := v_max_cap;
    ELSE
        v_final_deduction := p_credits_to_deduct;
    END IF;

    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);
    v_remaining := v_monthly_credits - v_consumed_credits;

    -- Check if sufficient balance
    IF v_final_deduction > 0 AND v_remaining < v_final_deduction THEN
        RAISE EXCEPTION 'INSUFFICIENT_EXCEL_CREDITS: رصيد الكريديت الحالي (% كريديت) غير كافٍ لإتمام العملية (تتطلب % كريديت).', v_remaining, v_final_deduction
            USING ERRCODE = 'P0001';
    END IF;

    v_new_consumed := v_consumed_credits + v_final_deduction;
    v_remaining := v_monthly_credits - v_new_consumed;

    -- Update custom_limits jsonb in subscriptions
    v_custom_limits := COALESCE(v_sub.custom_limits, '{}'::jsonb);
    v_custom_limits := jsonb_set(v_custom_limits, '{consumed_excel_credits}', to_jsonb(v_new_consumed));

    UPDATE public.subscriptions
    SET custom_limits = v_custom_limits
    WHERE id = v_sub.id;

    -- Audit Log Entry
    INSERT INTO public.excel_credits_log (
        tenant_id, user_id, user_name, operation_type, location_name,
        credits_deducted, items_count, pricing_mode, remaining_balance_after
    ) VALUES (
        p_tenant_id, p_user_id, p_user_name, p_operation_type, p_location_name,
        v_final_deduction, p_items_count, p_pricing_mode, v_remaining
    );

    RETURN jsonb_build_object('success', true, 'remaining', v_remaining, 'is_unlimited', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create Super Admin Credit Recharge RPC
CREATE OR REPLACE FUNCTION public.add_credits_to_tenant(
    p_tenant_id uuid,
    p_credits_to_add numeric,
    p_user_name text DEFAULT 'Super Admin'
)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_consumed_credits numeric;
    v_monthly_credits integer;
    v_new_consumed numeric;
    v_custom_limits jsonb;
    v_remaining numeric;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على اشتراك لهذا المصنع.';
    END IF;

    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);
    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, 200);

    -- Adding credits reduces consumed_excel_credits
    v_new_consumed := GREATEST(0, v_consumed_credits - p_credits_to_add);
    v_remaining := v_monthly_credits - v_new_consumed;

    v_custom_limits := COALESCE(v_sub.custom_limits, '{}'::jsonb);
    v_custom_limits := jsonb_set(v_custom_limits, '{consumed_excel_credits}', to_jsonb(v_new_consumed));

    UPDATE public.subscriptions
    SET custom_limits = v_custom_limits
    WHERE id = v_sub.id;

    -- Log credit addition in excel_credits_log
    INSERT INTO public.excel_credits_log (
        tenant_id, user_id, user_name, operation_type, location_name,
        credits_deducted, items_count, pricing_mode, remaining_balance_after
    ) VALUES (
        p_tenant_id, auth.uid(), p_user_name, 'credit_recharge', 'شحن دفعة كريديت من السوبر أدمن',
        -p_credits_to_add, 0, 'recharge', v_remaining
    );

    RETURN jsonb_build_object('success', true, 'added', p_credits_to_add, 'remaining', v_remaining);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_tenant_credit_rules(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_excel_credits(uuid, uuid, text, text, text, numeric, integer, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.add_credits_to_tenant(uuid, numeric, text) TO authenticated, anon, service_role;
