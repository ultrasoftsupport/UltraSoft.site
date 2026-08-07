-- =========================================================================
-- 🚀 MIGRATION V66: BULK UPDATE MODELS RPC FUNCTION FOR ANONYMOUS/CUSTOM SESSIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-06
-- 💡 Description: Creates SECURITY DEFINER RPC function bulk_update_models to allow
--    atomic, secure bulk updates and deletions of models per tenant, bypassing RLS block
--    when custom/anonymous session keys are used.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_models(
    p_tenant_id uuid,
    p_action text,
    p_model_ids uuid[],
    p_value numeric DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_class_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_modified_count integer := 0;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'p_tenant_id parameter is required for bulk model updates.';
    END IF;

    IF p_model_ids IS NULL OR array_length(p_model_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'modified_count', 0);
    END IF;

    IF p_action = 'status_active' THEN
        UPDATE public.models
        SET is_active = true, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'status_inactive' THEN
        UPDATE public.models
        SET is_active = false, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'price_fixed' THEN
        UPDATE public.models
        SET price = p_value, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'price_increase' THEN
        UPDATE public.models
        SET price = price + p_value, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'price_decrease' THEN
        UPDATE public.models
        SET price = GREATEST(0, price - p_value), updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'price_percent_increase' THEN
        UPDATE public.models
        SET price = ROUND(price * (1 + p_value / 100.0)), updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'price_percent_decrease' THEN
        UPDATE public.models
        SET price = GREATEST(0, ROUND(price * (1 - p_value / 100.0))), updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'change_category' THEN
        UPDATE public.models
        SET category_id = p_category_id, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'change_class' THEN
        UPDATE public.models
        SET class_id = p_class_id, updated_at = NOW()
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);

    ELSIF p_action = 'delete_models' THEN
        DELETE FROM public.models
        WHERE id = ANY(p_model_ids)
          AND (tenant_id = p_tenant_id OR tenant_id IS NULL);
    ELSE
        RAISE EXCEPTION 'Unsupported bulk action: %', p_action;
    END IF;

    GET DIAGNOSTICS v_modified_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'modified_count', v_modified_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.bulk_update_models(uuid, text, uuid[], numeric, uuid, uuid) TO authenticated, anon, service_role;
