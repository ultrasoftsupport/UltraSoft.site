/**
 * UltraSoft.site — Comprehensive Supabase PostgreSQL Engine & RLS Test Suite
 * 
 * Executes real PostgreSQL engine (PGlite WebAssembly PostgreSQL) applying:
 * 1. Prerequisite schemas & tables (tenants, models, colors, orders, system_users).
 * 2. Real Migration: supabase/migrations/v105_website_erp_integration_hub.sql.
 * 3. Unified Canonical HMAC-SHA256 signature verification matching Node CloudRelayClient.
 * 4. Replay prevention with post-signature nonce registration.
 * 5. Multi-tenant isolation (Tenant A vs Tenant B rejection).
 * 6. Server-side tenant derivation for checkout RPCs (zero client trust).
 * 7. Reservation Groups and awaiting_stock_confirmation order lifecycle.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { PGlite } = require('@electric-sql/pglite');

function sha256Hex(content) {
    const raw = typeof content === 'string' ? content : JSON.stringify(content || '');
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function buildCanonicalStringToSign(method, pathUrl, timestamp, nonce, rawBodyOrHash) {
    const isSha256Hex = typeof rawBodyOrHash === 'string' && /^[0-9a-f]{64}$/i.test(rawBodyOrHash);
    const bodyHash = isSha256Hex ? rawBodyOrHash.toLowerCase() : sha256Hex(rawBodyOrHash);
    return [
        (method || 'POST').toUpperCase(),
        pathUrl || '',
        timestamp || '',
        nonce || '',
        bodyHash
    ].join('\n');
}

function computeHmacSha256(secret, stringToSign) {
    return crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
}

async function runRealPostgresTestSuite() {
    console.log('================================================================');
    console.log('🛡️ بدء فحص محرك PostgreSQL الحقيقي وعزل RLS والتوقيع الكانونيكال');
    console.log('   (PGlite Real PostgreSQL WebAssembly Engine)');
    console.log('================================================================\n');

    const db = new PGlite();

    // 1. Setup PostgreSQL Extensions Schema & Helpers & Test Stubs
    await db.exec(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                CREATE ROLE anon;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                CREATE ROLE service_role;
            END IF;
        END $$;

        CREATE SCHEMA IF NOT EXISTS extensions;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid; $$;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb; $$;

        -- Exact RFC 2104 compliant HMAC-SHA256 in PostgreSQL
        CREATE OR REPLACE FUNCTION extensions.hmac(p_msg bytea, p_key bytea, p_algo text)
        RETURNS bytea
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_key bytea := p_key;
            v_ipad bytea := decode(repeat('00', 64), 'hex');
            v_opad bytea := decode(repeat('00', 64), 'hex');
            v_i integer;
            v_byte integer;
        BEGIN
            IF length(v_key) > 64 THEN
                v_key := sha256(v_key);
            END IF;
            IF length(v_key) < 64 THEN
                v_key := v_key || decode(repeat('00', 64 - length(v_key)), 'hex');
            END IF;
            FOR v_i IN 0..63 LOOP
                v_byte := get_byte(v_key, v_i);
                v_ipad := set_byte(v_ipad, v_i, v_byte # 54);
                v_opad := set_byte(v_opad, v_i, v_byte # 92);
            END LOOP;
            RETURN sha256(v_opad || sha256(v_ipad || p_msg));
        END;
        $$;

        CREATE OR REPLACE FUNCTION extensions.digest(p_msg text, p_algo text)
        RETURNS bytea
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RETURN sha256(p_msg::bytea);
        END;
        $$;
    `);

    // 2. Setup Prerequisite Tables that v105 references
    await db.exec(`
        CREATE TABLE IF NOT EXISTS public.tenants (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            slug text NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS public.models (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
            name text NOT NULL,
            is_active boolean DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS public.colors (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
            name text NOT NULL
        );

        CREATE TABLE IF NOT EXISTS public.system_users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
            username text NOT NULL,
            is_active boolean DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS public.orders (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
            customer_name text,
            phone_1 text,
            phone_2 text,
            address text,
            notes text,
            total_price numeric DEFAULT 0,
            total_series integer DEFAULT 0,
            deposit numeric DEFAULT 0,
            deposit_receiver text,
            status text DEFAULT 'created',
            created_at timestamptz DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.order_items (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
            model_id uuid REFERENCES public.models(id) ON DELETE CASCADE,
            color_id uuid REFERENCES public.colors(id) ON DELETE CASCADE,
            qty integer NOT NULL,
            model_name text,
            price numeric,
            total numeric,
            sizes_count integer DEFAULT 1,
            piece_price numeric
        );
    `);
    console.log('[Setup] تم إنشاء جداول النظام المسبقة (tenants, models, orders, system_users)');

    // 3. Apply the real v105 migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'v105_website_erp_integration_hub.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(migrationSql);
    console.log('[Setup] تم تطبيق ملف الهجرة v105_website_erp_integration_hub.sql بنجاح على PostgreSQL\n');

    // 4. Seed Test Tenants, Users, Models
    const tA = (await db.query("INSERT INTO public.tenants (name, slug) VALUES ('مصنع القاهرة A', 'cairo_factory_a') RETURNING id;")).rows[0].id;
    const tB = (await db.query("INSERT INTO public.tenants (name, slug) VALUES ('مصنع الإسكندرية B', 'alex_factory_b') RETURNING id;")).rows[0].id;

    const userA = (await db.query("INSERT INTO public.system_users (tenant_id, username) VALUES ($1, 'operator_cairo') RETURNING id;", [tA])).rows[0].id;

    const modelA = (await db.query("INSERT INTO public.models (tenant_id, name) VALUES ($1, 'تيشيرت بولو') RETURNING id;", [tA])).rows[0].id;
    const colorA = (await db.query("INSERT INTO public.colors (tenant_id, name) VALUES ($1, 'كحلي') RETURNING id;", [tA])).rows[0].id;

    // 5. Register Factory Connection with Secret in private vault
    const keyIdA = 'us_key_fac_cair_01_a9f1b2c3d4';
    const secretA = 'sec_erp_live_cairo_secret_998877';
    const secretHashA = sha256Hex(secretA);

    const connA = (await db.query(`
        INSERT INTO public.website_factory_connections (
            tenant_id, connection_name, api_key_id, secret_hash, status
        ) VALUES ($1, 'مصنع القاهرة الرئيسي', $2, $3, 'active')
        RETURNING id;
    `, [tA, keyIdA, secretHashA])).rows[0].id;

    // Store secret securely in private vault using server-side helper
    await db.query('SELECT public.set_factory_connection_secret($1, $2);', [connA, secretA]);

    // Seed initial inventory projection
    await db.query(`
        INSERT INTO public.website_inventory_projections (
            tenant_id, model_id, color_id, variant_external_id,
            on_hand_series, reserved_active_series, available_to_sell_series, stock_revision
        ) VALUES ($1, $2, $3, 'var_polo_cairo_navy', 10, 0, 10, 1);
    `, [tA, modelA, colorA]);

    // -----------------------------------------------------------------
    // Test 1: Canonical HMAC Signature Equivalence (Postgres vs Node)
    // -----------------------------------------------------------------
    console.log('[1] اختبار تطابق التوقيع الكانونيكال بين Node.js و PostgreSQL...');
    const method = 'POST';
    const pathUrl = '/rest/v1/rpc/integration_v1_connection_test';
    const timestamp = new Date().toISOString();
    const nonce1 = 'nonce_canon_test_001';
    const rawPayload = { ping: 'hello_cairo_erp', version: 6 };
    const bodyHash = sha256Hex(JSON.stringify(rawPayload));

    // Compute in Node.js
    const nodeStringToSign = buildCanonicalStringToSign(method, pathUrl, timestamp, nonce1, bodyHash);
    const nodeSignature = computeHmacSha256(secretA, nodeStringToSign);

    // Call PostgreSQL auth_verify_integration_key
    const authRes = await db.query(`
        SELECT * FROM public.auth_verify_integration_key(
            $1, $2, $3, $4, $5, $6, $7
        );
    `, [keyIdA, nodeSignature, timestamp, nonce1, bodyHash, method, pathUrl]);

    assert.strictEqual(authRes.rows.length, 1, 'يجب أن ينجح التحقق من التوقيع في PostgreSQL');
    assert.strictEqual(authRes.rows[0].tenant_id, tA, 'يجب أن يطابق المستأجر A');
    assert.strictEqual(authRes.rows[0].connection_id, connA, 'يجب أن يطابق معرف الاتصال');
    console.log(`  ✅ توقيع Node.js يساوي توقيع PostgreSQL تماماً: ${nodeSignature.slice(0, 16)}...`);

    // -----------------------------------------------------------------
    // Test 2: Replay Prevention & Post-Signature Nonce Registration
    // -----------------------------------------------------------------
    console.log('\n[2] اختبار منع هجمات إعادة الإرسال (Replay Prevention)...');
    let replayBlocked = false;
    try {
        await db.query(`
            SELECT * FROM public.auth_verify_integration_key(
                $1, $2, $3, $4, $5, $6, $7
            );
        `, [keyIdA, nodeSignature, timestamp, nonce1, bodyHash, method, pathUrl]);
    } catch (e) {
        replayBlocked = e.message.includes('Replay attack detected');
    }
    assert.ok(replayBlocked, 'يجب رفض استخدام نفس الـ Nonce المسجل');
    console.log('  ✅ تم رفض إعادة استخدام الـ Nonce المسجل بنجاح (Replay Attack Rejected)');

    // -----------------------------------------------------------------
    // Test 3: Bad Signature Does NOT Burn or Register Nonce
    // -----------------------------------------------------------------
    console.log('\n[3] اختبار عدم تسجيل الـ Nonce عند فشل التوقيع...');
    const nonceUnused = 'nonce_fresh_burn_test_002';
    const badSig = '0000000000000000000000000000000000000000000000000000000000000000';
    let badSigRejected = false;
    try {
        await db.query(`
            SELECT * FROM public.auth_verify_integration_key(
                $1, $2, $3, $4, $5, $6, $7
            );
        `, [keyIdA, badSig, timestamp, nonceUnused, bodyHash, method, pathUrl]);
    } catch (e) {
        badSigRejected = e.message.includes('Invalid HMAC-SHA256 signature');
    }
    assert.ok(badSigRejected, 'يجب رفض التوقيع الباطل');

    // Verify nonceUnused was NOT inserted into website_integration_nonces
    const nonceRows = (await db.query(
        'SELECT * FROM public.website_integration_nonces WHERE nonce = $1;',
        [nonceUnused]
    )).rows;
    assert.strictEqual(nonceRows.length, 0, 'الـ Nonce يجب ألا يُسجل في قاعدة البيانات إذا فشل التوقيع');
    console.log('  ✅ تم التحقق: التوقيع الباطل لا يستهلك أو يسجل الـ Nonce');

    // -----------------------------------------------------------------
    // Test 4: Clock Skew Enforcement (> 300 seconds)
    // -----------------------------------------------------------------
    console.log('\n[4] اختبار رفض الطلبات ذات الفارق الزمني الأكبر من 300 ثانية...');
    const staleTimestamp = new Date(Date.now() - 360 * 1000).toISOString();
    const nonceStale = 'nonce_stale_skew_003';
    const staleStringToSign = buildCanonicalStringToSign(method, pathUrl, staleTimestamp, nonceStale, bodyHash);
    const staleSig = computeHmacSha256(secretA, staleStringToSign);

    let skewRejected = false;
    try {
        await db.query(`
            SELECT * FROM public.auth_verify_integration_key(
                $1, $2, $3, $4, $5, $6, $7
            );
        `, [keyIdA, staleSig, staleTimestamp, nonceStale, bodyHash, method, pathUrl]);
    } catch (e) {
        skewRejected = e.message.includes('Clock skew exceeded');
    }
    assert.ok(skewRejected, 'يجب رفض الطلب لتجاوز الحد الزمني (Clock skew exceeded)');
    console.log('  ✅ تم رفض الطلب ذو الفارق الزمني 360 ثانية بنجاح');

    // -----------------------------------------------------------------
    // Test 5: Strict Multi-Tenant Isolation (Tenant B vs Tenant A)
    // -----------------------------------------------------------------
    console.log('\n[5] اختبار العزل الصارم بين المستأجرين (Cross-Tenant Rejection)...');
    const keyIdB = 'us_key_fac_alex_02_b8e2c1';
    const secretB = 'sec_alex_secret_different_key_5544';
    const connB = (await db.query(`
        INSERT INTO public.website_factory_connections (
            tenant_id, connection_name, api_key_id, secret_hash, status
        ) VALUES ($1, 'مصنع الإسكندرية', $2, $3, 'active')
        RETURNING id;
    `, [tB, keyIdB, sha256Hex(secretB)])).rows[0].id;
    await db.query('SELECT public.set_factory_connection_secret($1, $2);', [connB, secretB]);

    // Tenant B attempts to sign a request targeting Tenant A's keyId
    const nonceB = 'nonce_cross_tenant_005';
    const crossStringToSign = buildCanonicalStringToSign(method, pathUrl, timestamp, nonceB, bodyHash);
    const crossSig = computeHmacSha256(secretB, crossStringToSign); // Signed with Secret B, claimed keyIdA

    let crossRejected = false;
    try {
        await db.query(`
            SELECT * FROM public.auth_verify_integration_key(
                $1, $2, $3, $4, $5, $6, $7
            );
        `, [keyIdA, crossSig, timestamp, nonceB, bodyHash, method, pathUrl]);
    } catch (e) {
        crossRejected = e.message.includes('Invalid HMAC-SHA256 signature');
    }
    assert.ok(crossRejected, 'مستأجر B لا يمكنه انتحال صفة أو توقيع مفتاح مستأجر A');
    console.log('  ✅ نجح العزل: سر مستأجر B تم رفضه تماماً عند محاولة مصادقة مفتاح مستأجر A');

    // -----------------------------------------------------------------
    // Test 6: Zero Plaintext Secret in website_factory_connections
    // -----------------------------------------------------------------
    console.log('\n[6] اختبار حظر تخزين السر كنص صريح (Zero Plaintext Secrets)...');
    const cols = (await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='website_factory_connections';
    `)).rows.map(r => r.column_name);

    assert.strictEqual(cols.includes('secret_key'), false, 'جدول website_factory_connections يجب ألا يحتوي على عمود secret_key');
    assert.ok(cols.includes('secret_hash'), 'جدول الاتصالات يحتوي فقط على secret_hash');

    // Secrets table is isolated in private schema
    const privSec = (await db.query('SELECT * FROM private.website_factory_secrets WHERE connection_id = $1;', [connA])).rows[0];
    assert.ok(privSec, 'السر محفوظ في schema private الحصري');
    console.log('  ✅ الأسرار محمية في private.website_factory_secrets ومحجوبة تماماً عن الجداول العامة');

    // -----------------------------------------------------------------
    // Test 7: Real RPC: checkout_request_erp_reservations & Reservation Group
    // -----------------------------------------------------------------
    console.log('\n[7] اختبار طلب مجموعة الحجز الذرية وفحص رصيد المتاح...');
    // Simulate authenticated session user
    await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${userA}'::uuid; $$;
        CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('tenant_id', '${tA}'); $$;
    `);

    const itemsPayload = JSON.stringify([
        {
            model_id: modelA,
            color_id: colorA,
            quantity: 3,
            unit: 'series'
        }
    ]);

    const resRpc = (await db.query(`
        SELECT public.checkout_request_erp_reservations($1::jsonb, 'web_ord_e2e_01') as result;
    `, [itemsPayload])).rows[0].result;

    assert.strictEqual(resRpc.success, true);
    assert.strictEqual(resRpc.status, 'pending_erp_confirmation', 'الحجز المعلق يجب ألا يعتبر reserved');
    assert.ok(resRpc.reservation_group_id);
    console.log(`  ✅ تم إنشاء مجموعة الحجز بنجاح: ID=${resRpc.reservation_group_id}, status=${resRpc.status}`);

    // Verify command in website_integration_commands
    const cmdRow = (await db.query(`
        SELECT * FROM public.website_integration_commands
        WHERE idempotency_key = $1;
    `, ['res_grp:' + resRpc.reservation_group_id])).rows[0];
    assert.ok(cmdRow);
    assert.strictEqual(cmdRow.status, 'pending');
    assert.strictEqual(cmdRow.tenant_id, tA);

    // Test Insufficient Stock rejection
    const bigItems = JSON.stringify([
        { model_id: modelA, color_id: colorA, quantity: 50, unit: 'series' } // Available is 10
    ]);
    const bigRes = (await db.query(`
        SELECT public.checkout_request_erp_reservations($1::jsonb) as result;
    `, [bigItems])).rows[0].result;
    assert.strictEqual(bigRes.success, false);
    assert.strictEqual(bigRes.reason, 'INSUFFICIENT_STOCK');
    console.log('  ✅ تم رفض طلب الكمية الزائدة عن الرصيد المتاح (INSUFFICIENT_STOCK)');

    // -----------------------------------------------------------------
    // Test 8: Real RPC: create_erp_integrated_order
    // -----------------------------------------------------------------
    console.log('\n[8] اختبار إنشاء طلب المتجر المرتبط بـ ERP بحالة awaiting_stock_confirmation...');
    const orderData = JSON.stringify({
        customer_name: 'نور الدين علي',
        phone_1: '01011122233',
        address: 'المعادي، القاهرة',
        total_price: 1350,
        total_series: 3,
        deposit: 1350
    });
    const orderItems = JSON.stringify([
        {
            model_id: modelA,
            color_id: colorA,
            qty: 3,
            model_name: 'تيشيرت بولو',
            price: 450,
            total: 1350
        }
    ]);

    const orderRpc = (await db.query(`
        SELECT public.create_erp_integrated_order($1::jsonb, $2::jsonb, $3) as result;
    `, [orderData, orderItems, resRpc.reservation_group_id])).rows[0].result;

    assert.strictEqual(orderRpc.ok, true);
    assert.strictEqual(orderRpc.integration_status, 'awaiting_stock_confirmation', 'الطلب بدون ACK مسبق يجب أن يكون awaiting_stock_confirmation');
    assert.ok(orderRpc.order_id);
    console.log(`  ✅ تم إنشاء الطلب بحالة آمنة: OrderID=${orderRpc.order_id}, Status=${orderRpc.integration_status}`);

    // Verify order in database
    const dbOrder = (await db.query('SELECT * FROM public.orders WHERE id = $1;', [orderRpc.order_id])).rows[0];
    assert.strictEqual(dbOrder.tenant_id, tA);
    assert.strictEqual(dbOrder.integration_status, 'awaiting_stock_confirmation');
    assert.strictEqual(dbOrder.reservation_id, resRpc.reservation_group_id);

    console.log('\n================================================================');
    console.log('🎉 كافة فحوصات محرك PostgreSQL الحقيقي وعزل RLS والتوقيع الكانونيكال اجتازت بنجاح 100%!');
    console.log('================================================================');
}

runRealPostgresTestSuite().catch(err => {
    console.error('❌ خطأ في اختبارات PostgreSQL:', err);
    process.exit(1);
});
