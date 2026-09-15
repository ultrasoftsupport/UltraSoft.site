-- =========================================================================
-- 🌟 MIGRATION V94: ENHANCE MODEL IMAGES WITH DRIVE METADATA & INDEXES 🌟
-- =========================================================================
-- Description: Adds optional drive_file_id, sort_order, and is_cover columns
-- to public.model_images, along with performance indexes for fast lookups.
-- =========================================================================

BEGIN;

-- 1. Add optional metadata columns to model_images
ALTER TABLE public.model_images 
    ADD COLUMN IF NOT EXISTS drive_file_id text,
    ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_cover boolean DEFAULT false;

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_model_images_model_id ON public.model_images(model_id);
CREATE INDEX IF NOT EXISTS idx_model_images_drive_file_id ON public.model_images(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_models_factory_code ON public.models(factory_code);

-- 3. Backfill drive_file_id from existing Google Drive image URLs (if any exist)
UPDATE public.model_images
SET drive_file_id = substring(image_url from 'id=([a-zA-Z0-9_-]+)')
WHERE drive_file_id IS NULL AND image_url LIKE '%id=%';

UPDATE public.model_images
SET drive_file_id = substring(image_url from '/d/([a-zA-Z0-9_-]+)')
WHERE drive_file_id IS NULL AND image_url LIKE '%/d/%';

COMMIT;
