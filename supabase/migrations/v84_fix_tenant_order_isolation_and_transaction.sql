-- =========================================================================
-- 🚀 MIGRATION V84: FIX TENANT ORDER ISOLATION & PROCESS_ORDER_TRANSACTION
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-02
-- 💡 Description:
--    1. Updates process_order_transaction to explicitly save tenant_id for new orders
--       and auto-derive tenant_id from worker_id if omitted.
--    2. Enforces per-tenant isolated sequential invoice numbering starting from 1.
--    3. Retroactively reassigns existing orders to their proper tenant based on
--       the creating worker's tenant_id, fixing cross-tenant order leakage!
-- =========================================================================

-- 1. UPDATE PROCESS_ORDER_TRANSACTION FUNCTION WITH ROBUST TENANT ISOLATION
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
    v_tenant_id uuid;
    v_worker_id uuid;
    v_next_invoice_num bigint;
BEGIN
    -- استخراج worker_id
    v_worker_id := (p_order_data->>'worker_id')::uuid;

    -- استخراج tenant_id بالترتيب الآتي لضمان عدم حدوث أي خطأ:
    -- 1) من بيانات الأوردر المرسلة
    -- 2) من حساب العامل/المستخدم منشئ الأوردر في system_users
    -- 3) من الجلسة الحالية
    -- 4) المصنع الافتراضي
    v_tenant_id := COALESCE(
        (p_order_data->>'tenant_id')::uuid,
        (SELECT tenant_id FROM public.system_users WHERE id = v_worker_id),
        public.current_tenant_id(),
        '00000000-0000-0000-0000-000000000001'::uuid
    );

    IF p_order_id IS NOT NULL THEN
        v_order_id := p_order_id;

        -- التحقق من عدم كون الأوردر مشحوناً مسبقاً
        IF EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = v_order_id 
              AND preparation_status = 'shipped'
        ) THEN
            RAISE EXCEPTION 'عفواً، تم شحن الفاتورة مسبقاً ولا يمكن تعديلها.';
        END IF;

        -- الحفاظ على tenant_id الأصلي للأوردر إذا كان موجوداً
        SELECT COALESCE(tenant_id, v_tenant_id), invoice_number 
        INTO v_tenant_id, v_invoice_number 
        FROM public.orders WHERE id = v_order_id;

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
                INSERT INTO public.model_inventory (tenant_id, model_id, color_id, available_series)
                VALUES (v_tenant_id, v_diff_record.model_id, v_diff_record.color_id, 0)
                ON CONFLICT (model_id, color_id) DO UPDATE
                SET tenant_id = EXCLUDED.tenant_id;

                UPDATE public.model_inventory
                SET available_series = available_series - v_diff_record.diff
                WHERE model_id = v_diff_record.model_id AND color_id = v_diff_record.color_id;

                INSERT INTO public.stock_movements (tenant_id, model_id, color_id, movement_type, quantity, reference)
                VALUES (
                    v_tenant_id,
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
            tenant_id = v_tenant_id,
            customer_name = p_order_data->>'customer_name',
            phone_1 = p_order_data->>'phone_1',
            phone_2 = p_order_data->>'phone_2',
            address = p_order_data->>'address',
            deposit = (p_order_data->>'deposit')::numeric,
            deposit_receiver = p_order_data->>'deposit_receiver',
            notes = p_order_data->>'notes',
            total_price = (p_order_data->>'total_price')::numeric,
            total_series = (p_order_data->>'total_series')::integer,
            status = 'created',
            is_locked = false,
            assigned_admin_name = NULL,
            assigned_worker_id = NULL
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

        -- توليد رقم الفاتورة التسلسلي المستقل لكل مصنع على حدة (يبدأ من 1 لكل مصنع)
        SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
        INTO v_next_invoice_num
        FROM public.orders
        WHERE tenant_id = v_tenant_id;

        v_invoice_number := v_next_invoice_num::text;

        -- حفظ الأوردر مع الـ tenant_id الصحيح للمصنع
        INSERT INTO public.orders (
            tenant_id, invoice_number, customer_name, phone_1, phone_2, address, 
            deposit, deposit_receiver, notes, total_price, total_series, worker_id, status
        )
        VALUES (
          v_tenant_id,
          v_invoice_number, p_order_data->>'customer_name', p_order_data->>'phone_1', p_order_data->>'phone_2', p_order_data->>'address',
          (p_order_data->>'deposit')::numeric, p_order_data->>'deposit_receiver', p_order_data->>'notes',
          (p_order_data->>'total_price')::numeric, (p_order_data->>'total_series')::integer, v_worker_id, 'created'
        ) RETURNING id INTO v_order_id;

        IF v_worker_id IS NOT NULL THEN
            UPDATE public.system_users SET invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = v_worker_id;
        END IF;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int)
        LOOP
            INSERT INTO public.model_inventory (tenant_id, model_id, color_id, available_series)
            VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 0)
            ON CONFLICT (model_id, color_id) DO UPDATE
            SET tenant_id = EXCLUDED.tenant_id;

            UPDATE public.model_inventory
            SET available_series = available_series - v_item.qty
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

            INSERT INTO public.stock_movements (tenant_id, model_id, color_id, movement_type, quantity, reference)
            VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'out', v_item.qty, 'فاتورة رقم ' || v_invoice_number);
        END LOOP;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int, price numeric, total numeric, sizes_count int, piece_price numeric)
    LOOP
        INSERT INTO public.order_items (order_id, model_id, color_id, quantity, price_per_series, total_price, sizes_count, piece_price, total_pieces)
        VALUES (
          v_order_id, 
          v_item.model_id, 
          v_item.color_id, 
          v_item.qty, 
          COALESCE(v_item.price, 0), 
          COALESCE(v_item.total, 0),
          COALESCE(v_item.sizes_count, 1),
          COALESCE(v_item.piece_price, CASE WHEN COALESCE(v_item.sizes_count, 1) > 0 THEN COALESCE(v_item.price, 0) / COALESCE(v_item.sizes_count, 1) ELSE COALESCE(v_item.price, 0) END),
          COALESCE(v_item.qty, 0) * COALESCE(v_item.sizes_count, 1)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'invoice_number', v_invoice_number,
        'tenant_id', v_tenant_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_order_transaction(uuid, jsonb, jsonb) TO anon, authenticated, service_role;

-- =========================================================================
-- 2. تصحيح الأوردرات القديمة ونقلها تلقائياً لمصانعها الحقيقية
-- =========================================================================

-- نقل كل أوردر إلى المصنع الخاص بالعامل/المستخدم الذي قام بإنشائه
UPDATE public.orders o
SET tenant_id = u.tenant_id
FROM public.system_users u
WHERE o.worker_id = u.id 
  AND u.tenant_id IS NOT NULL 
  AND (o.tenant_id IS NULL OR o.tenant_id != u.tenant_id);

-- تحديث حركات المخزون المرتبطة بتلك الأوردرات
UPDATE public.stock_movements sm
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE sm.reference LIKE ('%' || o.invoice_number)
  AND (sm.tenant_id IS NULL OR sm.tenant_id != o.tenant_id);
