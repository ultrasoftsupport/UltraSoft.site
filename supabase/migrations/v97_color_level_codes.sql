-- =====================================================================
-- v97: Color-Level Codes System
-- Adds support for per-color system_code and factory_code on models
-- that need different codes per color variant.
-- =====================================================================

-- 1. إضافة وضع تعيين الكود لجدول models
DO $$
BEGIN
    ALTER TABLE public.models
        ADD COLUMN IF NOT EXISTS code_assignment_mode TEXT
            DEFAULT 'standard'
            CHECK (code_assignment_mode IN ('standard', 'color_system_codes', 'color_factory_codes'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'code_assignment_mode column note: %', SQLERRM;
END $$;

-- 2. إضافة أعمدة الأكواد على مستوى اللون في model_inventory
DO $$
BEGIN
    ALTER TABLE public.model_inventory
        ADD COLUMN IF NOT EXISTS color_system_code TEXT,
        ADD COLUMN IF NOT EXISTS color_factory_code TEXT;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'color_level_codes columns note: %', SQLERRM;
END $$;

-- 3. إنشاء فهرس على color_system_code للبحث السريع
CREATE INDEX IF NOT EXISTS idx_model_inventory_color_system_code
    ON public.model_inventory(tenant_id, color_system_code)
    WHERE color_system_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_model_inventory_color_factory_code
    ON public.model_inventory(tenant_id, color_factory_code)
    WHERE color_factory_code IS NOT NULL;

-- 4. إزالة شرط NOT NULL من system_code لتمكين حفظ الموديل بدون كود سيستم عام في الوضع الجديد
DO $$
BEGIN
    ALTER TABLE public.models ALTER COLUMN system_code DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'system_code drop not null note: %', SQLERRM;
END $$;

-- 5. تحديث دالة التريجر auto_fill_models_factory_code لتعمل فقط في الوضع القياسي
CREATE OR REPLACE FUNCTION public.auto_fill_models_factory_code()
RETURNS TRIGGER AS $$
BEGIN
    -- ملء كود المصنع تلقائياً من كود السيستم فقط في الوضع القياسي
    IF COALESCE(NEW.code_assignment_mode, 'standard') = 'standard' THEN
        IF NEW.factory_code IS NULL OR TRIM(NEW.factory_code) = '' THEN
            NEW.factory_code := NEW.system_code;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 🔄 إعادة تحميل schema cache في PostgREST لضمان التعرف الفوري على الأعمدة الجديدة
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ملاحظة: 
-- code_assignment_mode = 'standard'             => النمط الحالي (الافتراضي)
-- code_assignment_mode = 'color_system_codes'   => كود النظام مختلف لكل لون،
--                                                  factory_code هو الكود الموحد للموديل
-- code_assignment_mode = 'color_factory_codes'  => كود المصنع مختلف لكل لون،
--                                                  system_code هو الكود الموحد للموديل
-- =====================================================================
