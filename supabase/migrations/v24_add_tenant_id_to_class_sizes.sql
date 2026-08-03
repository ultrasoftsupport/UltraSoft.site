-- =========================================================================
-- 🚀 MIGRATION V24: ADD TENANT_ID TO CLASS_SIZES JUNCTION TABLE
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds tenant_id column to public.class_sizes junction table 
--    so PostgREST API accepts tenant_id on insertion and enforces full 
--    multi-tenant isolation for age-group sizes mappings.
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'class_sizes' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.class_sizes ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Populate missing tenant_id in class_sizes from parent classes table
UPDATE public.class_sizes cs
SET tenant_id = c.tenant_id
FROM public.classes c
WHERE cs.class_id = c.id AND cs.tenant_id IS NULL;

-- Default fallback
UPDATE public.class_sizes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
