-- =========================================================================
-- 🚀 MIGRATION V46: ENHANCE SUBSCRIPTION PLANS, LIMITS & AUTO-EXPIRATION
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Adds max_orders & custom_limits to subscriptions, removes plan
--    check restriction for custom plans, and adds auto-expiration check function.
-- =========================================================================

-- 1. Add max_orders & custom_limits columns to public.subscriptions
ALTER TABLE public.subscriptions 
    ADD COLUMN IF NOT EXISTS max_orders integer DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS custom_limits jsonb DEFAULT '{}'::jsonb;

-- 2. Drop existing plan check constraints if present to allow custom plan names
DO $$ 
BEGIN 
    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
EXCEPTION 
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Create function to automatically suspend expired subscriptions
CREATE OR REPLACE FUNCTION public.super_admin_check_expired_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    -- Update subscriptions status to expired where end_date < now() and status = 'active'
    UPDATE public.subscriptions
    SET status = 'expired'
    WHERE end_date IS NOT NULL 
      AND end_date < NOW() 
      AND status = 'active';

    -- Update tenants status to suspended where associated active subscription has expired
    WITH expired_tenants AS (
        SELECT DISTINCT tenant_id 
        FROM public.subscriptions 
        WHERE status = 'expired' OR (end_date IS NOT NULL AND end_date < NOW())
    )
    UPDATE public.tenants
    SET status = 'suspended'
    WHERE id IN (SELECT tenant_id FROM expired_tenants)
      AND status = 'active'
      AND slug != 'default'; -- Exclude default master tenant from auto-suspension

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'suspended_count', v_count,
        'message', 'Checked and updated expired tenant subscriptions'
    );
END;
$$;

-- Grant execution to authenticated & anon roles
GRANT EXECUTE ON FUNCTION public.super_admin_check_expired_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_check_expired_subscriptions() TO anon;
GRANT EXECUTE ON FUNCTION public.super_admin_check_expired_subscriptions() TO service_role;
