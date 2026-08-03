-- =========================================================================
-- 🚀 MIGRATION V25: ADD TENANT_ID TO MODEL_INVENTORY AND FIX TRANSACTION RPC
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds tenant_id column to public.model_inventory and updates
--    process_order_transaction RPC to ensure error-free order saves/edits!
-- =========================================================================

-- 1. Ensure tenant_id column exists on public.model_inventory table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'model_inventory' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.model_inventory ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Populate tenant_id for existing rows from parent models table
UPDATE public.model_inventory mi
SET tenant_id = m.tenant_id
FROM public.models m
WHERE mi.model_id = m.id AND mi.tenant_id IS NULL;

UPDATE public.model_inventory 
SET tenant_id = '00000000-0000-0000-0000-000000000001' 
WHERE tenant_id IS NULL;

-- 3. Replace process_order_transaction RPC with clean tenant handling
CREATE OR REPLACE FUNCTION public.process_order_transaction(
    p_order_id uuid,
    p_order_data jsonb,
    p_order_items jsonb
) RETURNS jsonb AS $$
DECLARE
    v_order_id uuid;
    v_invoice_number text;
    v_tenant_id uuid;
    v_item record;
    v_diff_record record;
    v_current_stock int;
    v_next_invoice_num bigint;
BEGIN
    -- Determine tenant_id from order_data or auth context
    v_tenant_id := (p_order_data->>'tenant_id')::uuid;
    IF v_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.system_users WHERE id = auth.uid();
    END IF;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    IF p_order_id IS NOT NULL THEN
        v_order_id := p_order_id;
        
        SELECT invoice_number, tenant_id INTO v_invoice_number, v_tenant_id
        FROM public.orders 
        WHERE id = v_order_id;

        IF v_tenant_id IS NULL THEN
            v_tenant_id := (p_order_data->>'tenant_id')::uuid;
        END IF;

        -- Verify stock for additions
        FOR v_diff_record IN 
            SELECT 
                coalesce(new_items.model_id, old_items.model_id) as model_id,
                coalesce(new_items.color_id, old_items.color_id) as color_id,
                coalesce(new_items.qty, 0) - coalesce(old_items.quantity, 0) as diff,
                new_items.model_name
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

        -- Apply stock changes and log movements
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
                ON CONFLICT (model_id, color_id) DO NOTHING;

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
            total_series = (p_order_data->>'total_series')::integer
        WHERE id = v_order_id;

    ELSE
        -- NEW ORDER CREATION
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int, model_name text)
        LOOP
            SELECT available_series INTO v_current_stock FROM public.model_inventory
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id FOR UPDATE;

            IF COALESCE(v_current_stock, 0) < v_item.qty THEN
               RAISE EXCEPTION 'الكمية المطلوبة من الموديل % غير متوفرة بالمخزن. المتاح: %', COALESCE(v_item.model_name, ''), COALESCE(v_current_stock, 0);
            END IF;
        END LOOP;

        -- Generate sequential invoice number per tenant
        SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
        INTO v_next_invoice_num
        FROM public.orders
        WHERE tenant_id = v_tenant_id;

        v_invoice_number := v_next_invoice_num::text;

        INSERT INTO public.orders (
            tenant_id, invoice_number, customer_name, phone_1, phone_2, address, 
            deposit, deposit_receiver, notes, total_price, total_series, worker_id
        )
        VALUES (
          v_tenant_id,
          v_invoice_number, p_order_data->>'customer_name', p_order_data->>'phone_1', p_order_data->>'phone_2', p_order_data->>'address',
          (p_order_data->>'deposit')::numeric, p_order_data->>'deposit_receiver', p_order_data->>'notes',
          (p_order_data->>'total_price')::numeric, (p_order_data->>'total_series')::integer, (p_order_data->>'worker_id')::uuid
        ) RETURNING id INTO v_order_id;

        UPDATE public.system_users SET invoice_count = COALESCE(invoice_count, 0) + 1 WHERE id = (p_order_data->>'worker_id')::uuid;

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(model_id uuid, color_id uuid, qty int)
        LOOP
            INSERT INTO public.model_inventory (tenant_id, model_id, color_id, available_series)
            VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 0)
            ON CONFLICT (model_id, color_id) DO NOTHING;

            UPDATE public.model_inventory SET available_series = available_series - v_item.qty
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

            INSERT INTO public.stock_movements (tenant_id, model_id, color_id, movement_type, quantity, reference)
            VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'out', v_item.qty, 'فاتورة مبيعات: ' || v_invoice_number);
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
