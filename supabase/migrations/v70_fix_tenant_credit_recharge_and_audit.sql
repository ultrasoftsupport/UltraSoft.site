-- =================================================================
-- Migration v70: Fix Tenant Credit Recharge Persistence & Audit Logging
-- =================================================================

CREATE OR REPLACE FUNCTION public.add_credits_to_tenant(
    p_tenant_id uuid,
    p_credits_to_add numeric,
    p_user_name text DEFAULT 'إدارة المنظومة (UltraSoft)'
)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_consumed_credits numeric;
    v_monthly_credits integer;
    v_new_monthly integer;
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

    -- 1. Increase the monthly excel credits limit by p_credits_to_add
    v_new_monthly := v_monthly_credits + p_credits_to_add::integer;
    v_remaining := GREATEST(0, v_new_monthly - v_consumed_credits);

    v_custom_limits := COALESCE(v_sub.custom_limits, '{}'::jsonb);
    v_custom_limits := jsonb_set(v_custom_limits, '{monthly_excel_credits}', to_jsonb(v_new_monthly));

    -- Permanently update subscription in database
    UPDATE public.subscriptions
    SET monthly_excel_credits = v_new_monthly,
        custom_limits = v_custom_limits
    WHERE id = v_sub.id;

    -- 2. Log credit addition in excel_credits_log (negative credits_deducted = addition)
    INSERT INTO public.excel_credits_log (
        tenant_id, user_id, user_name, operation_type, location_name,
        credits_deducted, items_count, pricing_mode, remaining_balance_after
    ) VALUES (
        p_tenant_id, auth.uid(), COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'), 'credit_recharge', 'شحن ودفع رصيد كريديت إضافي من الإدارة',
        -p_credits_to_add, 0, 'recharge', v_remaining
    );

    -- 3. Log credit addition in system_audit_logs for audit log tables
    INSERT INTO public.system_audit_logs (
        tenant_id, user_id, user_name, module, action_type, details
    ) VALUES (
        p_tenant_id,
        auth.uid(),
        COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'),
        'credits',
        'recharge',
        jsonb_build_object(
            'notes', FORMAT('شحن رصيد كريديت إضافي للمصنع بمقدار (+%s كريديت ⚡)', p_credits_to_add),
            'credits_added', p_credits_to_add,
            'credits_deducted', -p_credits_to_add,
            'old_monthly_credits', v_monthly_credits,
            'new_monthly_credits', v_new_monthly,
            'remaining_credits', v_remaining,
            'user_name', COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'),
            'user_role', 'Super Admin',
            'reason', 'دفع وشحن رصيد إضافي من إدارة المنظومة'
        )
    );

    RETURN jsonb_build_object('success', true, 'added', p_credits_to_add, 'new_monthly', v_new_monthly, 'remaining', v_remaining);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_credits_to_tenant(uuid, numeric, text) TO authenticated, anon, service_role;
