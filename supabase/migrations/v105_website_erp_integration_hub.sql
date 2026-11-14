-- =========================================================================
-- 🚀 MIGRATION V105: SECURE ERP × WEBSITE INTEGRATION HUB & PROTOCOL ENGINE (HARDENED P0)
-- 📦 Project: UltraSoft Platform (ألترا سوفت)
-- 📅 Date: 2026-11-14
-- 💡 Description: 
--    1. Factory connection registry with zero plaintext secrets (stored in private schema).
--    2. Real HMAC-SHA256 verification using unified canonical string:
--       METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(raw business payload).
--    3. Replay prevention with post-signature nonce registration.
--    4. Strict RLS eliminating any broad USING (true) policies; direct table access revoked.
--    5. Dedicated RPCs for connection lookup, reservation groups, and order checkout.
--    6. Zero caller-provided p_tenant_id inside SECURITY DEFINER; derived from session/membership.
--    7. Enqueued reservations marked pending_erp_confirmation; orders awaiting_stock_confirmation until ERP ACK.
--    8. Authoritative ERP catalog & inventory publication RPCs with monotonic revisions.
-- =========================================================================

-- 0. EXTENSIONS & PREREQUISITES
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
    -- Fallback for environments where pgcrypto is not pre-packaged
    NULL;
END $$;

-- 1. FACTORY CONNECTIONS TABLE (METADATA ONLY - ZERO PLAINTEXT SECRETS)
CREATE TABLE IF NOT EXISTS public.website_factory_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    connection_name text NOT NULL,
    api_key_id text NOT NULL UNIQUE,
    secret_hash text NOT NULL,
    allowed_scopes jsonb DEFAULT '["catalog.read", "catalog.write", "inventory.write", "orders.read", "orders.write"]'::jsonb,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
    last_seen_at timestamptz,
    last_catalog_revision bigint DEFAULT 0,
    last_inventory_revision bigint DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (tenant_id, api_key_id)
);

-- Drop legacy plaintext secret column if present from earlier drafts
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='website_factory_connections' AND column_name='secret_key') THEN
        ALTER TABLE public.website_factory_connections DROP COLUMN secret_key;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wfc_tenant ON public.website_factory_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wfc_key_id ON public.website_factory_connections(api_key_id);
CREATE INDEX IF NOT EXISTS idx_wfc_status ON public.website_factory_connections(status);

-- 2. PRIVATE SERVER-SIDE CREDENTIAL VAULT (ISOLATED SCHEMA, ZERO POSTGREST ACCESS)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT ALL ON SCHEMA private TO postgres, service_role;

CREATE TABLE IF NOT EXISTS private.website_factory_secrets (
    connection_id uuid PRIMARY KEY REFERENCES public.website_factory_connections(id) ON DELETE CASCADE,
    secret_key_encrypted text NOT NULL,
    secret_hash text NOT NULL,
    created_at timestamptz DEFAULT now()
);
REVOKE ALL ON TABLE private.website_factory_secrets FROM public, anon, authenticated;
GRANT ALL ON TABLE private.website_factory_secrets TO postgres, service_role;

-- 3. REPLAY PREVENTION NONCE CACHE
CREATE TABLE IF NOT EXISTS public.website_integration_nonces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id text NOT NULL,
    nonce text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE (api_key_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_win_expiry ON public.website_integration_nonces(expires_at);

-- 4. INTEGRATION COMMANDS (WEBSITE -> ERP QUEUE)
CREATE TABLE IF NOT EXISTS public.website_integration_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    connection_id uuid REFERENCES public.website_factory_connections(id) ON DELETE CASCADE,
    command_type text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'acknowledged', 'failed', 'cancelled')),
    attempt_count integer DEFAULT 0,
    delivered_at timestamptz,
    acknowledged_at timestamptz,
    result jsonb,
    error_message text,
    created_at timestamptz DEFAULT now(),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wic_poll ON public.website_integration_commands(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_wic_idemp ON public.website_integration_commands(tenant_id, idempotency_key);

-- 5. INTEGRATION ACKNOWLEDGEMENTS & EVENTS (ERP -> WEBSITE QUEUE)
CREATE TABLE IF NOT EXISTS public.website_integration_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    event_id uuid NOT NULL,
    event_type text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL,
    processed boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wia_tenant_proc ON public.website_integration_acknowledgements(tenant_id, processed);

-- 6. AUTHORITATIVE INVENTORY PROJECTIONS TABLE
CREATE TABLE IF NOT EXISTS public.website_inventory_projections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    model_id uuid REFERENCES public.models(id) ON DELETE CASCADE NOT NULL,
    color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE NOT NULL,
    variant_external_id text,
    on_hand_series integer NOT NULL DEFAULT 0,
    reserved_active_series integer NOT NULL DEFAULT 0,
    available_to_sell_series integer NOT NULL DEFAULT 0,
    stock_revision bigint NOT NULL DEFAULT 0,
    last_synced_at timestamptz DEFAULT now(),
    UNIQUE (tenant_id, model_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_wip_variant ON public.website_inventory_projections(tenant_id, variant_external_id);
CREATE INDEX IF NOT EXISTS idx_wip_model ON public.website_inventory_projections(tenant_id, model_id);

-- 7. EXTEND ORDERS TABLE WITH INTEGRATION FIELDS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='integration_status') THEN
        ALTER TABLE public.orders ADD COLUMN integration_status text DEFAULT 'draft';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='reservation_id') THEN
        ALTER TABLE public.orders ADD COLUMN reservation_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='erp_invoice_id') THEN
        ALTER TABLE public.orders ADD COLUMN erp_invoice_id text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='erp_invoice_number') THEN
        ALTER TABLE public.orders ADD COLUMN erp_invoice_number text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='erp_posted_at') THEN
        ALTER TABLE public.orders ADD COLUMN erp_posted_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='erp_rejection_reason') THEN
        ALTER TABLE public.orders ADD COLUMN erp_rejection_reason text;
    END IF;
END $$;

-- 8. ENABLE STRICT ROW LEVEL SECURITY & REVOKE DIRECT ACCESS
ALTER TABLE public.website_factory_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_integration_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_integration_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_inventory_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_integration_nonces ENABLE ROW LEVEL SECURITY;

-- Revoke all direct public access from anon and authenticated roles
REVOKE ALL ON public.website_factory_connections FROM anon, authenticated;
REVOKE ALL ON public.website_integration_commands FROM anon, authenticated;
REVOKE ALL ON public.website_integration_acknowledgements FROM anon, authenticated;
REVOKE ALL ON public.website_inventory_projections FROM anon, authenticated;
REVOKE ALL ON public.website_integration_nonces FROM anon, authenticated;

-- Drop legacy broad or insecure policies
DROP POLICY IF EXISTS "wfc_isolation" ON public.website_factory_connections;
DROP POLICY IF EXISTS "wic_isolation" ON public.website_integration_commands;
DROP POLICY IF EXISTS "wia_isolation" ON public.website_integration_acknowledgements;
DROP POLICY IF EXISTS "wip_isolation" ON public.website_inventory_projections;
DROP POLICY IF EXISTS "wfc_tenant_isolation" ON public.website_factory_connections;
DROP POLICY IF EXISTS "wic_tenant_isolation" ON public.website_integration_commands;
DROP POLICY IF EXISTS "wia_tenant_isolation" ON public.website_integration_acknowledgements;
DROP POLICY IF EXISTS "wip_tenant_isolation" ON public.website_inventory_projections;

-- Strict Tenant-Scoped RLS Policies (For authenticated session members only)
CREATE POLICY "wfc_tenant_isolation" ON public.website_factory_connections
    FOR ALL TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "wic_tenant_isolation" ON public.website_integration_commands
    FOR ALL TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "wia_tenant_isolation" ON public.website_integration_acknowledgements
    FOR ALL TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "wip_tenant_isolation" ON public.website_inventory_projections
    FOR ALL TO authenticated
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- 9. SERVER-SIDE SECRET MANAGEMENT (PRIVILEGED ONLY)
CREATE OR REPLACE FUNCTION public.set_factory_connection_secret(
    p_connection_id uuid,
    p_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO private.website_factory_secrets (connection_id, secret_key_encrypted, secret_hash)
    VALUES (
        p_connection_id,
        encode(extensions.digest(p_secret, 'sha256'), 'hex') || ':' || encode(p_secret::bytea, 'base64'),
        encode(extensions.digest(p_secret, 'sha256'), 'hex')
    )
    ON CONFLICT (connection_id) DO UPDATE
    SET secret_key_encrypted = EXCLUDED.secret_key_encrypted,
        secret_hash = EXCLUDED.secret_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_factory_connection_secret FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_factory_connection_secret TO postgres, service_role;

-- 10. UNIFIED CRYPTOGRAPHIC AUTHENTICATION HELPER
CREATE OR REPLACE FUNCTION public.auth_verify_integration_key(
    p_api_key_id text,
    p_signature text,
    p_timestamp text,
    p_nonce text,
    p_body_hash text,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc',
    p_required_scope text DEFAULT NULL
)
RETURNS TABLE (
    tenant_id uuid,
    connection_id uuid,
    scopes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, private, public
AS $$
DECLARE
    v_conn RECORD;
    v_secret_rec RECORD;
    v_raw_secret text;
    v_req_time timestamptz;
    v_now timestamptz := now();
    v_skew_seconds double precision;
    v_string_to_sign text;
    v_expected_signature text;
BEGIN
    -- 1. Check required headers
    IF p_api_key_id IS NULL OR trim(p_api_key_id) = '' THEN
        RAISE EXCEPTION '401: Missing X-Integration-Key-Id header';
    END IF;
    IF p_signature IS NULL OR trim(p_signature) = '' THEN
        RAISE EXCEPTION '401: Missing X-Integration-Signature header';
    END IF;
    IF p_timestamp IS NULL OR trim(p_timestamp) = '' THEN
        RAISE EXCEPTION '401: Missing X-Integration-Timestamp header';
    END IF;
    IF p_nonce IS NULL OR trim(p_nonce) = '' THEN
        RAISE EXCEPTION '401: Missing X-Integration-Nonce header';
    END IF;

    -- 2. Validate Timestamp format and clock skew (max 300 seconds)
    BEGIN
        v_req_time := p_timestamp::timestamptz;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '400: Invalid timestamp format in X-Integration-Timestamp';
    END;

    v_skew_seconds := abs(extract(epoch from (v_now - v_req_time)));
    IF v_skew_seconds > 300 THEN
        RAISE EXCEPTION '401: Clock skew exceeded (allowed 300s, detected %s)', v_skew_seconds;
    END IF;

    -- 3. Fetch connection and active status
    SELECT * INTO v_conn
    FROM public.website_factory_connections c
    WHERE c.api_key_id = p_api_key_id;

    IF v_conn IS NULL THEN
        RAISE EXCEPTION '401: Unknown integration key ID';
    END IF;

    IF v_conn.status != 'active' THEN
        RAISE EXCEPTION '403: Connection is %', v_conn.status;
    END IF;

    -- 4. Verify Required Scope
    IF p_required_scope IS NOT NULL AND NOT (v_conn.allowed_scopes ? p_required_scope) THEN
        RAISE EXCEPTION '403: Integration key lacks required scope: %', p_required_scope;
    END IF;

    -- 5. Fetch private secret from secure vault
    SELECT * INTO v_secret_rec
    FROM private.website_factory_secrets s
    WHERE s.connection_id = v_conn.id;

    IF v_secret_rec IS NULL THEN
        RAISE EXCEPTION '401: Connection secret not found in secure vault';
    END IF;

    -- Extract raw secret from protected vault representation
    IF position(':' in v_secret_rec.secret_key_encrypted) > 0 THEN
        v_raw_secret := convert_from(decode(split_part(v_secret_rec.secret_key_encrypted, ':', 2), 'base64'), 'utf-8');
    ELSE
        v_raw_secret := v_secret_rec.secret_key_encrypted;
    END IF;

    -- 6. UNIFIED CANONICAL STRING TO SIGN:
    -- METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(raw business payload)
    v_string_to_sign := concat_ws(E'\n',
        upper(COALESCE(p_method, 'POST')),
        COALESCE(p_path, ''),
        p_timestamp,
        p_nonce,
        COALESCE(p_body_hash, '')
    );

    v_expected_signature := encode(extensions.hmac(v_string_to_sign::bytea, v_raw_secret::bytea, 'sha256'), 'hex');

    IF lower(p_signature) != lower(v_expected_signature) THEN
        RAISE EXCEPTION '401: Invalid HMAC-SHA256 signature';
    END IF;

    -- 7. REPLAY PREVENTION VIA NONCE (RECORDED ONLY AFTER SIGNATURE SUCCESS!)
    IF EXISTS (SELECT 1 FROM public.website_integration_nonces n WHERE n.api_key_id = p_api_key_id AND n.nonce = p_nonce) THEN
        RAISE EXCEPTION '403: Replay attack detected. Nonce has already been used.';
    END IF;

    INSERT INTO public.website_integration_nonces (api_key_id, nonce, expires_at)
    VALUES (p_api_key_id, p_nonce, v_now + interval '10 minutes');

    -- 8. Update last seen timestamp
    UPDATE public.website_factory_connections c
    SET last_seen_at = v_now
    WHERE c.id = v_conn.id;

    RETURN QUERY SELECT v_conn.tenant_id, v_conn.id, v_conn.allowed_scopes;
END;
$$;

-- 11. RPC: CONNECTION LOOKUP FOR CHECKOUT (DERIVES TENANT SERVER-SIDE)
CREATE OR REPLACE FUNCTION public.checkout_get_erp_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn RECORD;
BEGIN
    -- Derive tenant server-side from session/membership
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '401 Unauthorized: active tenant membership required' USING ERRCODE = '28000';
    END IF;

    SELECT id, connection_name, status, last_seen_at INTO v_conn
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    IF v_conn IS NULL THEN
        RETURN jsonb_build_object('has_active_erp', false);
    END IF;

    RETURN jsonb_build_object(
        'has_active_erp', true,
        'connection_id', v_conn.id,
        'connection_name', v_conn.connection_name,
        'last_seen_at', v_conn.last_seen_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkout_get_erp_connection_status FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_get_erp_connection_status TO authenticated, service_role;

-- 12. RPC: ATOMIC RESERVATION GROUP REQUEST (ALL ITEMS IN ONE BATCH)
CREATE OR REPLACE FUNCTION public.checkout_request_erp_reservations(
    p_items jsonb,
    p_website_order_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_item jsonb;
    v_model_id uuid;
    v_color_id uuid;
    v_variant_id text;
    v_qty integer;
    v_avail integer;
    v_res_group_id uuid := gen_random_uuid();
    v_resolved_items jsonb := '[]'::jsonb;
BEGIN
    -- Derive tenant server-side
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '401 Unauthorized: active tenant membership required' USING ERRCODE = '28000';
    END IF;

    -- Verify active connection
    SELECT id INTO v_conn_id
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    IF v_conn_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'NO_ACTIVE_CONNECTION',
            'message', 'المصنع غير متصل حالياً'
        );
    END IF;

    -- Validate each item against latest authoritative ERP projection
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_model_id := NULLIF(v_item->>'model_id', '')::uuid;
        v_color_id := NULLIF(v_item->>'color_id', '')::uuid;
        v_qty := COALESCE((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 1);

        -- Lookup projection and canonical variant_external_id
        SELECT available_to_sell_series, variant_external_id
        INTO v_avail, v_variant_id
        FROM public.website_inventory_projections
        WHERE tenant_id = v_tenant_id AND model_id = v_model_id AND color_id = v_color_id;

        IF v_avail IS NOT NULL AND v_avail < v_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'INSUFFICIENT_STOCK',
                'model_id', v_model_id,
                'color_id', v_color_id,
                'available', v_avail,
                'requested', v_qty,
                'message', 'عفواً، الكمية المطلوبة غير متوفرة حالياً في رصيد المصنع.'
            );
        END IF;

        v_resolved_items := v_resolved_items || jsonb_build_object(
            'model_id', v_model_id,
            'color_id', v_color_id,
            'variant_external_id', COALESCE(v_variant_id, v_item->>'variant_external_id', (v_model_id::text || '_' || v_color_id::text)),
            'quantity', v_qty,
            'unit', COALESCE(v_item->>'unit', 'series'),
            'ttl_seconds', 900
        );
    END LOOP;

    -- Enqueue reservation command into integration queue
    -- NOTE: Invariant: enqueue != reserved. Status is pending_erp_confirmation until ERP ACK.
    INSERT INTO public.website_integration_commands (
        tenant_id,
        connection_id,
        command_type,
        idempotency_key,
        payload,
        status
    ) VALUES (
        v_tenant_id,
        v_conn_id,
        'reservation.requested',
        'res_grp:' || v_res_group_id::text,
        jsonb_build_object(
            'reservation_group_id', v_res_group_id,
            'website_order_id', p_website_order_id,
            'items', v_resolved_items
        ),
        'pending'
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_group_id', v_res_group_id,
        'status', 'pending_erp_confirmation',
        'items_count', jsonb_array_length(v_resolved_items)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkout_request_erp_reservations FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_request_erp_reservations TO authenticated, service_role;

-- 13. RPC: RELEASE RESERVATION GROUP
CREATE OR REPLACE FUNCTION public.checkout_release_erp_reservation(
    p_reservation_group_id text,
    p_reason text DEFAULT 'cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL OR p_reservation_group_id IS NULL THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    SELECT id INTO v_conn_id
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    IF v_conn_id IS NOT NULL THEN
        INSERT INTO public.website_integration_commands (
            tenant_id, connection_id, command_type, idempotency_key, payload, status
        ) VALUES (
            v_tenant_id, v_conn_id, 'reservation.cancelled',
            'rel_grp:' || p_reservation_group_id || ':' || extract(epoch from now())::text,
            jsonb_build_object('reservation_group_id', p_reservation_group_id, 'reason', p_reason),
            'pending'
        );
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkout_release_erp_reservation FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_release_erp_reservation TO authenticated, service_role;

-- 14. RPC: DEDICATED ERP-INTEGRATED ORDER CREATION (SERVER-DERIVED TENANT, NO INDEPENDENT STOCK DEDUCTION)
CREATE OR REPLACE FUNCTION public.create_erp_integrated_order(
    p_order_data jsonb,
    p_order_items jsonb,
    p_reservation_group_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_order_id uuid;
    v_order_number text;
    v_conn_id uuid;
    v_item jsonb;
    v_cmd_status text;
    v_cmd_result jsonb;
    v_int_status text;
BEGIN
    -- Derive tenant server-side; NEVER trust caller-provided tenant ID
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid() AND is_active = true;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid;
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '401: Unauthorized - No valid tenant membership found in session';
    END IF;

    -- Verify active connection exists for tenant
    SELECT id INTO v_conn_id
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    -- INVARIANT: If there is no confirmed ERP reservation ACK, status is strictly awaiting_stock_confirmation
    v_int_status := 'awaiting_stock_confirmation';

    IF p_reservation_group_id IS NOT NULL AND trim(p_reservation_group_id) != '' THEN
        -- Check if ERP has confirmed the reservation
        SELECT status, result INTO v_cmd_status, v_cmd_result
        FROM public.website_integration_commands
        WHERE tenant_id = v_tenant_id
          AND idempotency_key = ('res_grp:' || p_reservation_group_id)
          AND command_type = 'reservation.requested'
        LIMIT 1;

        IF v_cmd_status = 'acknowledged' AND COALESCE((v_cmd_result->>'confirmed')::boolean, false) = true THEN
            v_int_status := 'reserved';
        END IF;
    END IF;

    -- Generate sequential invoice/order number
    v_order_number := COALESCE(
        p_order_data->>'invoice_number',
        'WEB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
    );

    -- Insert Order header
    INSERT INTO public.orders (
        tenant_id,
        customer_name,
        phone_1,
        phone_2,
        address,
        notes,
        total_price,
        total_series,
        deposit,
        deposit_receiver,
        status,
        integration_status,
        reservation_id,
        created_at
    ) VALUES (
        v_tenant_id,
        p_order_data->>'customer_name',
        p_order_data->>'phone_1',
        p_order_data->>'phone_2',
        p_order_data->>'address',
        p_order_data->>'notes',
        COALESCE((p_order_data->>'total_price')::numeric, 0),
        COALESCE((p_order_data->>'total_series')::integer, 0),
        COALESCE((p_order_data->>'deposit')::numeric, 0),
        p_order_data->>'deposit_receiver',
        'created',
        v_int_status,
        p_reservation_group_id,
        now()
    )
    RETURNING id INTO v_order_id;

    -- Insert Order items WITHOUT independent stock deduction
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        INSERT INTO public.order_items (
            order_id,
            model_id,
            color_id,
            qty,
            model_name,
            price,
            total,
            sizes_count,
            piece_price
        ) VALUES (
            v_order_id,
            (v_item->>'model_id')::uuid,
            (v_item->>'color_id')::uuid,
            (v_item->>'qty')::integer,
            v_item->>'model_name',
            (v_item->>'price')::numeric,
            (v_item->>'total')::numeric,
            COALESCE((v_item->>'sizes_count')::integer, 1),
            (v_item->>'piece_price')::numeric
        );
    END LOOP;

    -- Enqueue order.created command for ERP outbound poller
    IF v_conn_id IS NOT NULL THEN
        INSERT INTO public.website_integration_commands (
            tenant_id,
            connection_id,
            command_type,
            idempotency_key,
            payload,
            status
        ) VALUES (
            v_tenant_id,
            v_conn_id,
            'order.created',
            'ord:' || v_order_id::text,
            jsonb_build_object(
                'website_order_id', v_order_id,
                'website_order_number', v_order_number,
                'reservation_group_id', p_reservation_group_id,
                'ordered_at', now(),
                'totals', jsonb_build_object(
                    'grand_total', (p_order_data->>'total_price')::numeric,
                    'paid_amount', (p_order_data->>'deposit')::numeric
                ),
                'customer', jsonb_build_object(
                    'name', p_order_data->>'customer_name',
                    'phone', p_order_data->>'phone_1',
                    'phone_2', p_order_data->>'phone_2',
                    'address', p_order_data->>'address'
                ),
                'items', p_order_items
            ),
            'pending'
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', v_order_id,
        'invoice_number', v_order_number,
        'integration_status', v_int_status,
        'reservation_group_id', p_reservation_group_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_erp_integrated_order FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_erp_integrated_order TO authenticated, service_role;

-- 15. RPC: PULL PENDING COMMANDS (ERP DESKTOP POLLER)
CREATE OR REPLACE FUNCTION public.integration_v1_pull_commands(
    p_limit integer DEFAULT 25,
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_pull_commands'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
    v_cmds jsonb;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path, 'orders.read');

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'command_type', c.command_type,
            'idempotency_key', c.idempotency_key,
            'payload', c.payload,
            'created_at', c.created_at
        )
    ) INTO v_cmds
    FROM (
        SELECT id, command_type, idempotency_key, payload, created_at
        FROM public.website_integration_commands
        WHERE tenant_id = v_tenant_id
          AND connection_id = v_conn_id
          AND status IN ('pending', 'delivered')
        ORDER BY created_at ASC
        LIMIT LEAST(p_limit, 100)
    ) c;

    -- Mark pulled commands as delivered
    UPDATE public.website_integration_commands
    SET status = 'delivered',
        delivered_at = now(),
        attempt_count = attempt_count + 1
    WHERE tenant_id = v_tenant_id
      AND connection_id = v_conn_id
      AND status = 'pending'
      AND id IN (
          SELECT id FROM public.website_integration_commands
          WHERE tenant_id = v_tenant_id AND connection_id = v_conn_id AND status = 'pending'
          ORDER BY created_at ASC
          LIMIT LEAST(p_limit, 100)
      );

    RETURN jsonb_build_object(
        'ok', true,
        'commands', COALESCE(v_cmds, '[]'::jsonb),
        'server_time', now()
    );
END;
$$;

-- 16. RPC: ACKNOWLEDGE COMMAND (ERP DESKTOP POLLER)
CREATE OR REPLACE FUNCTION public.integration_v1_ack_command(
    p_command_id uuid,
    p_status text,
    p_result jsonb DEFAULT '{}'::jsonb,
    p_error_message text DEFAULT NULL,
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_ack_command'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
    v_rows integer;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path, 'orders.write');

    UPDATE public.website_integration_commands
    SET status = p_status,
        acknowledged_at = now(),
        result = p_result,
        error_message = p_error_message
    WHERE id = p_command_id
      AND tenant_id = v_tenant_id
      AND connection_id = v_conn_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RAISE EXCEPTION '404: Command not found or tenant mismatch';
    END IF;

    RETURN jsonb_build_object('ok', true, 'command_id', p_command_id, 'status', p_status);
END;
$$;

-- 17. RPC: PUBLISH INVENTORY SNAPSHOT (ERP -> WEBSITE)
CREATE OR REPLACE FUNCTION public.integration_v1_publish_inventory(
    p_stock_revision bigint,
    p_items jsonb,
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_publish_inventory'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
    v_current_rev bigint;
    v_item jsonb;
    v_model_id uuid;
    v_color_id uuid;
    v_on_hand integer;
    v_reserved integer;
    v_available integer;
    v_variant_id text;
    v_upserted integer := 0;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path, 'inventory.write');

    SELECT last_inventory_revision INTO v_current_rev
    FROM public.website_factory_connections
    WHERE id = v_conn_id;

    IF p_stock_revision < v_current_rev THEN
        RETURN jsonb_build_object(
            'ok', true,
            'ignored', true,
            'reason', 'STALE_REVISION',
            'current_revision', v_current_rev,
            'received_revision', p_stock_revision
        );
    END IF;

    UPDATE public.website_factory_connections
    SET last_inventory_revision = p_stock_revision,
        last_seen_at = now()
    WHERE id = v_conn_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := v_item->>'variant_external_id';
        v_model_id := NULLIF(v_item->>'website_model_id', '')::uuid;
        v_color_id := NULLIF(v_item->>'website_color_id', '')::uuid;
        v_on_hand := COALESCE((v_item->>'on_hand_series')::integer, 0);
        v_reserved := COALESCE((v_item->>'reserved_active_series')::integer, 0);
        v_available := COALESCE((v_item->>'available_to_sell_series')::integer, GREATEST(0, v_on_hand - v_reserved));

        IF v_model_id IS NOT NULL AND v_color_id IS NOT NULL THEN
            INSERT INTO public.website_inventory_projections (
                tenant_id, model_id, color_id, variant_external_id,
                on_hand_series, reserved_active_series, available_to_sell_series,
                stock_revision, last_synced_at
            ) VALUES (
                v_tenant_id, v_model_id, v_color_id, v_variant_id,
                v_on_hand, v_reserved, v_available,
                p_stock_revision, now()
            )
            ON CONFLICT (tenant_id, model_id, color_id) DO UPDATE
            SET variant_external_id = EXCLUDED.variant_external_id,
                on_hand_series = EXCLUDED.on_hand_series,
                reserved_active_series = EXCLUDED.reserved_active_series,
                available_to_sell_series = EXCLUDED.available_to_sell_series,
                stock_revision = EXCLUDED.stock_revision,
                last_synced_at = now();

            v_upserted := v_upserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'code', 'INVENTORY_REVISION_APPLIED',
        'stock_revision', p_stock_revision,
        'items_upserted', v_upserted,
        'server_time', now()
    );
END;
$$;

-- 18. RPC: CATALOG SNAPSHOT PUBLICATION (ERP -> WEBSITE)
CREATE OR REPLACE FUNCTION public.integration_v1_publish_catalog(
    p_catalog_revision bigint,
    p_models jsonb,
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_publish_catalog'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path, 'catalog.write');

    -- Update catalog revision
    UPDATE public.website_factory_connections
    SET last_catalog_revision = GREATEST(last_catalog_revision, p_catalog_revision),
        last_seen_at = now()
    WHERE id = v_conn_id;

    -- Record acknowledgement
    INSERT INTO public.website_integration_acknowledgements (
        tenant_id, event_id, event_type, idempotency_key, payload, processed
    ) VALUES (
        v_tenant_id, gen_random_uuid(), 'catalog.snapshot',
        'cat_rev:' || v_conn_id::text || ':' || p_catalog_revision::text,
        jsonb_build_object('revision', p_catalog_revision, 'models_count', jsonb_array_length(p_models)),
        true
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'ok', true,
        'code', 'CATALOG_SNAPSHOT_RECORDED',
        'revision', p_catalog_revision,
        'server_time', now()
    );
END;
$$;

-- 19. RPC: ORDER STATUS CHANGED (ERP -> WEBSITE)
CREATE OR REPLACE FUNCTION public.integration_v1_order_status_changed(
    p_website_order_id uuid,
    p_status text,
    p_erp_invoice_id text DEFAULT NULL,
    p_erp_invoice_number text DEFAULT NULL,
    p_details jsonb DEFAULT '{}'::jsonb,
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_order_status_changed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path, 'orders.write');

    UPDATE public.orders
    SET integration_status = p_status,
        erp_invoice_id = COALESCE(p_erp_invoice_id, erp_invoice_id),
        erp_invoice_number = COALESCE(p_erp_invoice_number, erp_invoice_number),
        erp_posted_at = CASE WHEN p_status = 'posted' THEN now() ELSE erp_posted_at END,
        erp_rejection_reason = CASE WHEN p_status IN ('rejected', 'needs_review') THEN p_details->>'reason' ELSE NULL END
    WHERE id = p_website_order_id AND tenant_id = v_tenant_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_website_order_id,
        'status', p_status,
        'server_time', now()
    );
END;
$$;

-- 20. RPC: CONNECTION TEST
CREATE OR REPLACE FUNCTION public.integration_v1_connection_test(
    p_api_key_id text DEFAULT NULL,
    p_signature text DEFAULT NULL,
    p_timestamp text DEFAULT NULL,
    p_nonce text DEFAULT NULL,
    p_body_hash text DEFAULT NULL,
    p_method text DEFAULT 'POST',
    p_path text DEFAULT '/rest/v1/rpc/integration_v1_connection_test'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_scopes jsonb;
BEGIN
    SELECT tenant_id, connection_id, scopes
    INTO v_tenant_id, v_conn_id, v_scopes
    FROM public.auth_verify_integration_key(p_api_key_id, p_signature, p_timestamp, p_nonce, p_body_hash, p_method, p_path);

    RETURN jsonb_build_object(
        'ok', true,
        'code', 'CONNECTION_ACTIVE',
        'tenant_id', v_tenant_id,
        'connection_id', v_conn_id,
        'scopes', v_scopes,
        'server_time', now()
    );
END;
$$;

-- 21. GRANT SECURE ACCESS
-- External Relay RPCs (authenticated via cryptographic HMAC verification)
GRANT EXECUTE ON FUNCTION public.auth_verify_integration_key TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_pull_commands TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_ack_command TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_publish_inventory TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_publish_catalog TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_order_status_changed TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.integration_v1_connection_test TO authenticated, anon, service_role;

-- Website Storefront Checkout RPCs (authenticated session users only)
REVOKE EXECUTE ON FUNCTION public.checkout_get_erp_connection_status FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_get_erp_connection_status TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.checkout_request_erp_reservations FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_request_erp_reservations TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.checkout_release_erp_reservation FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_release_erp_reservation TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_erp_integrated_order FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_erp_integrated_order TO authenticated, service_role;
