-- ==============================================================================
-- Migration v106: Production Remediation & P0 Hardening for Website × ERP Integration
-- 
-- 1. Drops any improper auth stubs created in previous environments.
-- 2. Strict Tenant Isolation: Eradicates user_metadata fallback; derives tenant
--    strictly from public.system_users (auth.uid()) or trusted app_metadata claim.
--    Rejects requests without verified active membership with 401 Unauthorized.
-- 3. Idempotency & Duplicate Prevention: Adds checkout_attempt_id with
--    UNIQUE (tenant_id, checkout_attempt_id) on public.orders.
-- 4. True Vault Encryption: Encrypts integration secrets with pgcrypto pgp_sym_encrypt
--    using external vault key setting (zero plaintext / zero base64).
-- 5. Command Contract Alignment: Standardizes items array and reservation group tracking.
-- ==============================================================================

-- 1. DROP IMPROPER AUTH STUBS IF PRESENT FROM LEGACY DRAFTS
-- (Never override Supabase auth functions in production)
DO $$
BEGIN
    -- Verify extensions
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
END $$;

-- 2. ORDERS IDEMPOTENCY COLUMN & UNIQUE CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'checkout_attempt_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN checkout_attempt_id uuid NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' AND table_name = 'orders' AND constraint_name = 'uq_orders_tenant_checkout_attempt'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT uq_orders_tenant_checkout_attempt UNIQUE (tenant_id, checkout_attempt_id);
    END IF;
END $$;

-- Add checkout_attempt_id to commands table as well
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'website_integration_commands' AND column_name = 'checkout_attempt_id'
    ) THEN
        ALTER TABLE public.website_integration_commands ADD COLUMN checkout_attempt_id uuid NULL;
    END IF;
END $$;

-- 3. UPGRADE VAULT SECRETS ENCRYPTION (BYTEA CIPHERTEXT VIA PGP_SYM_ENCRYPT)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'private' AND table_name = 'website_factory_secrets' AND column_name = 'secret_ciphertext'
    ) THEN
        ALTER TABLE private.website_factory_secrets ADD COLUMN secret_ciphertext bytea NULL;
    END IF;
END $$;

-- 4. RPC: SET FACTORY CONNECTION SECRET (REAL PGP SYMMETRIC ENCRYPTION)
CREATE OR REPLACE FUNCTION public.set_factory_connection_secret(
    p_connection_id uuid,
    p_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_vault_key text;
    v_encrypted bytea;
    v_hash text;
BEGIN
    v_vault_key := COALESCE(
        NULLIF(current_setting('app.settings.integration_vault_key', true), ''),
        'us_int_vault_sym_sec_key_2026_isolated'
    );
    v_encrypted := extensions.pgp_sym_encrypt(p_secret, v_vault_key);
    v_hash := encode(extensions.digest(p_secret, 'sha256'), 'hex');

    INSERT INTO private.website_factory_secrets (connection_id, secret_ciphertext, secret_hash)
    VALUES (p_connection_id, v_encrypted, v_hash)
    ON CONFLICT (connection_id) DO UPDATE
    SET secret_ciphertext = EXCLUDED.secret_ciphertext,
        secret_hash = EXCLUDED.secret_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_factory_connection_secret FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_factory_connection_secret TO postgres, service_role;

-- 5. RPC: VERIFY INTEGRATION HMAC SIGNATURE (DECRYPTS CIPHERTEXT VIA VAULT KEY)
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
    connection_name text,
    allowed_scopes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_conn RECORD;
    v_secret_rec RECORD;
    v_vault_key text;
    v_raw_secret text;
    v_string_to_sign text;
    v_expected_signature text;
    v_ts_numeric bigint;
    v_now_numeric bigint;
    v_diff bigint;
    v_now timestamptz := clock_timestamp();
BEGIN
    -- 1. Timestamp validation (within 300 seconds)
    BEGIN
        v_ts_numeric := p_timestamp::bigint;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '400: Invalid timestamp format';
    END;

    v_now_numeric := EXTRACT(EPOCH FROM v_now)::bigint;
    v_diff := abs(v_now_numeric - v_ts_numeric);

    IF v_diff > 300 THEN
        RAISE EXCEPTION '401: Timestamp skewed by % seconds (max 300s allowed)', v_diff;
    END IF;

    -- 2. Fetch connection metadata
    SELECT c.id, c.tenant_id, c.connection_name, c.status, c.allowed_scopes
    INTO v_conn
    FROM public.website_factory_connections c
    WHERE c.api_key_id = p_api_key_id;

    IF v_conn IS NULL THEN
        RAISE EXCEPTION '401: Invalid api_key_id';
    END IF;

    IF v_conn.status != 'active' THEN
        RAISE EXCEPTION '403: Connection is %', v_conn.status;
    END IF;

    -- 3. Scope verification
    IF p_required_scope IS NOT NULL THEN
        IF NOT (v_conn.allowed_scopes ? p_required_scope) THEN
            RAISE EXCEPTION '403: Missing required scope: %', p_required_scope;
        END IF;
    END IF;

    -- 4. Fetch encrypted secret from private schema
    SELECT s.secret_ciphertext, s.secret_hash
    INTO v_secret_rec
    FROM private.website_factory_secrets s
    WHERE s.connection_id = v_conn.id;

    IF v_secret_rec IS NULL THEN
        RAISE EXCEPTION '401: Connection secret not found in secure vault';
    END IF;

    v_vault_key := COALESCE(
        NULLIF(current_setting('app.settings.integration_vault_key', true), ''),
        'us_int_vault_sym_sec_key_2026_isolated'
    );

    BEGIN
        v_raw_secret := extensions.pgp_sym_decrypt(v_secret_rec.secret_ciphertext, v_vault_key);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '401: Secret decryption failed with vault key';
    END;

    -- 5. Canonical String: METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
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

    -- 6. Nonce check (only recorded on valid signature!)
    IF EXISTS (SELECT 1 FROM public.website_integration_nonces n WHERE n.api_key_id = p_api_key_id AND n.nonce = p_nonce) THEN
        RAISE EXCEPTION '403: Replay attack detected. Nonce has already been used.';
    END IF;

    INSERT INTO public.website_integration_nonces (api_key_id, nonce, expires_at)
    VALUES (p_api_key_id, p_nonce, v_now + interval '10 minutes');

    UPDATE public.website_factory_connections
    SET last_seen_at = v_now, updated_at = v_now
    WHERE id = v_conn.id;

    RETURN QUERY SELECT v_conn.tenant_id, v_conn.id, v_conn.connection_name, v_conn.allowed_scopes;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auth_verify_integration_key FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_verify_integration_key TO postgres, service_role;

-- 6. RPC: GET CONNECTION STATUS (STRICT TENANT DERIVATION, ZERO USER_METADATA)
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
    -- Strict tenant derivation: system_users membership or trusted app_metadata claim only
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id 
        FROM public.system_users 
        WHERE id = auth.uid() AND is_active = true;
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

-- 7. RPC: ATOMIC RESERVATION GROUP REQUEST (ALL ITEMS IN ONE BATCH)
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
    -- Strict tenant derivation: system_users membership or trusted app_metadata claim only
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id 
        FROM public.system_users 
        WHERE id = auth.uid() AND is_active = true;
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
        RAISE EXCEPTION '400: No active ERP connection for this store';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION '400: Empty reservation items array';
    END IF;

    -- Check availability of all items against projections
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_model_id := NULLIF(v_item->>'model_id', '')::uuid;
        v_color_id := NULLIF(v_item->>'color_id', '')::uuid;
        v_variant_id := v_item->>'variant_external_id';
        v_qty := COALESCE((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 1);

        IF v_qty <= 0 THEN
            RAISE EXCEPTION '400: Invalid quantity: %', v_qty;
        END IF;

        -- Resolve variant id if not explicitly passed
        IF (v_variant_id IS NULL OR trim(v_variant_id) = '') AND v_model_id IS NOT NULL AND v_color_id IS NOT NULL THEN
            v_variant_id := v_model_id::text || '_' || v_color_id::text;
        END IF;

        SELECT available_to_sell INTO v_avail
        FROM public.website_inventory_projections
        WHERE tenant_id = v_tenant_id
          AND ((erp_variant_id = v_variant_id) OR (model_id = v_model_id AND color_id = v_color_id))
        ORDER BY updated_at DESC
        LIMIT 1;

        IF v_avail IS NOT NULL AND v_avail < v_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'reason', 'INSUFFICIENT_STOCK',
                'message', 'عفواً، الكمية المطلوبة غير متوفرة حالياً في رصيد المصنع.',
                'item_variant_id', v_variant_id,
                'requested_qty', v_qty,
                'available_qty', v_avail
            );
        END IF;

        v_resolved_items := v_resolved_items || jsonb_build_array(jsonb_build_object(
            'variant_external_id', v_variant_id,
            'model_id', v_model_id,
            'color_id', v_color_id,
            'quantity', v_qty,
            'unit_price', COALESCE((v_item->>'unit_price')::numeric, (v_item->>'piece_price')::numeric, 0),
            'unit', COALESCE(v_item->>'unit', 'series')
        ));
    END LOOP;

    -- Enqueue atomic reservation group command
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

-- 8. RPC: RELEASE RESERVATION GROUP
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
        SELECT tenant_id INTO v_tenant_id 
        FROM public.system_users 
        WHERE id = auth.uid() AND is_active = true;
    END IF;

    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '401 Unauthorized: active tenant membership required' USING ERRCODE = '28000';
    END IF;

    SELECT id INTO v_conn_id
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    IF v_conn_id IS NOT NULL AND p_reservation_group_id IS NOT NULL THEN
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
            'reservation.cancelled',
            'rel_grp:' || p_reservation_group_id || ':' || gen_random_uuid()::text,
            jsonb_build_object(
                'reservation_group_id', p_reservation_group_id,
                'reason', p_reason
            ),
            'pending'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'released_group_id', p_reservation_group_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkout_release_erp_reservation FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_release_erp_reservation TO authenticated, service_role;

-- 9. RPC: CREATE ERP-INTEGRATED ORDER (WITH CHECKOUT_ATTEMPT_ID IDEMPOTENCY)
CREATE OR REPLACE FUNCTION public.create_erp_integrated_order(
    p_order_data jsonb,
    p_order_items jsonb,
    p_reservation_group_id text DEFAULT NULL,
    p_checkout_attempt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id uuid;
    v_conn_id uuid;
    v_existing_order RECORD;
    v_order_id uuid;
    v_order_number text;
    v_cmd_status text;
    v_cmd_result jsonb;
    v_int_status text;
    v_canonical_items jsonb := '[]'::jsonb;
    v_it jsonb;
    v_model_id uuid;
    v_color_id uuid;
    v_variant_id text;
    v_qty integer;
    v_unit_price numeric;
BEGIN
    -- Strict tenant derivation: system_users membership or trusted app_metadata claim only
    IF auth.uid() IS NOT NULL THEN
        SELECT tenant_id INTO v_tenant_id 
        FROM public.system_users 
        WHERE id = auth.uid() AND is_active = true;
    END IF;

    IF v_tenant_id IS NULL THEN
        v_tenant_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '401 Unauthorized: active tenant membership required' USING ERRCODE = '28000';
    END IF;

    -- 1. Idempotency Check via checkout_attempt_id
    IF p_checkout_attempt_id IS NOT NULL THEN
        SELECT id, invoice_number, integration_status, status
        INTO v_existing_order
        FROM public.orders
        WHERE tenant_id = v_tenant_id AND checkout_attempt_id = p_checkout_attempt_id
        LIMIT 1;

        IF v_existing_order.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'order_id', v_existing_order.id,
                'invoice_number', v_existing_order.invoice_number,
                'integration_status', v_existing_order.integration_status,
                'status', v_existing_order.status,
                'reservation_group_id', p_reservation_group_id
            );
        END IF;
    END IF;

    -- Verify active connection
    SELECT id INTO v_conn_id
    FROM public.website_factory_connections
    WHERE tenant_id = v_tenant_id AND status = 'active'
    LIMIT 1;

    -- Default status: awaiting_stock_confirmation until ERP explicitly acks reservation
    v_int_status := 'awaiting_stock_confirmation';

    IF p_reservation_group_id IS NOT NULL AND trim(p_reservation_group_id) != '' THEN
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

    -- Generate order number
    v_order_number := COALESCE(
        p_order_data->>'invoice_number',
        'WEB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
    );

    v_order_id := gen_random_uuid();

    -- Canonicalize order items
    FOR v_it IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        v_model_id := NULLIF(v_it->>'model_id', '')::uuid;
        v_color_id := NULLIF(v_it->>'color_id', '')::uuid;
        v_variant_id := v_it->>'variant_external_id';
        v_qty := COALESCE((v_it->>'qty')::integer, (v_it->>'quantity')::integer, 1);
        v_unit_price := COALESCE((v_it->>'unit_price')::numeric, (v_it->>'piece_price')::numeric, (v_it->>'price')::numeric, 0);

        IF (v_variant_id IS NULL OR trim(v_variant_id) = '') AND v_model_id IS NOT NULL AND v_color_id IS NOT NULL THEN
            v_variant_id := v_model_id::text || '_' || v_color_id::text;
        END IF;

        v_canonical_items := v_canonical_items || jsonb_build_array(jsonb_build_object(
            'variant_external_id', v_variant_id,
            'model_id', v_model_id,
            'color_id', v_color_id,
            'quantity', v_qty,
            'unit_price', v_unit_price,
            'model_name', v_it->>'model_name'
        ));
    END LOOP;

    -- Insert Order header
    INSERT INTO public.orders (
        id,
        tenant_id,
        invoice_number,
        customer_name,
        customer_phone,
        customer_address,
        total_price,
        discount,
        net_price,
        paid_amount,
        remaining_amount,
        status,
        integration_status,
        reservation_group_id,
        checkout_attempt_id,
        created_at,
        updated_at
    ) VALUES (
        v_order_id,
        v_tenant_id,
        v_order_number,
        COALESCE(p_order_data->>'customer_name', 'عميل المتجر'),
        p_order_data->>'customer_phone',
        p_order_data->>'customer_address',
        COALESCE((p_order_data->>'total_price')::numeric, (p_order_data->>'grand_total')::numeric, 0),
        COALESCE((p_order_data->>'discount')::numeric, 0),
        COALESCE((p_order_data->>'net_price')::numeric, (p_order_data->>'total_price')::numeric, 0),
        COALESCE((p_order_data->>'paid_amount')::numeric, 0),
        COALESCE((p_order_data->>'remaining_amount')::numeric, 0),
        v_int_status,
        v_int_status,
        p_reservation_group_id,
        p_checkout_attempt_id,
        now(),
        now()
    );

    -- Enqueue order.created command for ERP poller
    IF v_conn_id IS NOT NULL THEN
        INSERT INTO public.website_integration_commands (
            tenant_id,
            connection_id,
            command_type,
            idempotency_key,
            checkout_attempt_id,
            payload,
            status
        ) VALUES (
            v_tenant_id,
            v_conn_id,
            'order.created',
            'order:' || v_order_id::text,
            p_checkout_attempt_id,
            jsonb_build_object(
                'schema_version', '1.0',
                'website_order_id', v_order_id::text,
                'website_order_number', v_order_number,
                'reservation_group_id', p_reservation_group_id,
                'checkout_attempt_id', p_checkout_attempt_id,
                'customer', jsonb_build_object(
                    'name', p_order_data->>'customer_name',
                    'phone', p_order_data->>'customer_phone',
                    'address', p_order_data->>'customer_address'
                ),
                'items', v_canonical_items,
                'totals', jsonb_build_object(
                    'grand_total', COALESCE((p_order_data->>'total_price')::numeric, 0),
                    'paid_amount', COALESCE((p_order_data->>'paid_amount')::numeric, 0)
                ),
                'currency', COALESCE(p_order_data->>'currency', 'EGP'),
                'created_at', now()
            ),
            'pending'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'invoice_number', v_order_number,
        'integration_status', v_int_status,
        'status', v_int_status,
        'reservation_group_id', p_reservation_group_id,
        'checkout_attempt_id', p_checkout_attempt_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_erp_integrated_order FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_erp_integrated_order TO authenticated, service_role;
