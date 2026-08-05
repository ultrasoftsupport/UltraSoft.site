-- =========================================================================
-- 🚀 MIGRATION V57: FIX MODELS FACTORY_CODE & SUBSCRIPTION LIMITS TRIGGER
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description: Drops NOT NULL constraint from factory_code, auto fills factory_code
--    and enforces subscription model limits at Database level (skipping excess rows in batches).
-- =========================================================================

-- 1. Drop NOT NULL constraint from factory_code column
ALTER TABLE public.models ALTER COLUMN factory_code DROP NOT NULL;

-- 2. Trigger function to auto fill factory_code from system_code if blank
CREATE OR REPLACE FUNCTION public.auto_fill_models_factory_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.factory_code IS NULL OR TRIM(NEW.factory_code) = '' THEN
        NEW.factory_code := NEW.system_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_fill_models_factory_code ON public.models;
CREATE TRIGGER trg_auto_fill_models_factory_code
    BEFORE INSERT OR UPDATE ON public.models
    FOR EACH ROW EXECUTE FUNCTION public.auto_fill_models_factory_code();

-- 3. Trigger function to enforce subscription model limits at Database level
CREATE OR REPLACE FUNCTION public.check_model_subscription_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_max_products integer;
    v_current_count integer;
    v_active_count integer;
BEGIN
    -- جلب الحد الأقصى المسموح به للمصنع من جدول الاشتراكات
    SELECT max_products INTO v_max_products
    FROM public.subscriptions
    WHERE tenant_id = NEW.tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- إذا لم تكن هناك حدود أو الباقة غير محدودة (-1)
    IF v_max_products IS NULL OR v_max_products = -1 OR v_max_products >= 99999 THEN
        RETURN NEW;
    END IF;

    -- في حالة إضافة موديل جديد (INSERT)
    IF (TG_OP = 'INSERT') THEN
        SELECT count(*) INTO v_current_count
        FROM public.models
        WHERE tenant_id = NEW.tenant_id;

        IF v_current_count >= v_max_products THEN
            -- إرجاع NULL يتجاهل إضافة الصف الزائد دون إلغاء باقي الدفعة المسموح بها
            RETURN NULL;
        END IF;
    END IF;

    -- في حالة تفعيل موديل معطل (UPDATE is_active from false to true)
    IF (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL)) THEN
        SELECT count(*) INTO v_active_count
        FROM public.models
        WHERE tenant_id = NEW.tenant_id AND is_active = true AND id <> NEW.id;

        IF v_active_count >= v_max_products THEN
            NEW.is_active := false; -- إلغاء التفعيل تلقائياً عند مستوى قاعدة البيانات
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_model_subscription_limits ON public.models;
CREATE TRIGGER trg_check_model_subscription_limits
    BEFORE INSERT OR UPDATE ON public.models
    FOR EACH ROW EXECUTE FUNCTION public.check_model_subscription_limits();

-- 4. Fill any existing empty strings in factory_code
UPDATE public.models 
SET factory_code = system_code 
WHERE factory_code IS NULL OR TRIM(factory_code) = '';
