-- =========================================================================
-- 🚀 MIGRATION V14: MULTI-TENANT PLATFORM FOUNDATION (PaaS / SaaS)
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds multi-tenancy core architecture: tenants table,
--    subscriptions table, tenant_id columns across all core tables,
--    default tenant backfill, and multi-tenant performance indexes.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. TENANTS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying NOT NULL,
    slug character varying NOT NULL CONSTRAINT tenants_slug_key UNIQUE,
    domain character varying CONSTRAINT tenants_domain_key UNIQUE,
    custom_domain character varying CONSTRAINT tenants_custom_domain_key UNIQUE,
    status character varying DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
    settings jsonb DEFAULT '{"theme": "dark", "currency": "EGP", "logo_url": "/logo.png"}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for fast lookup by domain and slug
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON public.tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON public.tenants(custom_domain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Seed Default Tenant (Main / Existing Factory)
INSERT INTO public.tenants (id, name, slug, domain, status, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'المصنع الرئيسي (Default Factory)',
    'default',
    'ultrasoft.site',
    'active',
    '{"theme": "dark", "currency": "EGP", "logo_url": "/logo.png"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;


-- -------------------------------------------------------------------------
-- 2. SUBSCRIPTIONS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan character varying NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
    max_products integer DEFAULT 500,
    max_users integer DEFAULT 10,
    start_date timestamp with time zone DEFAULT now(),
    end_date timestamp with time zone,
    status character varying DEFAULT 'active' CHECK (status IN ('active', 'expired', 'canceled')),
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.subscriptions(tenant_id);

-- Default subscription for the seed tenant
INSERT INTO public.subscriptions (tenant_id, plan, max_products, max_users, status)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'enterprise',
    99999,
    999,
    'active'
)
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------------------------
-- 3. ADD TENANT_ID TO CORE ENTITY TABLES (WITH DEFAULT BACKFILL)
-- -------------------------------------------------------------------------

-- Function to safely add tenant_id column and index to a table
CREATE OR REPLACE FUNCTION public.add_tenant_id_to_table(p_table text)
RETURNS void AS $$
BEGIN
    -- Check if column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = p_table 
          AND column_name = 'tenant_id'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE DEFAULT %L::uuid',
            p_table,
            '00000000-0000-0000-0000-000000000001'
        );
        
        -- Backfill existing NULLs to default tenant ID
        EXECUTE format(
            'UPDATE public.%I SET tenant_id = %L::uuid WHERE tenant_id IS NULL',
            p_table,
            '00000000-0000-0000-0000-000000000001'
        );

        -- Create index on tenant_id
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
            'idx_' || p_table || '_tenant_id',
            p_table
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply tenant_id to all core entities
SELECT public.add_tenant_id_to_table('categories');
SELECT public.add_tenant_id_to_table('classes');
SELECT public.add_tenant_id_to_table('sizes');
SELECT public.add_tenant_id_to_table('colors');
SELECT public.add_tenant_id_to_table('models');
SELECT public.add_tenant_id_to_table('system_users');
SELECT public.add_tenant_id_to_table('profiles');
SELECT public.add_tenant_id_to_table('orders');
SELECT public.add_tenant_id_to_table('invoices');
SELECT public.add_tenant_id_to_table('returns');
SELECT public.add_tenant_id_to_table('inbound_invoices');
SELECT public.add_tenant_id_to_table('stock_movements');
SELECT public.add_tenant_id_to_table('home_settings');
SELECT public.add_tenant_id_to_table('promo_cards');
SELECT public.add_tenant_id_to_table('themes');
SELECT public.add_tenant_id_to_table('system_notifications');
SELECT public.add_tenant_id_to_table('inventory_audits');
SELECT public.add_tenant_id_to_table('system_backups_log');

-- Clean up helper function
DROP FUNCTION IF EXISTS public.add_tenant_id_to_table(text);

-- -------------------------------------------------------------------------
-- 4. UPDATE SYSTEM USERS / PROFILES ROLES FOR MULTI-TENANCY
-- -------------------------------------------------------------------------
-- Allow roles: 'super_admin' (Platform owners), 'tenant_admin' / 'owner', 'manager', 'admin', 'worker', 'customer'
ALTER TABLE public.system_users DROP CONSTRAINT IF EXISTS system_users_role_check;
ALTER TABLE public.system_users ADD CONSTRAINT system_users_role_check 
    CHECK (role IN ('super_admin', 'tenant_admin', 'owner', 'admin', 'manager', 'worker', 'customer'));

-- For Super Admins, tenant_id can be NULL (giving cross-tenant super access)
ALTER TABLE public.system_users ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN tenant_id DROP NOT NULL;

-- -------------------------------------------------------------------------
-- 5. MULTI-TENANT HELPER FUNCTIONS IN SUPABASE
-- -------------------------------------------------------------------------

-- Function to fetch current tenant_id from auth user context or profile
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Try to get tenant_id from user metadata in JWT first
    v_tenant_id := NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid;
    
    IF v_tenant_id IS NOT NULL THEN
        RETURN v_tenant_id;
    END IF;

    -- Fallback: Look up from public.system_users or public.profiles
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id 
        FROM public.system_users 
        WHERE id = auth.uid();
        
        IF v_tenant_id IS NOT NULL THEN
            RETURN v_tenant_id;
        END IF;

        SELECT tenant_id INTO v_tenant_id 
        FROM public.profiles 
        WHERE id = auth.uid();
    END IF;

    -- Return default tenant if unauthenticated public store request
    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is a Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    -- Check in user metadata
    v_role := auth.jwt() -> 'user_metadata' ->> 'role';
    IF v_role = 'super_admin' THEN
        RETURN true;
    END IF;

    -- Check in system_users table
    SELECT role INTO v_role 
    FROM public.system_users 
    WHERE id = auth.uid();
    
    IF v_role = 'super_admin' THEN
        RETURN true;
    END IF;

    -- Check in profiles table
    SELECT role INTO v_role 
    FROM public.profiles 
    WHERE id = auth.uid();

    RETURN (v_role = 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
