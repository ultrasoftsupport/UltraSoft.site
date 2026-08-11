-- =========================================================================
-- 🚀 MIGRATION V79: RESET ORDER STATUS TO CREATED UPON EDIT TRANSACTION SAVE & ADD PIECE PRICING COLUMNS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-11
-- 💡 Description: Adds missing piece pricing columns (piece_price, sizes_count, total_pieces) to order_items, 
--    and updates process_order_transaction so that updating an existing order 
--    automatically resets status = 'created', unlocks the order, and clears assigned workers/admins.
-- =========================================================================

-- 1. ADD PIECE PRICING COLUMNS TO ORDER_ITEMS TABLE IF MISSING
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sizes_count INT DEFAULT 1;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS piece_price NUMERIC DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total_pieces INT DEFAULT 0;

-- 2. UPDATE PROCESS_ORDER_TRANSACTION FUNCTION
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

        -- التحقق من عدم كون الأوردر مشحوناً مسبقاً
        IF EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = v_order_id 
              AND preparation_status = 'shipped'
        ) THEN
            RAISE EXCEPTION 'عفواً، تم شحن الفاتورة مسبقاً ولا يمكن تعديلها.';
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

        v_invoice_number := nextval('public.invoice_number_seq')::text;

        INSERT INTO public.orders (invoice_number, customer_name, phone_1, phone_2, address, deposit, deposit_receiver, notes, total_price, total_series, worker_id, status)
        VALUES (
          v_invoice_number, p_order_data->>'customer_name', p_order_data->>'phone_1', p_order_data->>'phone_2', p_order_data->>'address',
          (p_order_data->>'deposit')::numeric, p_order_data->>'deposit_receiver', p_order_data->>'notes',
          (p_order_data->>'total_price')::numeric, (p_order_data->>'total_series')::integer, (p_order_data->>'worker_id')::uuid, 'created'
        ) RETURNING id INTO v_order_id;

        UPDATE public.system_users SET invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = (p_order_data->>'worker_id')::uuid;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int)
        LOOP
            INSERT INTO public.model_inventory (model_id, color_id, available_series)
            VALUES (v_item.model_id, v_item.color_id, 0)
            ON CONFLICT (model_id, color_id) DO NOTHING;

            UPDATE public.model_inventory
            SET available_series = available_series - v_item.qty
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

            INSERT INTO public.stock_movements (model_id, color_id, movement_type, quantity, reference)
            VALUES (v_item.model_id, v_item.color_id, 'out', v_item.qty, 'فاتورة رقم ' || v_invoice_number);
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
        'invoice_number', v_invoice_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
