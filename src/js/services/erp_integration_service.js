/**
 * UltraSoft.site - ERP Integration Client Service (Hardened P0)
 * Bridges Website Checkout with ERP Authoritative Stock Reservations & Projections.
 * 
 * Strict Invariants:
 * 1. Uses correct relative import from ../config/supabase.js.
 * 2. Never calls direct .from() on integration tables whose public access was revoked;
 *    uses secure server-side RPC functions exclusively.
 * 3. Never passes caller-provided tenantId; tenant context is authoritatively derived server-side.
 * 4. Never considers an enqueued command as 'reserved'; status is pending_erp_confirmation until ERP ACK.
 * 5. Uses a unified Reservation Group covering all items in the order.
 * 6. Never independently decrements website stock for ERP-managed items.
 */

import { supabase } from '../config/supabase.js';

export class ErpIntegrationService {
    /**
     * Checks if the active tenant has an established, active ERP connection
     * via secure server-side RPC.
     */
    static async getActiveConnection() {
        try {
            const { data, error } = await supabase.rpc('checkout_get_erp_connection_status');
            if (error || !data || !data.has_active_erp) return null;
            return data;
        } catch (e) {
            console.warn('[ErpIntegrationService] Failed to check ERP connection status:', e.message);
            return null;
        }
    }

    /**
     * Requests an atomic stock reservation group from the ERP before confirming a checkout order.
     * All line items in the cart are passed in a single batch.
     */
    static async requestReservationGroup({ items = [], websiteOrderId = null }) {
        try {
            const formattedItems = items.map(it => ({
                model_id: it.model_id || it.modelId,
                color_id: it.color_id || it.colorId,
                variant_external_id: it.variant_external_id || it.variantExternalId || null,
                quantity: Number(it.quantity || it.qty || 1),
                unit: it.unit || 'series'
            }));

            const { data, error } = await supabase.rpc('checkout_request_erp_reservations', {
                p_items: formattedItems,
                p_website_order_id: websiteOrderId
            });

            if (error) {
                console.warn('[ErpIntegrationService] Reservation RPC error:', error.message);
                return {
                    success: true,
                    offline: true,
                    status: 'awaiting_stock_confirmation',
                    message: 'تم استقبال طلبك بنجاح وسيتم تأكيد توفر المخزون عبر إدارة المصنع.'
                };
            }

            if (!data || !data.success) {
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
        } catch (err) {
            console.error('[ErpIntegrationService] Reservation request failed:', err);
            return {
                success: true,
                offline: true,
                status: 'awaiting_stock_confirmation',
                message: 'تم استقبال طلبك وبانتظار اعتماد المصنع للمخزون.'
            };
        }
    }

    /**
     * Submits an order through the ERP-integrated pipeline without independent website stock deduction.
     * Tenant ID is resolved server-side from session.
     */
    static async submitIntegratedOrder({
        orderData,
        orderItems,
        reservationGroupId = null
    }) {
        const { data, error } = await supabase.rpc('create_erp_integrated_order', {
            p_order_data: orderData,
            p_order_items: orderItems,
            p_reservation_group_id: reservationGroupId
        });

        if (error) {
            throw error;
        }

        return data;
    }

    /**
     * Releases a reservation group if the buyer abandons checkout.
     */
    static async releaseReservationGroup({ reservationGroupId, reason = 'cancelled' }) {
        if (!reservationGroupId) return;
        try {
            await supabase.rpc('checkout_release_erp_reservation', {
                p_reservation_group_id: reservationGroupId,
                p_reason: reason
            });
        } catch (e) {
            console.warn('[ErpIntegrationService] Failed to release reservation group:', e.message);
        }
    }
}
