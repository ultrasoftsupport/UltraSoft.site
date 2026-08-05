-- Migration v61: Rebuild deduct_excel_credits and deduct_tenant_credits RPCs
-- Ensures 'trial' plan dynamically inherits rules & limits from 'semi_annual' plan.

DROP FUNCTION IF EXISTS public.deduct_excel_credits CASCADE;
DROP FUNCTION IF EXISTS public.deduct_tenant_credits CASCADE;

CREATE OR REPLACE FUNCTION public.deduct_excel_credits(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_operation_type text,
    p_location_name text,
    p_credits_to_deduct numeric,
    p_items_count integer,
    p_pricing_mode text DEFAULT 'per_item'
) RETURNS jsonb AS $$
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

    -- Extract base plan key (Trial plan dynamically inherits from semi_annual)
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
        WHERE plan_key = 'semi_annual';
    END IF;

    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, v_plan_limits.monthly_excel_credits, 500);

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

    -- Resolve max cap dynamically: read from custom_limits -> then plan limits -> fallback to semi_annual default
    v_max_cap := COALESCE((v_sub.custom_limits->>'bulk_edit_max_cap')::numeric, v_plan_limits.bulk_edit_max_cap, 500.00);

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

    RETURN jsonb_build_object('success', true, 'remaining', v_remaining, 'deducted', v_final_deduction);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alias deduct_tenant_credits to deduct_excel_credits to support both function names safely
CREATE OR REPLACE FUNCTION public.deduct_tenant_credits(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_operation_type text,
    p_location_name text,
    p_credits_to_deduct numeric,
    p_items_count integer,
    p_pricing_mode text DEFAULT 'per_item'
) RETURNS jsonb AS $$
BEGIN
    RETURN public.deduct_excel_credits(
        p_tenant_id, p_user_id, p_user_name, p_operation_type,
        p_location_name, p_credits_to_deduct, p_items_count, p_pricing_mode
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.deduct_excel_credits(uuid, uuid, text, text, text, numeric, integer, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_tenant_credits(uuid, uuid, text, text, text, numeric, integer, text) TO authenticated, anon, service_role;
