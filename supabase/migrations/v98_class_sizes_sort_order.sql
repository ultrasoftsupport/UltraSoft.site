-- =========================================================================
-- 🚀 MIGRATION V98: ADD SORT_ORDER TO CLASS_SIZES JUNCTION TABLE
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-16
-- 💡 Description: Adds sort_order column to public.class_sizes junction table 
--    so sizes within each age category (class) can be arranged in a logical,
--    custom order (e.g. S, M, L, XL or 2, 4, 6, 8) and sorted correctly everywhere.
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'class_sizes' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE public.class_sizes ADD COLUMN sort_order integer DEFAULT 0;
    END IF;
END $$;

-- Populate default sequential sort_order for existing records if all are 0
WITH ranked AS (
    SELECT class_id, size_id, ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY ctid ASC) AS rn
    FROM public.class_sizes
    WHERE sort_order = 0 OR sort_order IS NULL
)
UPDATE public.class_sizes cs
SET sort_order = ranked.rn
FROM ranked
WHERE cs.class_id = ranked.class_id AND cs.size_id = ranked.size_id;

-- Index for fast sorting by class and sort_order
CREATE INDEX IF NOT EXISTS idx_class_sizes_class_sort ON public.class_sizes(class_id, sort_order ASC);
