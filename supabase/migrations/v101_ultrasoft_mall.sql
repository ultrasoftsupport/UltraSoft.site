-- =========================================================================
-- 🚀 MIGRATION V101: ULTRASOFT MALL & DEMO SHOWCASE ENGINE
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-17
-- 💡 Description: Adds mall columns to public.tenants, sets up global mall
--    configuration in system_platform_settings and home_settings, and ensures
--    public read access for mall tenants.
-- =========================================================================

-- 1. Add Mall columns to public.tenants
ALTER TABLE public.tenants 
    ADD COLUMN IF NOT EXISTS is_in_mall boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS mall_order integer DEFAULT 999,
    ADD COLUMN IF NOT EXISTS mall_featured boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS mall_settings jsonb DEFAULT '{}'::jsonb;

-- 2. Index for faster sorting and filtering in UltraSoft Mall
CREATE INDEX IF NOT EXISTS idx_tenants_mall_active 
    ON public.tenants (is_in_mall, status, mall_order ASC);

-- 3. Seed default Mall configuration in system_platform_settings if table exists
DO $$
BEGIN
    IF to_regclass('public.system_platform_settings') IS NOT NULL THEN
        INSERT INTO public.system_platform_settings (setting_key, setting_value, description, updated_at)
        VALUES (
            'ultrasoft_mall_config',
            '{
                "enabled": true,
                "title": "UltraSoft Mall",
                "subtitle": "الملتقى الرقمي الأول لكبرى مصانع وشركات الملابس الجاهزة",
                "hero_badge": "ULTRASOFT ECOSYSTEM",
                "banner_url": "",
                "primary_color": "#0284c7"
            }'::jsonb,
            'إعدادات منصة مول ألترا سوفت الرقمي للمصانع والشركات',
            now()
        )
        ON CONFLICT (setting_key) DO NOTHING;
    END IF;
END $$;

-- 4. Sync default Mall configuration into home_settings for backwards compatibility
INSERT INTO public.home_settings (tenant_id, setting_key, setting_value)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'mall_enabled', 'true'),
    ('00000000-0000-0000-0000-000000000001', 'mall_title', 'UltraSoft Mall'),
    ('00000000-0000-0000-0000-000000000001', 'mall_subtitle', 'الملتقى الرقمي الأول لكبرى مصانع وشركات الملابس الجاهزة')
ON CONFLICT (tenant_id, setting_key) DO NOTHING;

-- 5. Enable public read access for tenants participating in the mall
-- Notice: public visitors need to view participating active factories in the mall
DO $$
BEGIN
    DROP POLICY IF EXISTS "public_read_mall_tenants" ON public.tenants;
    CREATE POLICY "public_read_mall_tenants" 
        ON public.tenants 
        FOR SELECT 
        TO public 
        USING (status = 'active' AND (is_in_mall = true OR slug = 'default'));
EXCEPTION
    WHEN OTHERS THEN
        -- Keep existing policies if any constraint conflict
        NULL;
END $$;
