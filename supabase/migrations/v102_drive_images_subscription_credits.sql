-- ==============================================================================
-- Migration v102: Add Google Drive Model Images Import to Subscription Credits
-- ==============================================================================

-- 1. Add drive images pricing columns to subscription_plan_limits table
ALTER TABLE IF EXISTS public.subscription_plan_limits
    ADD COLUMN IF NOT EXISTS drive_images_pricing_mode text NOT NULL DEFAULT 'per_operation',
    ADD COLUMN IF NOT EXISTS drive_images_per_op_cost numeric(10,2) NOT NULL DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS drive_images_per_item_cost numeric(10,2) NOT NULL DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS drive_images_max_cap numeric(10,2) NOT NULL DEFAULT 30.00;

-- 2. Update default seed values in subscription_plan_limits
UPDATE public.subscription_plan_limits
SET 
    drive_images_pricing_mode = COALESCE(drive_images_pricing_mode, 'per_operation'),
    drive_images_per_op_cost = 10.00,
    drive_images_per_item_cost = 1.00,
    drive_images_max_cap = 30.00
WHERE plan_key IN ('quarterly', 'semi_annual', 'annual', 'trial');

-- 3. Re-create get_tenant_credit_rules RPC with Drive Images rules
CREATE OR REPLACE FUNCTION public.get_tenant_credit_rules(
    p_tenant_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_plan_limits record;
    v_plan_key text;
    v_base_plan_key text;
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
    -- Drive images rules
    v_drive_pricing_mode text;
    v_drive_per_op_cost numeric;
    v_drive_per_item_cost numeric;
    v_drive_max_cap numeric;
    v_result jsonb;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        SELECT * INTO v_plan_limits
        FROM public.subscription_plan_limits
        WHERE plan_key = 'semi_annual';

        RETURN jsonb_build_object(
            'monthly_excel_credits', 200,
            'consumed_excel_credits', 0,
            'remaining_credits', 200,
            'is_unlimited', false,
            'base_plan', 'semi_annual',
            'bulk_edit_pricing_mode', COALESCE(v_plan_limits.bulk_edit_pricing_mode, 'per_item'),
            'bulk_edit_per_op_cost', COALESCE(v_plan_limits.bulk_edit_per_op_cost, 5.00),
            'bulk_edit_per_item_cost', COALESCE(v_plan_limits.bulk_edit_per_item_cost, 1.00),
            'bulk_edit_max_cap', COALESCE(v_plan_limits.bulk_edit_max_cap, 50.00),
            'excel_upload_colors_cost', COALESCE(v_plan_limits.excel_upload_colors_cost, 1.00),
            'excel_upload_items_cost', COALESCE(v_plan_limits.excel_upload_items_cost, 1.00),
            'excel_upload_stock_cost', COALESCE(v_plan_limits.excel_upload_stock_cost, 1.00),
            'drive_images_pricing_mode', COALESCE(v_plan_limits.drive_images_pricing_mode, 'per_operation'),
            'drive_images_per_op_cost', COALESCE(v_plan_limits.drive_images_per_op_cost, 10.00),
            'drive_images_per_item_cost', COALESCE(v_plan_limits.drive_images_per_item_cost, 1.00),
            'drive_images_max_cap', COALESCE(v_plan_limits.drive_images_max_cap, 30.00)
        );
    END IF;

    v_plan_key := COALESCE(v_sub.plan, 'quarterly');
    
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

    SELECT * INTO v_plan_limits
    FROM public.subscription_plan_limits
    WHERE plan_key = v_base_plan_key;

    IF v_plan_limits.id IS NULL THEN
        SELECT * INTO v_plan_limits
        FROM public.subscription_plan_limits
        WHERE plan_key = 'semi_annual';
    END IF;

    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, v_plan_limits.monthly_excel_credits, 200);
    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);

    IF v_monthly_credits = -1 OR v_monthly_credits >= 99999 THEN
        v_remaining_credits := 99999;
    ELSE
        v_remaining_credits := GREATEST(0, v_monthly_credits - v_consumed_credits);
    END IF;

    -- Dynamic resolution: Custom plan reads overrides, standard plans read live plan limits
    IF v_plan_key = 'custom' THEN
        v_pricing_mode := COALESCE(v_sub.custom_limits->>'bulk_edit_pricing_mode', v_plan_limits.bulk_edit_pricing_mode, 'per_item');
        v_per_op_cost := COALESCE((v_sub.custom_limits->>'bulk_edit_per_op_cost')::numeric, v_plan_limits.bulk_edit_per_op_cost, 5.00);
        v_per_item_cost := COALESCE((v_sub.custom_limits->>'bulk_edit_per_item_cost')::numeric, v_plan_limits.bulk_edit_per_item_cost, 1.00);
        v_max_cap := COALESCE((v_sub.custom_limits->>'bulk_edit_max_cap')::numeric, v_plan_limits.bulk_edit_max_cap, 50.00);
        v_excel_colors_cost := COALESCE((v_sub.custom_limits->>'excel_upload_colors_cost')::numeric, v_plan_limits.excel_upload_colors_cost, 1.00);
        v_excel_items_cost := COALESCE((v_sub.custom_limits->>'excel_upload_items_cost')::numeric, v_plan_limits.excel_upload_items_cost, 1.00);
        v_excel_stock_cost := COALESCE((v_sub.custom_limits->>'excel_upload_stock_cost')::numeric, v_plan_limits.excel_upload_stock_cost, 1.00);

        v_drive_pricing_mode := COALESCE(v_sub.custom_limits->>'drive_images_pricing_mode', v_plan_limits.drive_images_pricing_mode, 'per_operation');
        v_drive_per_op_cost := COALESCE((v_sub.custom_limits->>'drive_images_per_op_cost')::numeric, v_plan_limits.drive_images_per_op_cost, 10.00);
        v_drive_per_item_cost := COALESCE((v_sub.custom_limits->>'drive_images_per_item_cost')::numeric, v_plan_limits.drive_images_per_item_cost, 1.00);
        v_drive_max_cap := COALESCE((v_sub.custom_limits->>'drive_images_max_cap')::numeric, v_plan_limits.drive_images_max_cap, 30.00);
    ELSE
        v_pricing_mode := COALESCE(v_plan_limits.bulk_edit_pricing_mode, 'per_item');
        v_per_op_cost := COALESCE(v_plan_limits.bulk_edit_per_op_cost, 5.00);
        v_per_item_cost := COALESCE(v_plan_limits.bulk_edit_per_item_cost, 1.00);
        v_max_cap := COALESCE(v_plan_limits.bulk_edit_max_cap, 50.00);
        v_excel_colors_cost := COALESCE(v_plan_limits.excel_upload_colors_cost, 1.00);
        v_excel_items_cost := COALESCE(v_plan_limits.excel_upload_items_cost, 1.00);
        v_excel_stock_cost := COALESCE(v_plan_limits.excel_upload_stock_cost, 1.00);

        v_drive_pricing_mode := COALESCE(v_plan_limits.drive_images_pricing_mode, 'per_operation');
        v_drive_per_op_cost := COALESCE(v_plan_limits.drive_images_per_op_cost, 10.00);
        v_drive_per_item_cost := COALESCE(v_plan_limits.drive_images_per_item_cost, 1.00);
        v_drive_max_cap := COALESCE(v_plan_limits.drive_images_max_cap, 30.00);
    END IF;

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
        'excel_upload_stock_cost', v_excel_stock_cost,
        'drive_images_pricing_mode', v_drive_pricing_mode,
        'drive_images_per_op_cost', v_drive_per_op_cost,
        'drive_images_per_item_cost', v_drive_per_item_cost,
        'drive_images_max_cap', v_drive_max_cap
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-create deduct_excel_credits RPC supporting Drive Images operations
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

    SELECT * INTO v_plan_limits
    FROM public.subscription_plan_limits
    WHERE plan_key = v_base_plan_key;

    IF v_plan_limits.id IS NULL THEN
        SELECT * INTO v_plan_limits
        FROM public.subscription_plan_limits
        WHERE plan_key = 'semi_annual';
    END IF;

    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, v_plan_limits.monthly_excel_credits, 500);

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

    -- Dynamic resolution: resolve max cap based on operation type
    IF p_operation_type = 'drive_images_import' THEN
        IF v_plan_key = 'custom' THEN
            v_max_cap := COALESCE((v_sub.custom_limits->>'drive_images_max_cap')::numeric, v_plan_limits.drive_images_max_cap, 30.00);
        ELSE
            v_max_cap := COALESCE(v_plan_limits.drive_images_max_cap, 30.00);
        END IF;
    ELSE
        IF v_plan_key = 'custom' THEN
            v_max_cap := COALESCE((v_sub.custom_limits->>'bulk_edit_max_cap')::numeric, v_plan_limits.bulk_edit_max_cap, 50.00);
        ELSE
            v_max_cap := COALESCE(v_plan_limits.bulk_edit_max_cap, 50.00);
        END IF;
    END IF;

    IF p_pricing_mode = 'per_item' AND v_max_cap > 0 AND p_credits_to_deduct > v_max_cap THEN
        v_final_deduction := v_max_cap;
    ELSE
        v_final_deduction := p_credits_to_deduct;
    END IF;

    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);
    v_remaining := v_monthly_credits - v_consumed_credits;

    IF v_final_deduction > 0 AND v_remaining < v_final_deduction THEN
        RAISE EXCEPTION 'INSUFFICIENT_EXCEL_CREDITS: رصيد الكريديت الحالي (% كريديت) غير كافٍ لإتمام العملية (تتطلب % كريديت).', v_remaining, v_final_deduction
            USING ERRCODE = 'P0001';
    END IF;

    v_new_consumed := v_consumed_credits + v_final_deduction;
    v_remaining := v_monthly_credits - v_new_consumed;

    v_custom_limits := COALESCE(v_sub.custom_limits, '{}'::jsonb);
    v_custom_limits := jsonb_set(v_custom_limits, '{consumed_excel_credits}', to_jsonb(v_new_consumed));

    UPDATE public.subscriptions
    SET custom_limits = v_custom_limits
    WHERE id = v_sub.id;

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

GRANT EXECUTE ON FUNCTION public.get_tenant_credit_rules(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_excel_credits(uuid, uuid, text, text, text, numeric, integer, text) TO authenticated, anon, service_role;
