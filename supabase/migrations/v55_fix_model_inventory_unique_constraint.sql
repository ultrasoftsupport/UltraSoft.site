-- =========================================================================
-- 🚀 MIGRATION V55: FIX MODEL_INVENTORY - TENANT_ID + UNIQUE CONSTRAINT
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description:
--    يصلح مشكلتين:
--    1. PostgREST cache مش شايل عمود tenant_id رغم وجوده → NOTIFY pgrst
--    2. إضافة trigger يملأ tenant_id تلقائياً من models عند الإنشاء
--    3. إضافة unique constraint على (model_id, color_id) للـ upsert
-- =========================================================================

-- 1. التأكد من وجود عمود tenant_id في model_inventory
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'model_inventory'
        AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.model_inventory
        ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ تم إضافة عمود tenant_id إلى model_inventory';
    ELSE
        RAISE NOTICE 'ℹ️ عمود tenant_id موجود بالفعل';
    END IF;
END $$;

-- 2. ملء tenant_id الفارغة من جدول models
UPDATE public.model_inventory mi
SET tenant_id = m.tenant_id
FROM public.models m
WHERE mi.model_id = m.id AND mi.tenant_id IS NULL;

-- 3. إنشاء trigger يملأ tenant_id تلقائياً عند INSERT بدون قيمة
CREATE OR REPLACE FUNCTION public.auto_fill_model_inventory_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM public.models
        WHERE id = NEW.model_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_fill_model_inventory_tenant_id ON public.model_inventory;
CREATE TRIGGER trg_auto_fill_model_inventory_tenant_id
    BEFORE INSERT OR UPDATE ON public.model_inventory
    FOR EACH ROW EXECUTE FUNCTION public.auto_fill_model_inventory_tenant_id();

-- 4. إضافة unique constraint على (model_id, color_id)
DO $$
BEGIN
    ALTER TABLE public.model_inventory
        DROP CONSTRAINT IF EXISTS model_inventory_model_id_color_id_key;
    ALTER TABLE public.model_inventory
        DROP CONSTRAINT IF EXISTS model_inventory_unique_model_color;
    ALTER TABLE public.model_inventory
        DROP CONSTRAINT IF EXISTS model_inventory_model_color_unique;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Cleanup: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'model_inventory_model_color_unique'
        AND conrelid = 'public.model_inventory'::regclass
    ) THEN
        ALTER TABLE public.model_inventory
        ADD CONSTRAINT model_inventory_model_color_unique
        UNIQUE (model_id, color_id);
        RAISE NOTICE '✅ تم إنشاء unique constraint على (model_id, color_id)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint error: %', SQLERRM;
END $$;

-- 5. 🔄 إعادة تحميل schema cache في PostgREST
-- هذا يصلح مشكلة "column does not exist" رغم وجوده فعلاً
NOTIFY pgrst, 'reload schema';

