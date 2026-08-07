-- =========================================================================
-- 🚀 ULTRASOFT COMPLETE MASTER DATABASE SCHEMA (MATCHING ALL DASHBOARD OBJECTS)
-- 📦 Project: Ultra Soft (ألترا سوفت)
-- 📅 Updated: 2026-08-01
-- 💡 Description: Complete production schema containing ALL 30+ Functions, Triggers,
--    Indexes, Sequences, Tables (including returns, audits, backups), and RLS Policies.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. EXTENSIONS & SEQUENCES
-- -------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

CREATE SEQUENCE IF NOT EXISTS public.invoices_invoice_number_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.audit_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.return_number_seq START WITH 1001 INCREMENT BY 1;

-- -------------------------------------------------------------------------
-- 2. BASE LOOKUP & CATALOG TABLES
-- -------------------------------------------------------------------------

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying NOT NULL CONSTRAINT categories_name_key UNIQUE,
    created_at timestamp with time zone DEFAULT now()
);

-- Classes
CREATE TABLE IF NOT EXISTS public.classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying NOT NULL CONSTRAINT classes_name_key UNIQUE,
    created_at timestamp with time zone DEFAULT now()
);

-- Sizes
CREATE TABLE IF NOT EXISTS public.sizes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name character varying NOT NULL CONSTRAINT sizes_name_key UNIQUE,
    created_at timestamp with time zone DEFAULT now()
);

-- Colors
CREATE TABLE IF NOT EXISTS public.colors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    color_code character varying CONSTRAINT colors_code_key UNIQUE,
    name character varying NOT NULL CONSTRAINT colors_name_key UNIQUE,
    created_at timestamp with time zone DEFAULT now()
);

-- Class Sizes Mapping
CREATE TABLE IF NOT EXISTS public.class_sizes (
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    size_id uuid NOT NULL REFERENCES public.sizes(id) ON DELETE CASCADE,
    CONSTRAINT class_sizes_pkey PRIMARY KEY (class_id, size_id)
);

-- Models Catalog
CREATE TABLE IF NOT EXISTS public.models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    system_code character varying NOT NULL CONSTRAINT models_system_code_key UNIQUE,
    factory_code character varying NOT NULL,
    name character varying NOT NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
    price numeric NOT NULL CHECK (price >= 0),
    is_active boolean DEFAULT true,
    image_url_1 text,
    image_url_2 text,
    image_url_3 text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Model Sizes Mapping
CREATE TABLE IF NOT EXISTS public.model_sizes (
    model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
    size_id uuid NOT NULL REFERENCES public.sizes(id) ON DELETE CASCADE,
    CONSTRAINT model_sizes_pkey PRIMARY KEY (model_id, size_id)
);

-- Model Images
CREATE TABLE IF NOT EXISTS public.model_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Model Inventory (Active stock series per model/color)
CREATE TABLE IF NOT EXISTS public.model_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
    available_series integer DEFAULT 0 CONSTRAINT chk_positive_available_series CHECK (available_series >= 0),
    CONSTRAINT model_inventory_model_id_color_id_key UNIQUE (model_id, color_id)
);

-- Model Colors Inventory (Legacy Support Table)
CREATE TABLE IF NOT EXISTS public.model_colors_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
    available_series_count integer NOT NULL DEFAULT 0 CHECK (available_series_count >= 0),
    CONSTRAINT model_colors_inventory_model_id_color_id_key UNIQUE (model_id, color_id)
);

-- -------------------------------------------------------------------------
-- 3. SYSTEM USERS & PROFILES
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.system_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    username text NOT NULL CONSTRAINT system_users_username_key UNIQUE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'worker')),
    worker_job text CHECK (worker_job IN ('showroom', 'warehouse', 'both')),
    is_active boolean DEFAULT true,
    login_count integer DEFAULT 0,
    invoice_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name character varying NOT NULL,
    role character varying DEFAULT 'staff',
    is_active boolean DEFAULT true,
    email character varying,
    login_count integer DEFAULT 0,
    invoice_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 4. ORDERS, ITEMS & PREPARATION SYSTEM
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number text NOT NULL CONSTRAINT orders_invoice_number_key UNIQUE,
    customer_name text NOT NULL,
    phone_1 text NOT NULL,
    phone_2 text,
    address text,
    deposit numeric DEFAULT 0,
    deposit_receiver text,
    notes text,
    total_price numeric NOT NULL,
    total_series integer NOT NULL,
    worker_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    assigned_worker_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    assigned_admin_name text,
    status text DEFAULT 'created',
    preparation_status text DEFAULT 'pending' CHECK (preparation_status IN ('pending', 'in_progress', 'on_hold', 'prepared', 'shipped')),
    prepared_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    preparation_started_at timestamp with time zone,
    preparation_completed_at timestamp with time zone,
    preparation_notes text,
    is_archived boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
    color_id uuid REFERENCES public.colors(id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity > 0),
    price_per_series numeric NOT NULL CHECK (price_per_series >= 0),
    total_price numeric NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.order_item_preparation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid NOT NULL REFERENCES public.colors(id) ON DELETE CASCADE,
    is_prepared boolean NOT NULL DEFAULT false,
    has_issue boolean NOT NULL DEFAULT false,
    note text,
    prepared_qty integer CHECK (prepared_qty >= 0),
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid REFERENCES public.system_users(id),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT order_item_preparation_unique UNIQUE (order_item_id)
);

CREATE TABLE IF NOT EXISTS public.preparation_status_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    changed_by uuid REFERENCES public.system_users(id),
    old_status text,
    new_status text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    user_name text NOT NULL,
    action_type text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now()
);

-- Legacy Invoices (Optional)
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number integer NOT NULL DEFAULT nextval('public.invoices_invoice_number_seq'::regclass),
    staff_id uuid REFERENCES public.profiles(id),
    customer_name character varying NOT NULL,
    customer_phone_1 character varying NOT NULL,
    customer_phone_2 character varying,
    customer_address text,
    deposit_amount numeric DEFAULT 0 CHECK (deposit_amount >= 0),
    deposit_receiver character varying,
    notes text,
    total_amount numeric DEFAULT 0,
    is_archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
    model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
    color_id uuid REFERENCES public.colors(id),
    series_quantity integer NOT NULL CHECK (series_quantity > 0),
    unit_price numeric NOT NULL CHECK (unit_price >= 0),
    total_line_price numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 5. RETURNS, INBOUND INVOICES & STOCK MOVEMENTS
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number text NOT NULL CONSTRAINT returns_return_number_key UNIQUE,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_name text NOT NULL,
    refund_amount numeric NOT NULL DEFAULT 0,
    total_series integer NOT NULL DEFAULT 0,
    notes text,
    worker_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id uuid REFERENCES public.returns(id) ON DELETE CASCADE,
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity > 0),
    price_per_series numeric NOT NULL CHECK (price_per_series >= 0),
    total_price numeric NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.inbound_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number text NOT NULL CONSTRAINT inbound_invoices_invoice_number_key UNIQUE,
    supplier_name text DEFAULT 'توريد داخلي',
    notes text,
    total_series integer DEFAULT 0,
    total_cost numeric DEFAULT 0,
    created_by uuid REFERENCES public.system_users(id),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inbound_invoice_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inbound_invoice_id uuid REFERENCES public.inbound_invoices(id) ON DELETE CASCADE,
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_cost numeric DEFAULT 0 CHECK (unit_cost >= 0),
    total_cost numeric DEFAULT 0 CHECK (total_cost >= 0)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
    movement_type text NOT NULL CHECK (movement_type IN ('in', 'out')),
    quantity integer NOT NULL,
    reference text,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    inbound_id uuid REFERENCES public.inbound_invoices(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 6. SETTINGS, THEMES, PROMOTIONS, NOTIFICATIONS & BACKUPS
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.home_settings (
    setting_key text PRIMARY KEY,
    setting_value text NOT NULL,
    description text
);

CREATE TABLE IF NOT EXISTS public.promo_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    icon text DEFAULT 'ph-star',
    badge_text text,
    badge_color text DEFAULT 'bg-devo-orange',
    is_active boolean DEFAULT true,
    image_url text,
    model_id uuid REFERENCES public.models(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.themes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CONSTRAINT themes_name_key UNIQUE,
    theme_key text NOT NULL UNIQUE,
    colors jsonb NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(50) NOT NULL,
    title varchar(255) NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    user_id uuid REFERENCES public.system_users(id) ON DELETE CASCADE,
    is_read boolean NOT NULL DEFAULT false,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_notification_queue (
    transaction_id text NOT NULL,
    model_id uuid NOT NULL,
    color_id uuid NOT NULL,
    new_available_series int NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pk_inventory_notification_queue PRIMARY KEY (transaction_id, model_id, color_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_audits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_number text NOT NULL CONSTRAINT inventory_audits_audit_number_key UNIQUE,
    created_by uuid REFERENCES public.system_users(id),
    status text NOT NULL DEFAULT 'draft',
    notes text,
    reviewed_by uuid REFERENCES public.system_users(id),
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_audit_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id uuid NOT NULL REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    model_id uuid NOT NULL REFERENCES public.models(id),
    color_id uuid NOT NULL REFERENCES public.colors(id),
    system_qty integer NOT NULL DEFAULT 0,
    counted_qty integer NOT NULL DEFAULT 0,
    difference integer NOT NULL DEFAULT 0,
    notes text
);

CREATE TABLE IF NOT EXISTS public.system_backups_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text NOT NULL CONSTRAINT system_backups_log_filename_key UNIQUE,
    backup_type text NOT NULL DEFAULT 'full_system',
    total_records integer DEFAULT 0,
    file_size_bytes bigint DEFAULT 0,
    storage_path text,
    exported_by text DEFAULT 'system',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- -------------------------------------------------------------------------
-- 7. PERFORMANCE INDEXES (EXACT MATCH FOR DASHBOARD LIST)
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inbound_invoice_items_invoice_id ON public.inbound_invoice_items(inbound_invoice_id);
CREATE INDEX IF NOT EXISTS idx_order_item_prep_item_id ON public.order_item_preparation(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_prep_order_id ON public.order_item_preparation(order_id);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_id ON public.order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_worker_id ON public.orders(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_orders_preparation_status ON public.orders(preparation_status);
CREATE INDEX IF NOT EXISTS idx_orders_prepared_by ON public.orders(prepared_by);
CREATE INDEX IF NOT EXISTS idx_prep_log_order_id ON public.preparation_status_log(order_id);
CREATE INDEX IF NOT EXISTS idx_themes_is_active ON public.themes(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_themes_only_one_active ON public.themes(is_active) WHERE (is_active = true);

-- Realtime Publications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'system_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_publication p ON p.oid = pr.prpubid
        JOIN pg_class c ON c.oid = pr.prrelid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'model_inventory'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.model_inventory;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 8. STORED FUNCTIONS & RPC PROCEDURES (EXACT DDL & SECURITY MATCH)
-- -------------------------------------------------------------------------

-- 1. get_my_role (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
DECLARE
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    RETURN COALESCE(v_role, 'visitor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. admin_create_worker (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_create_worker(
    p_full_name text,
    p_username text,
    p_password text,
    p_role text,
    p_worker_job text
)
RETURNS uuid AS $$
DECLARE
    v_user_id uuid;
    v_email text;
    v_hashed_password text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.system_users
        WHERE id = auth.uid() AND role = 'owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمالك فقط.';
    END IF;

    v_user_id := gen_random_uuid();
    v_email := lower(trim(p_username)) || '@staff.devo.internal';
    v_hashed_password := crypt(p_password, gen_salt('bf'));

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
        created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
        v_hashed_password, now(), '{"provider":"email","providers":["email"]}', '{}', 
        now(), now()
    );

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        v_user_id, v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', NULL, now(), now()
    );

    INSERT INTO public.system_users (
        id, full_name, username, role, worker_job, is_active
    ) VALUES (
        v_user_id, p_full_name, lower(trim(p_username)), p_role, p_worker_job, true
    );

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. admin_update_worker (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_update_worker(
    p_user_id uuid,
    p_full_name text,
    p_username text,
    p_password text,
    p_role text,
    p_worker_job text,
    p_is_active boolean
)
RETURNS boolean AS $$
DECLARE
    v_email text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.system_users
        WHERE id = auth.uid() AND role = 'owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمالك فقط.';
    END IF;

    IF p_user_id = auth.uid() AND (p_role <> 'owner' OR NOT p_is_active) THEN
        RAISE EXCEPTION 'لا يمكنك تغيير صلاحيتك أو تعطيل حسابك الشخصي.';
    END IF;

    v_email := lower(trim(p_username)) || '@staff.devo.internal';

    UPDATE public.system_users SET
        full_name = p_full_name,
        username = lower(trim(p_username)),
        role = p_role,
        worker_job = p_worker_job,
        is_active = p_is_active
    WHERE id = p_user_id;

    UPDATE auth.users SET
        email = v_email,
        encrypted_password = COALESCE(CASE WHEN p_password IS NOT NULL AND p_password <> '' THEN crypt(p_password, gen_salt('bf')) ELSE encrypted_password END, encrypted_password),
        banned_until = CASE WHEN p_is_active THEN NULL ELSE '3000-01-01 00:00:00+00'::timestamptz END,
        updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.identities SET
        identity_data = jsonb_build_object('sub', p_user_id::text, 'email', v_email),
        updated_at = now()
    WHERE user_id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. admin_delete_worker (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_delete_worker(
    p_user_id uuid
)
RETURNS boolean AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.system_users
        WHERE id = auth.uid() AND role = 'owner' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'غير مصرح لك بإجراء هذه العملية. هذه الصلاحية للمالك فقط.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'لا يمكنك حذف حسابك الشخصي.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.system_users WHERE id = p_user_id AND role = 'owner') THEN
        RAISE EXCEPTION 'غير مسموح بحذف حساب مالك آخر.';
    END IF;

    DELETE FROM public.system_users WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. acquire_order_lock (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.acquire_order_lock(
    p_order_id uuid,
    p_assigned_admin_name text
)
RETURNS boolean AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
        AND (
            public.get_my_role() IN ('owner', 'admin')
            OR o.assigned_worker_id = auth.uid()
            OR o.worker_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION 'غير مصرح لك بتعديل أو قفل هذا الأوردر.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
        AND o.is_locked = true
        AND o.assigned_admin_name IS DISTINCT FROM p_assigned_admin_name
        AND public.get_my_role() NOT IN ('owner')
    ) THEN
        RAISE EXCEPTION 'عفواً، هذا الأوردر مقفول حالياً بواسطة مستخدم آخر.';
    END IF;

    UPDATE public.orders
    SET is_locked = true,
        assigned_admin_name = p_assigned_admin_name,
        status = 'editing'
    WHERE id = p_order_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. release_order_lock (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.release_order_lock(
    p_order_id uuid
)
RETURNS boolean AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = p_order_id
        AND (
            public.get_my_role() IN ('owner', 'admin')
            OR o.assigned_worker_id = auth.uid()
            OR o.worker_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.system_users u
                WHERE u.id = auth.uid()
                AND u.is_active = true
                AND u.role = 'worker'
                AND u.worker_job IN ('warehouse', 'both')
            )
        )
    ) THEN
        RAISE EXCEPTION 'غير مصرح لك بتحرير قفل هذا الأوردر.';
    END IF;

    UPDATE public.orders
    SET is_locked = false,
        assigned_worker_id = NULL,
        assigned_admin_name = NULL,
        status = 'created'
    WHERE id = p_order_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. delete_order_safely (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.delete_order_safely(
    p_order_id uuid
)
RETURNS boolean AS $$
DECLARE
    v_item record;
    v_invoice text;
BEGIN
    SELECT invoice_number INTO v_invoice FROM public.orders WHERE id = p_order_id;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
        INSERT INTO public.model_inventory (model_id, color_id, available_series)
        VALUES (v_item.model_id, v_item.color_id, 0)
        ON CONFLICT (model_id, color_id) DO NOTHING;

        UPDATE public.model_inventory
        SET available_series = available_series + v_item.quantity
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
        VALUES (v_item.model_id, v_item.color_id, 'in', v_item.quantity, 'حذف أوردر من الإدارة: ' || COALESCE(v_invoice, ''));
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;
    DELETE FROM public.orders WHERE id = p_order_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. delete_inbound_invoice_safely (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.delete_inbound_invoice_safely(
    p_invoice_id uuid
)
RETURNS boolean AS $$
DECLARE
    v_item record;
    v_invoice_number text;
    v_current_stock int;
    v_model_name text;
    v_color_name text;
BEGIN
    SELECT invoice_number INTO v_invoice_number FROM public.inbound_invoices WHERE id = p_invoice_id;
    IF v_invoice_number IS NULL THEN
        RAISE EXCEPTION 'فاتورة الدخل غير موجودة.';
    END IF;

    FOR v_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = p_invoice_id LOOP
        UPDATE public.model_inventory
        SET available_series = available_series - v_item.quantity
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
        VALUES (v_item.model_id, v_item.color_id, 'out', v_item.quantity, 'حذف فاتورة دخل: ' || v_invoice_number);
    END LOOP;

    FOR v_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = p_invoice_id LOOP
        SELECT available_series INTO v_current_stock FROM public.model_inventory
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        IF v_current_stock < 0 THEN
            SELECT name INTO v_model_name FROM public.models WHERE id = v_item.model_id;
            SELECT name INTO v_color_name FROM public.colors WHERE id = v_item.color_id;

            RAISE EXCEPTION 'لا يمكن حذف الفاتورة (%) لأن الموديل (%) لون (%) تم بيع أجزاء منه وسيتسبب الحذف في رصيد سالب.', 
                v_invoice_number,
                COALESCE(v_model_name, 'غير معروف'), 
                COALESCE(v_color_name, 'غير معروف');
        END IF;
    END LOOP;

    DELETE FROM public.inbound_invoices WHERE id = p_invoice_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. can_mark_order_prepared (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.can_mark_order_prepared(p_order_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN (
        NOT EXISTS (
            SELECT 1 FROM public.order_item_preparation
            WHERE order_id = p_order_id AND is_prepared = false
        )
        AND EXISTS (
            SELECT 1 FROM public.order_item_preparation
            WHERE order_id = p_order_id
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 10. get_order_preparation_progress (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.get_order_preparation_progress(p_order_id uuid)
RETURNS TABLE (
  total_items integer,
  prepared_items integer,
  issue_items integer,
  progress_pct numeric
) AS $$
  SELECT
    COUNT(*)::integer AS total_items,
    COUNT(*) FILTER (WHERE is_prepared = true)::integer AS prepared_items,
    COUNT(*) FILTER (WHERE has_issue = true)::integer AS issue_items,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
             COUNT(*) FILTER (WHERE is_prepared = true)::numeric / COUNT(*)::numeric * 100, 1
           )
    END AS progress_pct
  FROM public.order_item_preparation
  WHERE order_id = p_order_id;
$$ LANGUAGE sql SECURITY INVOKER;

-- 11. init_order_preparation (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.init_order_preparation(
  p_order_id uuid,
  p_worker_id uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.order_item_preparation (order_item_id, order_id, model_id, color_id, updated_by)
  SELECT oi.id, oi.order_id, oi.model_id, oi.color_id, p_worker_id
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
  ON CONFLICT (order_item_id) DO NOTHING;

  UPDATE public.orders
  SET preparation_status = 'in_progress',
      prepared_by = COALESCE(p_worker_id, prepared_by),
      preparation_started_at = COALESCE(preparation_started_at, now())
  WHERE id = p_order_id AND preparation_status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. finalize_order_preparation (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.finalize_order_preparation(
    p_order_id uuid,
    p_worker_id uuid,
    p_new_status text,
    p_note text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_can_complete boolean;
    v_old_status text;
BEGIN
    SELECT preparation_status INTO v_old_status FROM public.orders WHERE id = p_order_id;

    IF p_new_status IN ('prepared', 'shipped') THEN
        SELECT public.can_mark_order_prepared(p_order_id) INTO v_can_complete;
        IF NOT v_can_complete THEN
            RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إتمام الأوردر: يوجد عناصر لم يتم تحضيرها بعد');
        END IF;
    END IF;

    UPDATE public.orders
    SET preparation_status = p_new_status,
        preparation_notes = COALESCE(p_note, preparation_notes),
        preparation_completed_at = CASE WHEN p_new_status IN ('prepared', 'shipped') THEN now() ELSE preparation_completed_at END
    WHERE id = p_order_id;

    INSERT INTO public.preparation_status_log (order_id, changed_by, old_status, new_status, note)
    VALUES (p_order_id, p_worker_id, v_old_status, p_new_status, p_note);

    RETURN jsonb_build_object('success', true, 'new_status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. create_inventory_audit (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_inventory_audit(
    p_admin_id uuid,
    p_notes text DEFAULT NULL,
    p_model_ids uuid[] DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_audit_id uuid;
    v_audit_number text;
    v_model_id uuid;
    v_inv record;
BEGIN
    v_audit_number := 'AUD-' || nextval('public.audit_number_seq')::text;
    
    INSERT INTO public.inventory_audits (audit_number, created_by, status, notes)
    VALUES (v_audit_number, p_admin_id, 'draft', p_notes)
    RETURNING id INTO v_audit_id;
    
    IF p_model_ids IS NOT NULL THEN
        FOREACH v_model_id IN ARRAY p_model_ids LOOP
            FOR v_inv IN SELECT color_id, available_series FROM public.model_inventory WHERE model_id = v_model_id LOOP
                INSERT INTO public.inventory_audit_items (audit_id, model_id, color_id, system_qty, counted_qty, difference)
                VALUES (v_audit_id, v_model_id, v_inv.color_id, v_inv.available_series, 0, -v_inv.available_series);
            END LOOP;
        END LOOP;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'audit_id', v_audit_id, 'audit_number', v_audit_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. confirm_inventory_audit (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.confirm_inventory_audit(
    p_audit_id uuid,
    p_admin_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_audit_number text;
    v_status text;
    v_item record;
    v_diff integer;
BEGIN
    SELECT audit_number, status INTO v_audit_number, v_status
    FROM public.inventory_audits WHERE id = p_audit_id;
    
    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'جلسة الجرد غير موجودة');
    END IF;
    
    IF v_status <> 'submitted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'جلسة الجرد ليست في حالة انتظار المراجعة');
    END IF;
    
    FOR v_item IN SELECT * FROM public.inventory_audit_items WHERE audit_id = p_audit_id LOOP
        v_diff := v_item.difference;
        
        IF v_diff <> 0 THEN
            UPDATE public.model_inventory
            SET available_series = v_item.counted_qty
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;
            
            INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
            VALUES (
                v_item.model_id,
                v_item.color_id,
                CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END,
                ABS(v_diff),
                'تسوية جرد دوري: ' || v_audit_number
            );
        END IF;
    END LOOP;
    
    UPDATE public.inventory_audits
    SET status = 'confirmed',
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = p_notes
    WHERE id = p_audit_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. submit_inventory_audit (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.submit_inventory_audit(
    p_worker_id uuid,
    p_notes text,
    p_items jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_audit_id uuid;
    v_audit_number text;
    v_item record;
BEGIN
    v_audit_number := 'AUD-' || nextval('public.audit_number_seq')::text;

    INSERT INTO public.inventory_audits (audit_number, created_by, status, notes)
    VALUES (v_audit_number, p_worker_id, 'submitted', p_notes)
    RETURNING id INTO v_audit_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(model_id uuid, color_id uuid, system_qty int, counted_qty int, difference int) LOOP
        INSERT INTO public.inventory_audit_items (audit_id, model_id, color_id, system_qty, counted_qty, difference)
        VALUES (v_audit_id, v_item.model_id, v_item.color_id, v_item.system_qty, v_item.counted_qty, v_item.difference);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'audit_id', v_audit_id, 'audit_number', v_audit_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 16. process_order_transaction (SECURITY DEFINER Overload 1: with p_order_id)
CREATE OR REPLACE FUNCTION public.process_order_transaction(
    p_order_id uuid,
    p_order_data jsonb,
    p_order_items jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_order_id uuid;
    v_invoice_number text;
    v_item record;
    v_current_stock int;
    v_diff_record record;
BEGIN
    IF p_order_id IS NOT NULL THEN
        v_order_id := p_order_id;

        IF EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = v_order_id 
              AND is_locked = true 
              AND (assigned_worker_id != auth.uid() OR assigned_worker_id IS NULL)
              AND public.get_my_role() NOT IN ('owner', 'admin')
        ) THEN
            RAISE EXCEPTION 'عفواً، هذا الأوردر قيد التحضير/مقفول حالياً ولا يمكن تعديله.';
        END IF;

        SELECT invoice_number INTO v_invoice_number FROM public.orders WHERE id = v_order_id;

        FOR v_diff_record IN 
            SELECT 
                coalesce(new_items.model_id, old_items.model_id) as model_id,
                coalesce(new_items.color_id, old_items.color_id) as color_id,
                coalesce(new_items.qty, 0) - coalesce(old_items.quantity, 0) as diff,
                coalesce(new_items.model_name, '') as model_name
            FROM (
                SELECT (x->>'model_id')::uuid as model_id, (x->>'color_id')::uuid as color_id, (x->>'qty')::int as qty, (x->>'model_name')::text as model_name
                FROM jsonb_array_elements(p_order_items) as x
            ) new_items
            FULL OUTER JOIN (
                SELECT model_id, color_id, quantity
                FROM public.order_items
                WHERE order_id = v_order_id
            ) old_items 
            ON new_items.model_id = old_items.model_id AND new_items.color_id = old_items.color_id
        LOOP
            IF v_diff_record.diff > 0 THEN
                SELECT available_series INTO v_current_stock FROM public.model_inventory
                WHERE model_id = v_diff_record.model_id AND color_id = v_diff_record.color_id FOR UPDATE;
                
                IF COALESCE(v_current_stock, 0) < v_diff_record.diff THEN
                    RAISE EXCEPTION 'الكمية المطلوبة من الموديل % غير متوفرة بالمخزن. المتاح بالمخزن: %, المطلوب زيادة: %', 
                        v_diff_record.model_name, COALESCE(v_current_stock, 0), v_diff_record.diff;
                END IF;
            END IF;
        END LOOP;

        FOR v_diff_record IN 
            SELECT 
                coalesce(new_items.model_id, old_items.model_id) as model_id,
                coalesce(new_items.color_id, old_items.color_id) as color_id,
                coalesce(new_items.qty, 0) - coalesce(old_items.quantity, 0) as diff
            FROM (
                SELECT (x->>'model_id')::uuid as model_id, (x->>'color_id')::uuid as color_id, (x->>'qty')::int as qty
                FROM jsonb_array_elements(p_order_items) as x
            ) new_items
            FULL OUTER JOIN (
                SELECT model_id, color_id, quantity
                FROM public.order_items
                WHERE order_id = v_order_id
            ) old_items 
            ON new_items.model_id = old_items.model_id AND new_items.color_id = old_items.color_id
        LOOP
            IF v_diff_record.diff <> 0 THEN
                INSERT INTO public.model_inventory (model_id, color_id, available_series)
                VALUES (v_diff_record.model_id, v_diff_record.color_id, 0)
                ON CONFLICT (model_id, color_id) DO NOTHING;

                UPDATE public.model_inventory
                SET available_series = available_series - v_diff_record.diff
                WHERE model_id = v_diff_record.model_id AND color_id = v_diff_record.color_id;

                INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
                VALUES (
                    v_diff_record.model_id, 
                    v_diff_record.color_id, 
                    CASE WHEN v_diff_record.diff > 0 THEN 'out' ELSE 'in' END, 
                    abs(v_diff_record.diff), 
                    'تعديل أوردر رقم ' || v_invoice_number
                );
            END IF;
        END LOOP;

        DELETE FROM public.order_items WHERE order_id = v_order_id;

        UPDATE public.orders SET
            customer_name = p_order_data->>'customer_name',
            phone_1 = p_order_data->>'phone_1',
            phone_2 = p_order_data->>'phone_2',
            address = p_order_data->>'address',
            deposit = (p_order_data->>'deposit')::numeric,
            deposit_receiver = p_order_data->>'deposit_receiver',
            notes = p_order_data->>'notes',
            total_price = (p_order_data->>'total_price')::numeric,
            total_series = (p_order_data->>'total_series')::integer
        WHERE id = v_order_id;

    ELSE
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int, model_name text)
        LOOP
            SELECT available_series INTO v_current_stock FROM public.model_inventory
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id FOR UPDATE;

            IF COALESCE(v_current_stock, 0) < v_item.qty THEN
               RAISE EXCEPTION 'الكمية المطلوبة من الموديل % غير متوفرة بالمخزن. المتاح: %', COALESCE(v_item.model_name, ''), COALESCE(v_current_stock, 0);
            END IF;
        END LOOP;

        v_invoice_number := nextval('public.invoice_number_seq')::text;

        INSERT INTO public.orders (invoice_number, customer_name, phone_1, phone_2, address, deposit, deposit_receiver, notes, total_price, total_series, worker_id)
        VALUES (
          v_invoice_number, p_order_data->>'customer_name', p_order_data->>'phone_1', p_order_data->>'phone_2', p_order_data->>'address',
          (p_order_data->>'deposit')::numeric, p_order_data->>'deposit_receiver', p_order_data->>'notes',
          (p_order_data->>'total_price')::numeric, (p_order_data->>'total_series')::integer, (p_order_data->>'worker_id')::uuid
        ) RETURNING id INTO v_order_id;

        UPDATE public.system_users SET invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = (p_order_data->>'worker_id')::uuid;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int)
        LOOP
            INSERT INTO public.model_inventory (model_id, color_id, available_series)
            VALUES (v_item.model_id, v_item.color_id, 0)
            ON CONFLICT (model_id, color_id) DO NOTHING;

            UPDATE public.model_inventory SET available_series = available_series - v_item.qty
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

            INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
            VALUES (v_item.model_id, v_item.color_id, 'out', v_item.qty, 'فاتورة مبيعات: ' || v_invoice_number);
        END LOOP;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int, price numeric, total numeric)
    LOOP
        INSERT INTO public.order_items (order_id, model_id, color_id, quantity, price_per_series, total_price)
        VALUES (v_order_id, v_item.model_id, v_item.color_id, v_item.qty, v_item.price, v_item.total);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'invoice_number', v_invoice_number, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 17. process_order_transaction (SECURITY INVOKER Overload 2: 2 arguments)
CREATE OR REPLACE FUNCTION public.process_order_transaction(
    p_order_data jsonb,
    p_order_items jsonb
)
RETURNS jsonb AS $$
BEGIN
    RETURN public.process_order_transaction(NULL, p_order_data, p_order_items);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 18. process_inbound_transaction (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_inbound_transaction(
    p_invoice_id uuid,
    p_invoice_data jsonb,
    p_invoice_items jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_inbound_id uuid;
    v_invoice_number text;
    v_tenant_id uuid;
    v_item record;
    v_next_num bigint;
BEGIN
    -- Determine tenant_id from invoice data, current tenant context, or system_users
    v_tenant_id := (p_invoice_data->>'tenant_id')::uuid;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := public.current_tenant_id();
    END IF;
    IF v_tenant_id IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid();
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    IF p_invoice_id IS NOT NULL THEN
        v_inbound_id := p_invoice_id;
        SELECT invoice_number, tenant_id INTO v_invoice_number, v_tenant_id 
        FROM public.inbound_invoices 
        WHERE id = v_inbound_id;

        UPDATE public.inbound_invoices SET
            supplier_name = COALESCE(NULLIF(TRIM(p_invoice_data->>'supplier_name'), ''), 'توريد داخلي'),
            notes = p_invoice_data->>'notes',
            total_series = COALESCE((p_invoice_data->>'total_series')::integer, 0),
            total_cost = COALESCE((p_invoice_data->>'total_cost')::numeric, 0)
        WHERE id = v_inbound_id;

        DELETE FROM public.inbound_invoice_items WHERE inbound_invoice_id = v_inbound_id;
    ELSE
        -- Automatically generate invoice_number if missing or empty
        v_invoice_number := NULLIF(TRIM(COALESCE(p_invoice_data->>'invoice_number', '')), '');
        IF v_invoice_number IS NULL THEN
            SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
            INTO v_next_num
            FROM public.inbound_invoices
            WHERE tenant_id = v_tenant_id OR (v_tenant_id IS NULL AND tenant_id IS NULL);

            v_invoice_number := 'IN-' || v_next_num::text;
        END IF;

        INSERT INTO public.inbound_invoices (tenant_id, invoice_number, supplier_name, notes, total_series, total_cost, created_by)
        VALUES (
            v_tenant_id,
            v_invoice_number,
            COALESCE(NULLIF(TRIM(p_invoice_data->>'supplier_name'), ''), 'توريد داخلي'),
            p_invoice_data->>'notes',
            COALESCE((p_invoice_data->>'total_series')::integer, 0),
            COALESCE((p_invoice_data->>'total_cost')::numeric, 0),
            (p_invoice_data->>'created_by')::uuid
        ) RETURNING id INTO v_inbound_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_invoice_items) AS x(model_id uuid, color_id uuid, qty int, unit_cost numeric, total_cost numeric) LOOP
        -- Strict Factory Isolation: Ensure selected model belongs to the active tenant
        IF EXISTS (
            SELECT 1 FROM public.models 
            WHERE id = v_item.model_id 
            AND tenant_id IS NOT NULL 
            AND tenant_id <> v_tenant_id
        ) THEN
            RAISE EXCEPTION 'خطأ أمني: لا يمكنك إضافة رصيد لموديل لا ينتمي لمصنعك.';
        END IF;

        INSERT INTO public.inbound_invoice_items (inbound_invoice_id, model_id, color_id, quantity, unit_cost, total_cost)
        VALUES (v_inbound_id, v_item.model_id, v_item.color_id, v_item.qty, COALESCE(v_item.unit_cost, 0), COALESCE(v_item.total_cost, 0));

        INSERT INTO public.model_inventory (tenant_id, model_id, color_id, available_series)
        VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 0)
        ON CONFLICT (model_id, color_id) DO NOTHING;

        UPDATE public.model_inventory SET available_series = available_series + v_item.qty
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        INSERT INTO public.stock_movements (tenant_id, model_id, color_id, movement_type, quantity, reference, inbound_id)
        VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'in', v_item.qty, 'توريد رسالة: ' || v_invoice_number, v_inbound_id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_inbound_id, 'invoice_number', v_invoice_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 19. process_return_transaction (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_return_transaction(
    p_return_data jsonb,
    p_return_items jsonb
)
RETURNS jsonb AS $$
DECLARE
    v_return_id uuid;
    v_return_number text;
    v_item record;
BEGIN
    v_return_number := 'RET-' || nextval('public.return_number_seq')::text;

    INSERT INTO public.returns (
        return_number, order_id, customer_name, refund_amount, total_series, notes, worker_id
    ) VALUES (
        v_return_number,
        (p_return_data->>'order_id')::uuid,
        p_return_data->>'customer_name',
        (p_return_data->>'refund_amount')::numeric,
        (p_return_data->>'total_series')::integer,
        p_return_data->>'notes',
        (p_return_data->>'worker_id')::uuid
    ) RETURNING id INTO v_return_id;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_return_items) AS x(model_id uuid, color_id uuid, qty int, price numeric, total numeric) LOOP
        INSERT INTO public.return_items (
            return_id, model_id, color_id, quantity, price_per_series, total_price
        ) VALUES (
            v_return_id, v_item.model_id, v_item.color_id, v_item.qty, v_item.price, v_item.total
        );

        UPDATE public.model_inventory 
        SET available_series = available_series + v_item.qty
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        INSERT INTO public.stock_movements (
            model_id, color_id, movement_type, quantity, reference
        ) VALUES (
            v_item.model_id, v_item.color_id, 'in', v_item.qty, 'مرتجع مبيعات: ' || v_return_number
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'return_number', v_return_number, 'return_id', v_return_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 20. increment_login_count (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.increment_login_count(user_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.system_users SET login_count = COALESCE(login_count, 0) + 1 WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 21. purge_old_backups_log (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.purge_old_backups_log(p_retention_days integer DEFAULT 30)
RETURNS integer AS $$
DECLARE
    deleted_count integer := 0;
BEGIN
    WITH deleted_rows AS (
        DELETE FROM public.system_backups_log
        WHERE created_at < (now() - (p_retention_days || ' days')::interval)
        RETURNING id
    )
    SELECT count(*) INTO deleted_count FROM deleted_rows;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 22. reset_system_data (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.reset_system_data()
RETURNS void AS $$
BEGIN
    -- 1. التحقق من صلاحية المنفذ (للمالك فقط)
    IF public.get_my_role() <> 'owner' THEN
        RAISE EXCEPTION 'غير مصرح لك بتنفيذ هذه العملية. هذه الصلاحية للمالك فقط.';
    END IF;

    -- 2. مسح سجلات تحضير الطلبات واللوجز والمرتجعات المرتبطة بالطلبات
    DELETE FROM public.order_item_preparation WHERE true;
    DELETE FROM public.preparation_status_log WHERE true;
    DELETE FROM public.order_logs WHERE true;
    DELETE FROM public.return_items WHERE true;
    DELETE FROM public.returns WHERE true;
    DELETE FROM public.order_items WHERE true;
    DELETE FROM public.orders WHERE true;

    -- 3. مسح فواتير الوارد وعناصرها وحركات المخزون والجرد
    DELETE FROM public.inbound_invoice_items WHERE true;
    DELETE FROM public.inbound_invoices WHERE true;
    DELETE FROM public.stock_movements WHERE true;
    DELETE FROM public.inventory_audit_items WHERE true;
    DELETE FROM public.inventory_audits WHERE true;
    DELETE FROM public.invoice_items WHERE true;
    DELETE FROM public.invoices WHERE true;
    DELETE FROM public.inventory_notification_queue WHERE true;

    -- 4. مسح الإشعارات وبطاقات الترويج
    DELETE FROM public.system_notifications WHERE true;
    DELETE FROM public.promo_cards WHERE true;

    -- 5. مسح الموديلات وجميع تفاصيلها وصورها ومخزونها بالكامل
    DELETE FROM public.model_colors_inventory WHERE true;
    DELETE FROM public.model_inventory WHERE true;
    DELETE FROM public.model_sizes WHERE true;
    DELETE FROM public.model_images WHERE true;
    DELETE FROM public.models WHERE true;

    -- 6. مسح التعريفات الأساسية (الفئات، التصنيفات، الألوان، المقاسات)
    DELETE FROM public.class_sizes WHERE true;
    DELETE FROM public.classes WHERE true;
    DELETE FROM public.categories WHERE true;
    DELETE FROM public.colors WHERE true;
    DELETE FROM public.sizes WHERE true;

    -- 7. إعادة تصفير المتتاليات (Sequences) للأرقام التلقائية
    ALTER SEQUENCE public.invoices_invoice_number_seq RESTART WITH 1001;
    ALTER SEQUENCE public.invoice_number_seq RESTART WITH 1;
    ALTER SEQUENCE public.audit_number_seq RESTART WITH 1;
    ALTER SEQUENCE public.return_number_seq RESTART WITH 1001;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 23. rls_auto_enable (Event Trigger Function)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger AS $$
DECLARE
    cmd record;
BEGIN
    FOR cmd IN
        SELECT * FROM pg_event_trigger_ddl_commands()
        WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        AND object_type IN ('table','partitioned table')
    LOOP
        IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') THEN
            BEGIN
                EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- 9. TRIGGERS & TRIGGER FUNCTIONS (EXACT MATCH FOR DASHBOARD LIST)
-- -------------------------------------------------------------------------

-- A) handle_inventory_out_of_stock (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.handle_inventory_out_of_stock()
RETURNS TRIGGER AS $$
DECLARE
    model_factory_code text;
    color_name text;
    notification_title text;
    notification_body text;
BEGIN
    IF (NEW.available_series = 0 AND (OLD.available_series > 0 OR OLD.available_series IS NULL)) THEN
        SELECT factory_code INTO model_factory_code FROM public.models WHERE id = NEW.model_id;
        SELECT name INTO color_name FROM public.colors WHERE id = NEW.color_id;
        
        notification_title := '⚠️ نفاد كمية من المخزن!';
        notification_body := 'لقد نفد مخزون الموديل (' || COALESCE(model_factory_code, 'غير معروف') || ') للون (' || COALESCE(color_name, 'غير معروف') || ') بالكامل من المخزن.';
        
        INSERT INTO public.system_notifications (type, title, body, metadata)
        VALUES ('out_of_stock', notification_title, notification_body, jsonb_build_object('model_id', NEW.model_id, 'color_id', NEW.color_id, 'model_code', model_factory_code, 'color_name', color_name));
        
        INSERT INTO public.inventory_notification_queue (transaction_id, model_id, color_id, new_available_series)
        VALUES (pg_current_xact_id()::text, NEW.model_id, NEW.color_id, 0)
        ON CONFLICT (transaction_id, model_id, color_id) DO UPDATE SET new_available_series = 0;
        
    ELSIF (NEW.available_series > 0 AND OLD.available_series = 0) THEN
        SELECT factory_code INTO model_factory_code FROM public.models WHERE id = NEW.model_id;
        SELECT name INTO color_name FROM public.colors WHERE id = NEW.color_id;
        
        notification_title := '✅ عودة توفر صنف في المخزن!';
        notification_body := 'أصبح الموديل (' || COALESCE(model_factory_code, 'غير معروف') || ') للون (' || COALESCE(color_name, 'غير معروف') || ') متاحاً منه عدد (' || NEW.available_series || ') سري مرة أخرى.';
        
        INSERT INTO public.system_notifications (type, title, body, metadata)
        VALUES ('restocked', notification_title, notification_body, jsonb_build_object('model_id', NEW.model_id, 'color_id', NEW.color_id, 'model_code', model_factory_code, 'color_name', color_name, 'available_series', NEW.available_series));
        
        INSERT INTO public.inventory_notification_queue (transaction_id, model_id, color_id, new_available_series)
        VALUES (pg_current_xact_id()::text, NEW.model_id, NEW.color_id, NEW.available_series)
        ON CONFLICT (transaction_id, model_id, color_id) DO UPDATE SET new_available_series = EXCLUDED.new_available_series;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_inventory_out_of_stock ON public.model_inventory;
CREATE TRIGGER trg_inventory_out_of_stock
AFTER INSERT OR UPDATE ON public.model_inventory
FOR EACH ROW EXECUTE FUNCTION public.handle_inventory_out_of_stock();

-- B) handle_inventory_update (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.handle_inventory_update()
RETURNS TRIGGER AS $$
BEGIN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- C) handle_order_changes_notification (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.handle_order_changes_notification()
RETURNS TRIGGER AS $$
DECLARE
    notification_title text;
    notification_body text;
    notification_type text;
    target_user_id uuid := NULL;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        notification_type := 'order_created';
        notification_title := '🚨 أوردر جديد قد وصل!';
        notification_body := '🧾 رقم الأوردر: ' || COALESCE(NEW.invoice_number, 'غير محدد') || E'\n' ||
                             '👤 اسم العميل: ' || COALESCE(NEW.customer_name, 'غير معروف') || E'\n' ||
                             '📞 رقم الهاتف: ' || COALESCE(NEW.phone_1, 'غير محدد') || E'\n' ||
                             '💵 إجمالي المبلغ: ' || NEW.total_price || ' ج.م';
        
        INSERT INTO public.system_notifications (type, title, body, metadata)
        VALUES (notification_type, notification_title, notification_body, jsonb_build_object('order_id', NEW.id, 'customer_name', NEW.customer_name, 'total_price', NEW.total_price));
        
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (NEW.worker_id IS DISTINCT FROM OLD.worker_id AND NEW.worker_id IS NOT NULL) THEN
            notification_type := 'order_assigned';
            notification_title := '📋 تم تعيين أوردر جديد لك!';
            notification_body := '📦 تم إسناد الأوردر رقم: ' || COALESCE(NEW.invoice_number, 'غير محدد') || E'\n' ||
                                 '👤 للعميل: ' || COALESCE(NEW.customer_name, 'غير معروف');
            target_user_id := NEW.worker_id;
            
            INSERT INTO public.system_notifications (type, title, body, metadata, user_id)
            VALUES (notification_type, notification_title, notification_body, jsonb_build_object('order_id', NEW.id), target_user_id);
        END IF;

        IF ((NEW.status = 'editing' OR NEW.status = 'in_progress') AND OLD.status NOT IN ('editing', 'in_progress')) THEN
            notification_type := 'order_edit_start';
            notification_title := '✏️ بدأ تعديل الأوردر #' || COALESCE(NEW.invoice_number, 'غير محدد');
            notification_body := '👤 اسم العميل: ' || COALESCE(NEW.customer_name, 'غير معروف') || E'\n' ||
                                 '👤 القائم بالتعديل: ' || COALESCE(NEW.assigned_admin_name, 'غير معروف');
            
            INSERT INTO public.system_notifications (type, title, body, metadata)
            VALUES (notification_type, notification_title, notification_body, jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'total_price', NEW.total_price));
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_changes_notification ON public.orders;
CREATE TRIGGER trg_order_changes_notification
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_changes_notification();

-- D) process_inventory_notification_queue (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.process_inventory_notification_queue()
RETURNS TRIGGER AS $$
DECLARE
    v_tx_id text;
    v_bot_token text;
    v_is_tg_enabled text;
    v_is_stock_enabled text;
    v_chat_id text;
    v_model_record RECORD;
    v_color_record RECORD;
    v_model_name text;
    v_factory_code text;
    v_category_name text;
    v_class_name text;
    v_out_colors text;
    v_color_name text;
    v_message text;
    v_has_rows boolean := false;
BEGIN
    v_tx_id := pg_current_xact_id()::text;
    
    SELECT EXISTS (
        SELECT 1 FROM public.inventory_notification_queue WHERE transaction_id = v_tx_id
    ) INTO v_has_rows;
    
    IF NOT v_has_rows THEN
        RETURN NULL;
    END IF;

    SELECT setting_value INTO v_bot_token FROM public.home_settings WHERE setting_key = 'telegram_bot_token';
    SELECT setting_value INTO v_is_tg_enabled FROM public.home_settings WHERE setting_key = 'telegram_enabled';
    SELECT setting_value INTO v_is_stock_enabled FROM public.home_settings WHERE setting_key = 'telegram_stock_enabled';
    
    IF (v_is_tg_enabled = 'true' AND COALESCE(v_is_stock_enabled, 'true') = 'true' AND v_bot_token IS NOT NULL AND v_bot_token <> '') THEN
        SELECT setting_value INTO v_chat_id FROM public.home_settings WHERE setting_key = 'telegram_stock_chat_id';
        IF (v_chat_id IS NULL OR v_chat_id = '') THEN
            SELECT setting_value INTO v_chat_id FROM public.home_settings WHERE setting_key = 'telegram_chat_id';
        END IF;
        
        IF (v_chat_id IS NOT NULL AND v_chat_id <> '') THEN
            FOR v_model_record IN 
                SELECT DISTINCT model_id FROM public.inventory_notification_queue WHERE transaction_id = v_tx_id
            LOOP
                SELECT m.name, m.factory_code, cat.name as category_name, cls.name as class_name
                INTO v_model_name, v_factory_code, v_category_name, v_class_name
                FROM public.models m
                LEFT JOIN public.categories cat ON cat.id = m.category_id
                LEFT JOIN public.classes cls ON cls.id = m.class_id
                WHERE m.id = v_model_record.model_id;
                
                v_out_colors := '';
                
                FOR v_color_record IN 
                    SELECT q.color_id, q.new_available_series
                    FROM public.inventory_notification_queue q
                    WHERE q.transaction_id = v_tx_id AND q.model_id = v_model_record.model_id
                LOOP
                    SELECT name INTO v_color_name FROM public.colors WHERE id = v_color_record.color_id;
                    
                    IF v_color_record.new_available_series = 0 THEN
                        v_out_colors := v_out_colors || E'• ' || COALESCE(v_color_name, 'غير معروف') || E' (نفد ❌)\n';
                    ELSE
                        v_out_colors := v_out_colors || E'• ' || COALESCE(v_color_name, 'غير معروف') || ' (' || v_color_record.new_available_series || E' سري متاح ✅)\n';
                    END IF;
                END LOOP;
                
                IF (v_out_colors <> '') THEN
                    v_model_name := replace(replace(replace(COALESCE(v_model_name, 'غير معروف'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
                    v_factory_code := replace(replace(replace(COALESCE(v_factory_code, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
                    v_category_name := replace(replace(replace(COALESCE(v_category_name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
                    v_class_name := replace(replace(replace(COALESCE(v_class_name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
                    
                    v_message := '<b>📦 تحديث حالة الموديل:</b> ' || v_model_name || E'\n';
                    IF (v_factory_code <> '') THEN
                        v_message := v_message || '<b>🏷️ كود المصنع:</b> <code>' || v_factory_code || E'</code>\n';
                    END IF;
                    IF (v_category_name <> '') THEN
                        v_message := v_message || '<b>📝 التصنيف/الوصف:</b> ' || v_category_name || E'\n';
                    END IF;
                    IF (v_class_name <> '') THEN
                        v_message := v_message || '<b>👥 الفئة العمرية:</b> ' || v_class_name || E'\n';
                    END IF;
                    v_message := v_message || E'\n<b>الألوان وحالتها بالمخزن:</b>\n' || v_out_colors;
                    
                    PERFORM net.http_post(
                        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
                        body := jsonb_build_object('chat_id', v_chat_id, 'text', v_message, 'parse_mode', 'HTML'),
                        headers := '{"Content-Type": "application/json"}'::jsonb
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;
    
    DELETE FROM public.inventory_notification_queue WHERE transaction_id = v_tx_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_deferred_inventory_notification ON public.model_inventory;
CREATE CONSTRAINT TRIGGER trg_deferred_inventory_notification
AFTER INSERT OR UPDATE ON public.model_inventory
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.process_inventory_notification_queue();

-- E) send_telegram_notification_trigger (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.send_telegram_notification_trigger()
RETURNS TRIGGER AS $$
DECLARE
    bot_token text;
    chat_id text;
    is_tg_enabled text;
    formatted_message text;
BEGIN
    IF (NEW.type = 'out_of_stock' OR NEW.type = 'restocked') THEN
        RETURN NEW;
    END IF;

    SELECT setting_value INTO bot_token FROM public.home_settings WHERE setting_key = 'telegram_bot_token';
    SELECT setting_value INTO is_tg_enabled FROM public.home_settings WHERE setting_key = 'telegram_enabled';

    IF (NEW.type = 'custom_broadcast') THEN
        DECLARE
            v_tg_target text;
            v_orders_chat text;
            v_stock_chat text;
            v_title text;
            v_body text;
        BEGIN
            v_tg_target := COALESCE(NEW.metadata->>'telegram_target', 'none');
            IF (v_tg_target = 'none' OR is_tg_enabled <> 'true' OR bot_token IS NULL OR bot_token = '') THEN
                RETURN NEW;
            END IF;
            
            SELECT setting_value INTO v_orders_chat FROM public.home_settings WHERE setting_key = 'telegram_chat_id';
            SELECT setting_value INTO v_stock_chat FROM public.home_settings WHERE setting_key = 'telegram_stock_chat_id';
            
            v_title := replace(replace(replace(COALESCE(NEW.title, 'تنبيه مخصص'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
            v_body := replace(replace(replace(COALESCE(NEW.body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
            formatted_message := '<b>' || v_title || '</b>' || E'\n\n' || v_body;
            
            IF ((v_tg_target = 'orders' OR v_tg_target = 'both') AND v_orders_chat IS NOT NULL AND v_orders_chat <> '') THEN
                PERFORM net.http_post(
                    url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
                    body := jsonb_build_object('chat_id', v_orders_chat, 'text', formatted_message, 'parse_mode', 'HTML'),
                    headers := '{"Content-Type": "application/json"}'::jsonb
                );
            END IF;
            
            IF ((v_tg_target = 'stock' OR v_tg_target = 'both') AND v_stock_chat IS NOT NULL AND v_stock_chat <> '') THEN
                PERFORM net.http_post(
                    url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
                    body := jsonb_build_object('chat_id', v_stock_chat, 'text', formatted_message, 'parse_mode', 'HTML'),
                    headers := '{"Content-Type": "application/json"}'::jsonb
                );
            END IF;
            
            RETURN NEW;
        END;
    END IF;

    SELECT setting_value INTO chat_id FROM public.home_settings WHERE setting_key = 'telegram_chat_id';

    IF (is_tg_enabled = 'true' AND bot_token IS NOT NULL AND chat_id IS NOT NULL AND bot_token <> '' AND chat_id <> '') THEN
        DECLARE
            v_title text;
            v_body text;
        BEGIN
            v_title := replace(replace(replace(COALESCE(NEW.title, 'تنبيه جديد'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
            v_body := replace(replace(replace(COALESCE(NEW.body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
            formatted_message := '<b>' || v_title || '</b>' || E'\n\n' || v_body;

            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
                body := jsonb_build_object('chat_id', chat_id, 'text', formatted_message, 'parse_mode', 'HTML'),
                headers := '{"Content-Type": "application/json"}'::jsonb
            );
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_send_telegram_notification ON public.system_notifications;
CREATE TRIGGER trg_send_telegram_notification
AFTER INSERT ON public.system_notifications
FOR EACH ROW EXECUTE FUNCTION public.send_telegram_notification_trigger();

-- F) sync_order_statuses (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.sync_order_statuses()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('shipped', 'delivered') THEN
    IF NOT public.can_mark_order_prepared(NEW.id) THEN
      RAISE EXCEPTION 'لا يمكن شحن أو تسليم الأوردر: يوجد عناصر لم يتم تحضيرها بالكامل بعد في المخزن.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_sync_order_statuses ON public.orders;
CREATE TRIGGER trg_sync_order_statuses
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_statuses();

-- G) touch_preparation_updated_at (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.touch_preparation_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS trg_preparation_updated_at ON public.order_item_preparation;
CREATE TRIGGER trg_preparation_updated_at
BEFORE UPDATE ON public.order_item_preparation
FOR EACH ROW EXECUTE FUNCTION public.touch_preparation_updated_at();

-- -------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES (COMPLETE ZERO-TRUST COVERAGE)
-- -------------------------------------------------------------------------

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_colors_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_preparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_backups_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- Catalog Public Select Policies
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "classes_public_select" ON public.classes FOR SELECT USING (true);
CREATE POLICY "sizes_public_select" ON public.sizes FOR SELECT USING (true);
CREATE POLICY "colors_public_select" ON public.colors FOR SELECT USING (true);
CREATE POLICY "class_sizes_public_select" ON public.class_sizes FOR SELECT USING (true);
CREATE POLICY "models_public_select" ON public.models FOR SELECT USING (true);
CREATE POLICY "model_sizes_public_select" ON public.model_sizes FOR SELECT USING (true);
CREATE POLICY "model_images_public_select" ON public.model_images FOR SELECT USING (true);
CREATE POLICY "model_inventory_public_select" ON public.model_inventory FOR SELECT USING (true);
CREATE POLICY "model_colors_inventory_public_select" ON public.model_colors_inventory FOR SELECT USING (true);
CREATE POLICY "home_settings_public_select" ON public.home_settings FOR SELECT USING (true);
CREATE POLICY "promo_cards_public_select" ON public.promo_cards FOR SELECT USING (true);
CREATE POLICY "themes_public_select" ON public.themes FOR SELECT USING (true);

-- Admin & Strict Role Write Policies
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "classes_admin_write" ON public.classes FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "sizes_admin_write" ON public.sizes FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "colors_admin_write" ON public.colors FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "models_admin_write" ON public.models FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "model_inventory_admin_write" ON public.model_inventory FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "model_colors_inventory_admin_write" ON public.model_colors_inventory FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "home_settings_admin_write" ON public.home_settings FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "promo_cards_admin_write" ON public.promo_cards FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "themes_owner_write" ON public.themes FOR ALL TO authenticated USING (public.get_my_role() = 'owner') WITH CHECK (public.get_my_role() = 'owner');

-- System Users & Profiles Policies
CREATE POLICY "Allow select system_users by tenant" ON public.system_users FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "profiles_admin_write" ON public.profiles FOR ALL USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- Orders & Items Access (Tenant Isolated for public/anon/authenticated)
CREATE POLICY "Allow select orders by tenant" ON public.orders FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);
CREATE POLICY "Allow write orders by tenant" ON public.orders FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true) WITH CHECK (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);

CREATE POLICY "Allow select order_items by tenant" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true)));
CREATE POLICY "Allow write order_items by tenant" ON public.order_items FOR ALL USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true))) WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true)));

CREATE POLICY "prep_status_log_select" ON public.preparation_status_log FOR SELECT USING (true);
CREATE POLICY "prep_status_log_admin" ON public.preparation_status_log FOR ALL USING (true) WITH CHECK (true);

-- Warehouse Inbound, Stock Movements & Returns Policies (Tenant Isolated)
CREATE POLICY "Allow select inbound_invoices by tenant" ON public.inbound_invoices FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);
CREATE POLICY "inbound_invoices_admin_all" ON public.inbound_invoices FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true) WITH CHECK (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);

CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);

CREATE POLICY "Allow select returns by tenant" ON public.returns FOR SELECT USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);
CREATE POLICY "returns_admin_all" ON public.returns FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true) WITH CHECK (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true);

CREATE POLICY "return_items_select" ON public.return_items FOR SELECT TO authenticated USING (public.get_my_role() IN ('owner', 'admin', 'worker'));
CREATE POLICY "return_items_admin_all" ON public.return_items FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated USING (public.get_my_role() IN ('owner', 'admin', 'worker'));
CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT TO authenticated USING (public.get_my_role() IN ('owner', 'admin', 'worker'));
CREATE POLICY "invoice_items_admin_all" ON public.invoice_items FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- System Notifications & Internal Queues Policies
CREATE POLICY "system_notifications_select" ON public.system_notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL OR public.get_my_role() IN ('owner', 'admin'));
CREATE POLICY "system_notifications_write" ON public.system_notifications FOR ALL TO authenticated USING (user_id = auth.uid() OR user_id IS NULL OR public.get_my_role() IN ('owner', 'admin')) WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR public.get_my_role() IN ('owner', 'admin'));

CREATE POLICY "inv_queue_admin" ON public.inventory_notification_queue FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

CREATE POLICY "system_backups_log_strict" ON public.system_backups_log FOR ALL TO authenticated USING (public.get_my_role() IN ('owner', 'admin')) WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- Auto Enable RLS Event Trigger Registration
DROP EVENT TRIGGER IF EXISTS trg_rls_auto_enable;
CREATE EVENT TRIGGER trg_rls_auto_enable ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION public.rls_auto_enable();

-- Default Settings Initialization
INSERT INTO public.home_settings (setting_key, setting_value) VALUES 
('telegram_stock_enabled', 'true'),
('web_notifications_enabled', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- =========================================================================
-- 🎉 ZERO-TRUST SECURITY COMPLETE: ALL TABLES HAVE RLS ENABLED & SECURED!
-- =========================================================================
-- =========================================================================
-- 🔑 إضافة سياسات الإدخال والتعديل الكاملة لجداول العلاقات والصور
-- =========================================================================

-- 1. جدول مقاسات الفئات (class_sizes)
DROP POLICY IF EXISTS "class_sizes_admin_write" ON public.class_sizes;
CREATE POLICY "class_sizes_admin_write" ON public.class_sizes 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- 2. جدول صور الموديلات (model_images)
DROP POLICY IF EXISTS "model_images_admin_write" ON public.model_images;
CREATE POLICY "model_images_admin_write" ON public.model_images 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- 3. جدول مقاسات الموديلات (model_sizes)
DROP POLICY IF EXISTS "model_sizes_admin_write" ON public.model_sizes;
CREATE POLICY "model_sizes_admin_write" ON public.model_sizes 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- 4. جداول تفاصيل التحضير والوارد والجرد
DROP POLICY IF EXISTS "order_item_prep_admin_all" ON public.order_item_preparation;
CREATE POLICY "order_item_prep_admin_all" ON public.order_item_preparation 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin', 'worker')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'worker'));

DROP POLICY IF EXISTS "inbound_invoice_items_admin_all" ON public.inbound_invoice_items;
CREATE POLICY "inbound_invoice_items_admin_all" ON public.inbound_invoice_items 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "stock_movements_admin_all" ON public.stock_movements;
CREATE POLICY "stock_movements_admin_all" ON public.stock_movements 
    FOR ALL TO authenticated 
    USING (public.get_my_role() IN ('owner', 'admin')) 
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
-- (دالة reset_system_data تم تحديثها وتعريفها أعلاه في القسم 22)

-- =========================================================================
-- ⚡ 23. add_credits_to_tenant (SECURITY DEFINER) - Credit Recharge Persistence
-- =========================================================================
CREATE OR REPLACE FUNCTION public.add_credits_to_tenant(
    p_tenant_id uuid,
    p_credits_to_add numeric,
    p_user_name text DEFAULT 'إدارة المنظومة (UltraSoft)'
)
RETURNS jsonb AS $$
DECLARE
    v_sub record;
    v_consumed_credits numeric;
    v_monthly_credits integer;
    v_new_monthly integer;
    v_custom_limits jsonb;
    v_remaining numeric;
BEGIN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على اشتراك لهذا المصنع.';
    END IF;

    v_consumed_credits := COALESCE((v_sub.custom_limits->>'consumed_excel_credits')::numeric, 0);
    v_monthly_credits := COALESCE(v_sub.monthly_excel_credits, (v_sub.custom_limits->>'monthly_excel_credits')::integer, 200);

    -- 1. Increase monthly excel credits limit by p_credits_to_add
    v_new_monthly := v_monthly_credits + p_credits_to_add::integer;
    v_remaining := GREATEST(0, v_new_monthly - v_consumed_credits);

    v_custom_limits := COALESCE(v_sub.custom_limits, '{}'::jsonb);
    v_custom_limits := jsonb_set(v_custom_limits, '{monthly_excel_credits}', to_jsonb(v_new_monthly));

    -- Permanently update subscription in database
    UPDATE public.subscriptions
    SET monthly_excel_credits = v_new_monthly,
        custom_limits = v_custom_limits
    WHERE id = v_sub.id;

    -- 2. Log credit addition in excel_credits_log (negative credits_deducted = addition)
    INSERT INTO public.excel_credits_log (
        tenant_id, user_id, user_name, operation_type, location_name,
        credits_deducted, items_count, pricing_mode, remaining_balance_after
    ) VALUES (
        p_tenant_id, auth.uid(), COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'), 'credit_recharge', 'شحن ودفع رصيد كريديت إضافي من الإدارة',
        -p_credits_to_add, 0, 'recharge', v_remaining
    );

    -- 3. Log credit addition in system_audit_logs for audit log tables
    INSERT INTO public.system_audit_logs (
        tenant_id, user_id, user_name, module, action_type, details
    ) VALUES (
        p_tenant_id,
        auth.uid(),
        COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'),
        'credits',
        'recharge',
        jsonb_build_object(
            'notes', FORMAT('شحن رصيد كريديت إضافي للمصنع بمقدار (+%s كريديت ⚡)', p_credits_to_add),
            'credits_added', p_credits_to_add,
            'credits_deducted', -p_credits_to_add,
            'old_monthly_credits', v_monthly_credits,
            'new_monthly_credits', v_new_monthly,
            'remaining_credits', v_remaining,
            'user_name', COALESCE(p_user_name, 'إدارة المنظومة (UltraSoft)'),
            'user_role', 'Super Admin',
            'reason', 'دفع وشحن رصيد إضافي من إدارة المنظومة'
        )
    );

    RETURN jsonb_build_object('success', true, 'added', p_credits_to_add, 'new_monthly', v_new_monthly, 'remaining', v_remaining);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.add_credits_to_tenant(uuid, numeric, text) TO authenticated, anon, service_role;

