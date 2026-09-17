-- =========================================================================
-- 🚀 MIGRATION V99: MODEL DISCOUNT PRICING & EXTRA CLASSIFICATIONS (1 & 2)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-16
-- 💡 Description: 
--    1. Adds discount_price column to public.models.
--    2. Creates public.classifications_1 and public.classifications_2 tables
--       with full multi-tenant RLS isolation.
--    3. Adds classification_1_id and classification_2_id columns to public.models.
-- =========================================================================

-- 1. CLASSIFICATIONS 1 TABLE
CREATE TABLE IF NOT EXISTS public.classifications_1 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. CLASSIFICATIONS 2 TABLE
CREATE TABLE IF NOT EXISTS public.classifications_2 (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. RLS & GRANTS FOR CLASSIFICATIONS 1
ALTER TABLE public.classifications_1 ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classifications_1'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.classifications_1', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "classifications_1_select_policy" ON public.classifications_1 FOR SELECT USING (true);
CREATE POLICY "classifications_1_write_policy" ON public.classifications_1 FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.classifications_1 TO authenticated, anon, service_role;

-- 4. RLS & GRANTS FOR CLASSIFICATIONS 2
ALTER TABLE public.classifications_2 ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classifications_2'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.classifications_2', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "classifications_2_select_policy" ON public.classifications_2 FOR SELECT USING (true);
CREATE POLICY "classifications_2_write_policy" ON public.classifications_2 FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.classifications_2 TO authenticated, anon, service_role;

-- 5. ADD COLUMNS TO MODELS
DO $$
BEGIN
    -- discount_price
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'models' AND column_name = 'discount_price'
    ) THEN
        ALTER TABLE public.models ADD COLUMN discount_price numeric DEFAULT NULL;
    END IF;

    -- classification_1_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'models' AND column_name = 'classification_1_id'
    ) THEN
        ALTER TABLE public.models ADD COLUMN classification_1_id uuid REFERENCES public.classifications_1(id) ON DELETE SET NULL;
    END IF;

    -- classification_2_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'models' AND column_name = 'classification_2_id'
    ) THEN
        ALTER TABLE public.models ADD COLUMN classification_2_id uuid REFERENCES public.classifications_2(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_models_discount_price ON public.models(discount_price) WHERE discount_price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_models_classification_1 ON public.models(classification_1_id);
CREATE INDEX IF NOT EXISTS idx_models_classification_2 ON public.models(classification_2_id);
CREATE INDEX IF NOT EXISTS idx_classifications_1_tenant ON public.classifications_1(tenant_id);
CREATE INDEX IF NOT EXISTS idx_classifications_2_tenant ON public.classifications_2(tenant_id);
