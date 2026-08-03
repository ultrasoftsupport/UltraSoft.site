-- =========================================================================
-- 🚀 MIGRATION V16: EXPANDED TENANT COMPANY PROFILES & DOMAINS SCHEMA
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds rich company metadata (legal name, tax_number, contact info,
--    industry, commercial register), domain management table, and enhanced subscription modules.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ADD RICH COMPANY DETAILS TO PUBLIC.TENANTS
-- -------------------------------------------------------------------------
ALTER TABLE public.tenants 
    ADD COLUMN IF NOT EXISTS legal_name text,
    ADD COLUMN IF NOT EXISTS company_type text DEFAULT 'factory',
    ADD COLUMN IF NOT EXISTS description text,
    ADD COLUMN IF NOT EXISTS logo_url text,
    ADD COLUMN IF NOT EXISTS email text,
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS mobile text,
    ADD COLUMN IF NOT EXISTS whatsapp text,
    ADD COLUMN IF NOT EXISTS tax_number text,
    ADD COLUMN IF NOT EXISTS commercial_register text,
    ADD COLUMN IF NOT EXISTS industry text DEFAULT 'garments',
    ADD COLUMN IF NOT EXISTS founded_at date,
    ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Africa/Cairo',
    ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP';

-- Update seed tenant with rich company details
UPDATE public.tenants 
SET 
    legal_name = 'شركة ألترا سوفت للحلول البرمجية والمصانع',
    company_type = 'factory',
    description = 'المصنع الرئيسي التجريبي الخاص بالنظام',
    industry = 'صناعة وتجارة الملابس الجاهزة',
    currency = 'EGP',
    timezone = 'Africa/Cairo'
WHERE slug = 'default';


-- -------------------------------------------------------------------------
-- 2. ENHANCE PUBLIC.SUBSCRIPTIONS TABLE WITH MODULES & STORAGE
-- -------------------------------------------------------------------------
ALTER TABLE public.subscriptions 
    ADD COLUMN IF NOT EXISTS trial_until timestamp with time zone,
    ADD COLUMN IF NOT EXISTS max_storage_mb integer DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS enabled_modules jsonb DEFAULT '["inventory", "orders", "showroom", "invoices", "returns", "audits"]'::jsonb;


-- -------------------------------------------------------------------------
-- 3. CREATE DEDICATED DOMAINS TABLE (PUBLIC.TENANT_DOMAINS)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subdomain character varying NOT NULL CONSTRAINT tenant_domains_subdomain_key UNIQUE,
    custom_domain character varying CONSTRAINT tenant_domains_custom_domain_key UNIQUE,
    is_primary boolean DEFAULT true,
    ssl_enabled boolean DEFAULT true,
    verified boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Indexes for domain lookups
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON public.tenant_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_subdomain ON public.tenant_domains(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_custom ON public.tenant_domains(custom_domain);

-- Seed domain for default tenant
INSERT INTO public.tenant_domains (tenant_id, subdomain, is_primary, ssl_enabled, verified)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'default',
    true,
    true,
    true
)
ON CONFLICT (subdomain) DO NOTHING;


-- -------------------------------------------------------------------------
-- 4. RLS POLICIES FOR TENANT_DOMAINS
-- -------------------------------------------------------------------------
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_domains_select ON public.tenant_domains;
CREATE POLICY tenant_domains_select ON public.tenant_domains
    FOR SELECT
    USING (
        public.is_super_admin() = true 
        OR tenant_id = public.current_tenant_id()
        OR verified = true
    );

DROP POLICY IF EXISTS tenant_domains_admin_all ON public.tenant_domains;
CREATE POLICY tenant_domains_admin_all ON public.tenant_domains
    FOR ALL
    USING (public.is_super_admin() = true);
