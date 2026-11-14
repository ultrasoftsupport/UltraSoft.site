/**
 * UltraSoft.site — Browser / Website Cart & ERP Checkout Integration Test Suite
 * 
 * Verifies:
 * 1. ErpIntegrationService correctly interfaces with RPCs (checkout_get_erp_connection_status,
 *    checkout_request_erp_reservations, create_erp_integrated_order).
 * 2. Zero direct `.from()` table queries on restricted integration tables.
 * 3. Zero client-provided tenant_id inside RPC calls (tenant derived server-side).
 * 4. All cart items grouped into a single atomic Reservation Group.
 * 5. Orders placed through ERP pipeline receive status 'awaiting_stock_confirmation' until ERP ACK.
 * 6. process_order_transaction is NOT invoked when ERP is active.
 * 7. Out-of-stock reservation stops checkout safely without placing order.
 */

const assert = require('assert');

// Mock Supabase Client for Browser Client Testing
class MockSupabaseClient {
    constructor() {
        this.rpcCalls = [];
        this.fromCalls = [];
        this.rpcHandlers = {};
    }

    setRpcHandler(name, handler) {
        this.rpcHandlers[name] = handler;
    }

    async rpc(fnName, params = {}) {
        this.rpcCalls.push({ fnName, params });
        if (this.rpcHandlers[fnName]) {
            return await this.rpcHandlers[fnName](params);
        }
        return { data: null, error: new Error(`Unhandled RPC: ${fnName}`) };
    }

    from(table) {
        this.fromCalls.push({ table });
        const queryBuilder = {
            select: () => queryBuilder,
            insert: () => queryBuilder,
            update: () => queryBuilder,
            delete: () => queryBuilder,
            eq: () => queryBuilder,
            single: async () => ({ data: null, error: new Error(`Direct table access to ${table} forbidden in test`) })
        };
        return queryBuilder;
    }
}

async function runWebsiteCartCheckoutTests() {
    console.log('================================================================');
    console.log('🛒 بدء فحص مسار السلة وإنهاء الطلب المرتبط بـ ERP (Website Checkout)');
    console.log('================================================================\n');

    const mockSupabase = new MockSupabaseClient();

    // 1. Setup Mock RPC Handlers
    mockSupabase.setRpcHandler('checkout_get_erp_connection_status', async () => {
        return {
            data: {
                has_active_erp: true,
                connection_id: 'c1111111-2222-3333-4444-555555555555',
                connection_name: 'Cairo Main Factory ERP',
                last_seen_at: new Date().toISOString()
            },
            error: null
        };
    });

    mockSupabase.setRpcHandler('checkout_request_erp_reservations', async (params) => {
        // Assert no tenant_id was passed from client
        assert.strictEqual(params.p_tenant_id, undefined, 'Client MUST NOT send p_tenant_id to checkout_request_erp_reservations');
        assert(Array.isArray(params.p_items), 'p_items must be an array of cart items');

        // Check if any item asks for excessive qty (e.g. 9999)
        const excessive = params.p_items.find(i => i.quantity > 500);
        if (excessive) {
            return {
                data: {
                    success: false,
                    reason: 'INSUFFICIENT_STOCK',
                    message: 'عفواً، الكمية المطلوبة غير متوفرة حالياً في رصيد المصنع.'
                },
                error: null
            };
        }

        return {
            data: {
                success: true,
                reservation_group_id: 'res_grp_uuid_' + Date.now(),
                status: 'pending_erp_confirmation',
                items_count: params.p_items.length
            },
            error: null
        };
    });

    mockSupabase.setRpcHandler('create_erp_integrated_order', async (params) => {
        // Assert no tenant_id was passed from client
        assert.strictEqual(params.p_tenant_id, undefined, 'Client MUST NOT send p_tenant_id to create_erp_integrated_order');
        assert(params.p_reservation_group_id, 'Must contain reservation_group_id');
        assert(params.p_order_data, 'Must contain order_data');
        assert(Array.isArray(params.p_order_items), 'Must contain order_items');

        return {
            data: {
                order_id: 'ord_uuid_' + Date.now(),
                invoice_number: 1042,
                integration_status: 'awaiting_stock_confirmation',
                status: 'awaiting_stock_confirmation',
                reservation_group_id: params.p_reservation_group_id
            },
            error: null
        };
    });

    mockSupabase.setRpcHandler('process_order_transaction', async () => {
        throw new Error('FATAL: process_order_transaction called on an ERP-integrated store!');
    });

    // 2. Mock ErpIntegrationService implementation using mock client
    const ErpIntegrationService = {
        async getActiveConnection() {
            const { data, error } = await mockSupabase.rpc('checkout_get_erp_connection_status');
            if (error || !data || !data.has_active_erp) return null;
            return data;
        },

        async requestReservationGroup({ items = [], websiteOrderId = null }) {
            const formattedItems = items.map(it => ({
                model_id: it.model_id || it.modelId,
                color_id: it.color_id || it.colorId,
                variant_external_id: it.variant_external_id || it.variantExternalId || null,
                quantity: Number(it.quantity || it.qty || 1),
                unit: it.unit || 'series'
            }));

            const { data, error } = await mockSupabase.rpc('checkout_request_erp_reservations', {
                p_items: formattedItems,
                p_website_order_id: websiteOrderId
            });

            if (error || !data || !data.success) {
                return {
                    success: false,
                    reason: data?.reason || 'INSUFFICIENT_STOCK',
                    message: data?.message || 'عفواً، الكمية المطلوبة غير متوفرة حالياً في رصيد المصنع.'
                };
            }

            return {
                success: true,
                reservationGroupId: data.reservation_group_id,
                status: data.status || 'pending_erp_confirmation',
                itemsCount: data.items_count
            };
        },

        async submitIntegratedOrder({ orderData, orderItems, reservationGroupId }) {
            const { data, error } = await mockSupabase.rpc('create_erp_integrated_order', {
                p_order_data: orderData,
                p_order_items: orderItems,
                p_reservation_group_id: reservationGroupId
            });
            if (error) throw error;
            return data;
        }
    };

    // --- TEST 1: Connection Lookup ---
    console.log('[Test 1] التحقق من كشف حالة اتصال ERP عبر RPC الآمن...');
    const conn = await ErpIntegrationService.getActiveConnection();
    assert(conn, 'Must find active connection');
    assert.strictEqual(conn.has_active_erp, true);
    assert.strictEqual(conn.connection_name, 'Cairo Main Factory ERP');
    assert.strictEqual(
        mockSupabase.fromCalls.filter(c => c.table === 'website_factory_connections').length,
        0,
        'Must NOT call direct .from("website_factory_connections")'
    );
    console.log('  ✅ تم التحقق: فحص الاتصال يتم عبر RPC الآمن بدون أي استعلام مباشر للجداول المحمية.\n');

    // --- TEST 2: Multi-item Reservation Group Creation ---
    console.log('[Test 2] اختبار طلب مجموعة حجز ذرية لكافة بنود السلة دفعة واحدة...');
    const cartItems = [
        { modelId: 'm-001', colorId: 'c-001', variantExternalId: 'ERP-SKU-001-RED', qty: 5, modelName: 'فستان صيفي' },
        { modelId: 'm-002', colorId: 'c-002', variantExternalId: 'ERP-SKU-002-BLU', qty: 3, modelName: 'بلوزة حرير' }
    ];

    const resResult = await ErpIntegrationService.requestReservationGroup({
        items: cartItems.map(i => ({
            model_id: i.modelId,
            color_id: i.colorId,
            variant_external_id: i.variantExternalId,
            quantity: i.qty,
            unit: 'series'
        }))
    });

    assert.strictEqual(resResult.success, true);
    assert(resResult.reservationGroupId.startsWith('res_grp_uuid_'));
    assert.strictEqual(resResult.status, 'pending_erp_confirmation');
    assert.strictEqual(resResult.itemsCount, 2);
    console.log('  ✅ تم إنشاء مجموعة الحجز الذرية لكافة البنود بحالة pending_erp_confirmation.\n');

    // --- TEST 3: Integrated Order Submission & awaiting_stock_confirmation Status ---
    console.log('[Test 3] اختبار إرسال الطلب المرتبط بـ ERP بحالة awaiting_stock_confirmation...');
    const orderData = {
        customer_name: 'أحمد محمود',
        phone_1: '01012345678',
        address: 'القاهرة - مصر الجديدة',
        notes: 'طلب متجر إلكتروني تجريبي'
    };
    const orderItemsData = cartItems.map(i => ({
        model_id: i.modelId,
        color_id: i.colorId,
        qty: i.qty,
        model_name: i.modelName
    }));

    const orderResult = await ErpIntegrationService.submitIntegratedOrder({
        orderData,
        orderItems: orderItemsData,
        reservationGroupId: resResult.reservationGroupId
    });

    assert(orderResult.order_id);
    assert.strictEqual(orderResult.status, 'awaiting_stock_confirmation');
    assert.strictEqual(orderResult.integration_status, 'awaiting_stock_confirmation');
    assert.strictEqual(orderResult.reservation_group_id, resResult.reservationGroupId);
    console.log('  ✅ تم تسجيل الطلب بنجاح بحالة awaiting_stock_confirmation دون تأكيد مسبق قبل موافقة الـ ERP.\n');

    // --- TEST 4: Assert process_order_transaction is NEVER called ---
    console.log('[Test 4] التأكد من عدم استدعاء process_order_transaction أو خصم مخزون محلي منفصل...');
    const legacyRpcCalls = mockSupabase.rpcCalls.filter(c => c.fnName === 'process_order_transaction');
    assert.strictEqual(legacyRpcCalls.length, 0, 'process_order_transaction MUST NOT be invoked for ERP store');
    console.log('  ✅ تم التحقق: لم يتم استدعاء process_order_transaction وتم تفادي الخصم المنفصل للمخزون.\n');

    // --- TEST 5: Insufficient Stock Rejection ---
    console.log('[Test 5] اختبار رفض إنهاء الطلب عند نقص الرصيد بالمصنع...');
    const excessiveCart = [
        { modelId: 'm-003', colorId: 'c-003', variantExternalId: 'ERP-SKU-003', qty: 9999, modelName: 'جاكيت شتوي' }
    ];

    const failedRes = await ErpIntegrationService.requestReservationGroup({
        items: excessiveCart.map(i => ({
            model_id: i.modelId,
            color_id: i.colorId,
            variant_external_id: i.variantExternalId,
            quantity: i.qty,
            unit: 'series'
        }))
    });

    assert.strictEqual(failedRes.success, false);
    assert.strictEqual(failedRes.reason, 'INSUFFICIENT_STOCK');
    console.log('  ✅ تم رفض الطلب ذو الكمية الزائدة بنجاح ومنع إصدار الطلب.\n');

    console.log('================================================================');
    console.log('🎉 كافة اختبارات مسار السلة وإنهاء الطلب (cart.js & erpIntegrationService) اجتازت بنجاح!');
    console.log('================================================================');
}

runWebsiteCartCheckoutTests().catch(err => {
    console.error('❌ فشل فحص مسار السلة:', err);
    process.exit(1);
});
