-- =========================================================================
-- 🚀 MIGRATION V80: FIX INBOUND INVOICE PER-TENANT UNIQUE CONSTRAINT & EDIT INVENTORY REVERSION
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-11
-- 💡 Description: 
--    1. Changes inbound_invoices unique constraint from global to per-tenant UNIQUE (tenant_id, invoice_number).
--    2. Fixes process_inbound_transaction when editing an inbound invoice so that old items' 
--       quantities are properly reverted from model_inventory BEFORE applying the new quantities.
-- =========================================================================

-- 1. DROP GLOBAL UNIQUE CONSTRAINT AND ADD PER-TENANT COMPOSITE UNIQUE CONSTRAINT
DO $$
BEGIN
    ALTER TABLE public.inbound_invoices DROP CONSTRAINT IF EXISTS inbound_invoices_invoice_number_key;
    ALTER TABLE public.inbound_invoices DROP CONSTRAINT IF EXISTS inbound_invoices_tenant_invoice_number_key;
    DROP INDEX IF EXISTS public.inbound_invoices_invoice_number_key;
    DROP INDEX IF EXISTS public.inbound_invoices_tenant_invoice_number_key;

    ALTER TABLE public.inbound_invoices ADD CONSTRAINT inbound_invoices_tenant_invoice_number_key UNIQUE (tenant_id, invoice_number);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Inbound invoices constraint update info: %', SQLERRM;
END $$;

-- 2. RE-DEFINE PROCESS_INBOUND_TRANSACTION WITH PROPER EDIT INVENTORY REVERSION & TENANT AUTO-NUMBERING
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
    v_old_item record;
    v_next_num bigint;
    v_current_stock int;
    v_model_name text;
    v_color_name text;
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

        IF v_invoice_number IS NULL THEN
            RAISE EXCEPTION 'فاتورة الدخل غير موجودة.';
        END IF;

        -- 1. Revert stock levels from previous invoice items before modifying
        FOR v_old_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = v_inbound_id LOOP
            UPDATE public.model_inventory
            SET available_series = available_series - v_old_item.quantity
            WHERE model_id = v_old_item.model_id AND color_id = v_old_item.color_id;
        END LOOP;

        -- 2. Clean up previous stock movements for this inbound invoice
        DELETE FROM public.stock_movements WHERE inbound_id = v_inbound_id;

        -- 3. Delete previous inbound invoice items
        DELETE FROM public.inbound_invoice_items WHERE inbound_invoice_id = v_inbound_id;

        -- 4. Update header details
        UPDATE public.inbound_invoices SET
            supplier_name = COALESCE(NULLIF(TRIM(p_invoice_data->>'supplier_name'), ''), 'توريد داخلي'),
            notes = p_invoice_data->>'notes',
            total_series = COALESCE((p_invoice_data->>'total_series')::integer, 0),
            total_cost = COALESCE((p_invoice_data->>'total_cost')::numeric, 0)
        WHERE id = v_inbound_id;
    ELSE
        -- Automatically generate invoice_number scoped to this tenant if missing or empty
        v_invoice_number := NULLIF(TRIM(COALESCE(p_invoice_data->>'invoice_number', '')), '');
        
        IF v_invoice_number IS NULL THEN
            SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
            INTO v_next_num
            FROM public.inbound_invoices
            WHERE tenant_id = v_tenant_id OR (v_tenant_id IS NULL AND tenant_id IS NULL);

            v_invoice_number := 'IN-' || v_next_num::text;
        END IF;

        -- Guarantee uniqueness per tenant to prevent duplicate key violations
        WHILE EXISTS (
            SELECT 1 FROM public.inbound_invoices 
            WHERE (tenant_id = v_tenant_id OR (v_tenant_id IS NULL AND tenant_id IS NULL)) 
            AND invoice_number = v_invoice_number
        ) LOOP
            v_next_num := v_next_num + 1;
            v_invoice_number := 'IN-' || v_next_num::text;
        END LOOP;

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

    -- Process new items
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
        VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'in', v_item.qty, 
            CASE WHEN p_invoice_id IS NOT NULL THEN 'تعديل توريد رسالة: ' ELSE 'توريد رسالة: ' END || v_invoice_number, 
            v_inbound_id);
    END LOOP;

    -- Validate that no stock level became negative due to quantity reductions
    IF p_invoice_id IS NOT NULL THEN
        FOR v_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = v_inbound_id LOOP
            SELECT available_series INTO v_current_stock FROM public.model_inventory
            WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

            IF v_current_stock < 0 THEN
                SELECT name INTO v_model_name FROM public.models WHERE id = v_item.model_id;
                SELECT name INTO v_color_name FROM public.colors WHERE id = v_item.color_id;

                RAISE EXCEPTION 'لا يمكن حفظ التعديل للموديل (%) لون (%) لأن الكمية المتاحة بالمخزن ستصبح بالسالب (%).', 
                    COALESCE(v_model_name, 'غير معروف'), 
                    COALESCE(v_color_name, 'غير معروف'),
                    v_current_stock;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_inbound_id, 'invoice_number', v_invoice_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_inbound_transaction(uuid, jsonb, jsonb) TO authenticated, anon, service_role;
