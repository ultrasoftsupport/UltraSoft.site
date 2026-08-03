-- =========================================================================
-- 🚀 MIGRATION V26: FIX ORDER_LOGS SCHEMA AND ADD MISSING COLUMNS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds 'notes', 'details', and 'tenant_id' columns to public.order_logs
--    to prevent PGRST204 column missing errors when recording order action logs.
-- =========================================================================

-- 1. Ensure table public.order_logs exists
CREATE TABLE IF NOT EXISTS public.order_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    user_id uuid,
    user_name text,
    action_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT order_logs_pkey PRIMARY KEY (id)
);

-- 2. Add 'notes' column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_logs' AND column_name = 'notes'
    ) THEN
        ALTER TABLE public.order_logs ADD COLUMN notes text;
    END IF;
END $$;

-- 3. Add 'details' column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_logs' AND column_name = 'details'
    ) THEN
        ALTER TABLE public.order_logs ADD COLUMN details text;
    END IF;
END $$;

-- 4. Add 'tenant_id' column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_logs' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.order_logs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Copy details into notes or vice versa for historical rows
UPDATE public.order_logs SET notes = details WHERE notes IS NULL AND details IS NOT NULL;
UPDATE public.order_logs SET details = notes WHERE details IS NULL AND notes IS NOT NULL;

-- 6. Populate tenant_id from parent orders table if missing
UPDATE public.order_logs ol
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE ol.order_id = o.id AND ol.tenant_id IS NULL;

UPDATE public.order_logs 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;
