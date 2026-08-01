-- =========================================================================
-- 🌟 MIGRATION V13: FIX SYSTEM RESET FUNCTION 🌟
-- =========================================================================
-- Date: 2026-08-01
-- Description: Updates public.reset_system_data() to comprehensively delete
-- models, images, categories, classes, sizes, colors, promo cards, and notifications
-- in strict foreign key order, ensuring complete wipe capability for the system owner.
-- =========================================================================

BEGIN;

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

ALTER FUNCTION public.reset_system_data() SECURITY DEFINER;

COMMIT;
