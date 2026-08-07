-- =========================================================================
-- 🚀 MIGRATION V69: FIX RLS & GRANTS FOR MODELS, INVENTORY & INBOUND TRANSACTIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-07
-- 💡 Description: Fixes RLS policies and RPC functions for models, model_inventory,
--    model_images, model_sizes, model_colors_inventory, stock_movements, inbound_invoices,
--    and inbound_invoice_items while maintaining strict tenant isolation (public.current_tenant_id()).
-- =========================================================================

-- 1. MODELS TABLE
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "models_public_select" ON public.models;
DROP POLICY IF EXISTS "models_select_public" ON public.models;
DROP POLICY IF EXISTS "models_admin_write" ON public.models;
DROP POLICY IF EXISTS "models_write_admin" ON public.models;
DROP POLICY IF EXISTS "models_strict_tenant_select" ON public.models;
DROP POLICY IF EXISTS "models_strict_tenant_insert" ON public.models;
DROP POLICY IF EXISTS "models_strict_tenant_update" ON public.models;
DROP POLICY IF EXISTS "models_strict_tenant_delete" ON public.models;
DROP POLICY IF EXISTS "Allow select models by tenant" ON public.models;
DROP POLICY IF EXISTS "Allow write models by tenant" ON public.models;

CREATE POLICY "Allow select models by tenant" ON public.models
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write models by tenant" ON public.models
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 2. MODEL_INVENTORY TABLE
ALTER TABLE public.model_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_inventory_public_select" ON public.model_inventory;
DROP POLICY IF EXISTS "model_inventory_select" ON public.model_inventory;
DROP POLICY IF EXISTS "model_inventory_admin_write" ON public.model_inventory;
DROP POLICY IF EXISTS "model_inventory_write_admin" ON public.model_inventory;
DROP POLICY IF EXISTS "Allow select model_inventory by tenant" ON public.model_inventory;
DROP POLICY IF EXISTS "Allow write model_inventory by tenant" ON public.model_inventory;

CREATE POLICY "Allow select model_inventory by tenant" ON public.model_inventory
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write model_inventory by tenant" ON public.model_inventory
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 3. MODEL_IMAGES TABLE
ALTER TABLE public.model_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_images_public_select" ON public.model_images;
DROP POLICY IF EXISTS "model_images_select_public" ON public.model_images;
DROP POLICY IF EXISTS "model_images_admin_write" ON public.model_images;
DROP POLICY IF EXISTS "model_images_write_admin" ON public.model_images;
DROP POLICY IF EXISTS "Allow select model_images by tenant" ON public.model_images;
DROP POLICY IF EXISTS "Allow write model_images by tenant" ON public.model_images;

CREATE POLICY "Allow select model_images by tenant" ON public.model_images
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_images.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

CREATE POLICY "Allow write model_images by tenant" ON public.model_images
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_images.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_images.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

-- 4. MODEL_SIZES TABLE
ALTER TABLE public.model_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_sizes_public_select" ON public.model_sizes;
DROP POLICY IF EXISTS "model_sizes_select_public" ON public.model_sizes;
DROP POLICY IF EXISTS "model_sizes_admin_write" ON public.model_sizes;
DROP POLICY IF EXISTS "model_sizes_write_admin" ON public.model_sizes;
DROP POLICY IF EXISTS "Allow select model_sizes by tenant" ON public.model_sizes;
DROP POLICY IF EXISTS "Allow write model_sizes by tenant" ON public.model_sizes;

CREATE POLICY "Allow select model_sizes by tenant" ON public.model_sizes
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_sizes.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

CREATE POLICY "Allow write model_sizes by tenant" ON public.model_sizes
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_sizes.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_sizes.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

-- 5. MODEL_COLORS_INVENTORY TABLE (IF EXISTS)
ALTER TABLE public.model_colors_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_colors_inventory_public_select" ON public.model_colors_inventory;
DROP POLICY IF EXISTS "model_colors_inventory_admin_write" ON public.model_colors_inventory;
DROP POLICY IF EXISTS "Allow select model_colors_inventory by tenant" ON public.model_colors_inventory;
DROP POLICY IF EXISTS "Allow write model_colors_inventory by tenant" ON public.model_colors_inventory;

CREATE POLICY "Allow select model_colors_inventory by tenant" ON public.model_colors_inventory
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_colors_inventory.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

CREATE POLICY "Allow write model_colors_inventory by tenant" ON public.model_colors_inventory
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_colors_inventory.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.models 
        WHERE models.id = model_colors_inventory.model_id 
        AND (
            models.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

-- 6. STOCK_MOVEMENTS TABLE
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_admin_all" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_strict_tenant_select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_strict_tenant_insert" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_strict_tenant_update" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_strict_tenant_delete" ON public.stock_movements;
DROP POLICY IF EXISTS "Allow select stock_movements by tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "Allow write stock_movements by tenant" ON public.stock_movements;

CREATE POLICY "Allow select stock_movements by tenant" ON public.stock_movements
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write stock_movements by tenant" ON public.stock_movements
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 7. INBOUND_INVOICES TABLE
ALTER TABLE public.inbound_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_invoices ALTER COLUMN supplier_name DROP NOT NULL;
ALTER TABLE public.inbound_invoices ALTER COLUMN supplier_name SET DEFAULT 'توريد داخلي';

DROP POLICY IF EXISTS "inbound_invoices_select" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_write_admin" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_admin_all" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_strict_tenant_select" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_strict_tenant_insert" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_strict_tenant_update" ON public.inbound_invoices;
DROP POLICY IF EXISTS "inbound_invoices_strict_tenant_delete" ON public.inbound_invoices;
DROP POLICY IF EXISTS "Allow select inbound_invoices by tenant" ON public.inbound_invoices;
DROP POLICY IF EXISTS "Allow write inbound_invoices by tenant" ON public.inbound_invoices;

CREATE POLICY "Allow select inbound_invoices by tenant" ON public.inbound_invoices
FOR SELECT USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

CREATE POLICY "Allow write inbound_invoices by tenant" ON public.inbound_invoices
FOR ALL USING (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
) WITH CHECK (
    tenant_id = public.current_tenant_id() 
    OR public.current_tenant_id() IS NULL 
    OR public.is_super_admin() = true
);

-- 8. INBOUND_INVOICE_ITEMS TABLE
ALTER TABLE public.inbound_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbound_invoice_items_admin_all" ON public.inbound_invoice_items;
DROP POLICY IF EXISTS "Allow select inbound_invoice_items by tenant" ON public.inbound_invoice_items;
DROP POLICY IF EXISTS "Allow write inbound_invoice_items by tenant" ON public.inbound_invoice_items;

CREATE POLICY "Allow select inbound_invoice_items by tenant" ON public.inbound_invoice_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.inbound_invoices 
        WHERE inbound_invoices.id = inbound_invoice_items.inbound_invoice_id 
        AND (
            inbound_invoices.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

CREATE POLICY "Allow write inbound_invoice_items by tenant" ON public.inbound_invoice_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.inbound_invoices 
        WHERE inbound_invoices.id = inbound_invoice_items.inbound_invoice_id 
        AND (
            inbound_invoices.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.inbound_invoices 
        WHERE inbound_invoices.id = inbound_invoice_items.inbound_invoice_id 
        AND (
            inbound_invoices.tenant_id = public.current_tenant_id() 
            OR public.current_tenant_id() IS NULL 
            OR public.is_super_admin() = true
        )
    )
);

-- 9. TABLE PERMISSIONS & GRANTS
GRANT ALL ON public.models TO authenticated, anon, service_role;
GRANT ALL ON public.model_inventory TO authenticated, anon, service_role;
GRANT ALL ON public.model_images TO authenticated, anon, service_role;
GRANT ALL ON public.model_sizes TO authenticated, anon, service_role;
GRANT ALL ON public.model_colors_inventory TO authenticated, anon, service_role;
GRANT ALL ON public.stock_movements TO authenticated, anon, service_role;
GRANT ALL ON public.inbound_invoices TO authenticated, anon, service_role;
GRANT ALL ON public.inbound_invoice_items TO authenticated, anon, service_role;

-- 10. RE-DEFINE process_inbound_transaction WITH AUTO-NUMBERING & STRICT TENANT ISOLATION
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
    v_next_num bigint;
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

        UPDATE public.inbound_invoices SET
            supplier_name = COALESCE(NULLIF(TRIM(p_invoice_data->>'supplier_name'), ''), 'توريد داخلي'),
            notes = p_invoice_data->>'notes',
            total_series = COALESCE((p_invoice_data->>'total_series')::integer, 0),
            total_cost = COALESCE((p_invoice_data->>'total_cost')::numeric, 0)
        WHERE id = v_inbound_id;

        DELETE FROM public.inbound_invoice_items WHERE inbound_invoice_id = v_inbound_id;
    ELSE
        -- Automatically generate invoice_number if missing or empty
        v_invoice_number := NULLIF(TRIM(COALESCE(p_invoice_data->>'invoice_number', '')), '');
        IF v_invoice_number IS NULL THEN
            SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
            INTO v_next_num
            FROM public.inbound_invoices
            WHERE tenant_id = v_tenant_id OR (v_tenant_id IS NULL AND tenant_id IS NULL);

            v_invoice_number := 'IN-' || v_next_num::text;
        END IF;

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
        VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'in', v_item.qty, 'توريد رسالة: ' || v_invoice_number, v_inbound_id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'invoice_id', v_inbound_id, 'invoice_number', v_invoice_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_inbound_transaction(uuid, jsonb, jsonb) TO authenticated, anon, service_role;

-- 11. RE-DEFINE delete_inbound_invoice_safely WITH TENANT ISOLATION
CREATE OR REPLACE FUNCTION public.delete_inbound_invoice_safely(
    p_invoice_id uuid
)
RETURNS boolean AS $$
DECLARE
    v_item record;
    v_invoice_number text;
    v_tenant_id uuid;
    v_current_stock int;
    v_model_name text;
    v_color_name text;
BEGIN
    SELECT invoice_number, tenant_id INTO v_invoice_number, v_tenant_id 
    FROM public.inbound_invoices 
    WHERE id = p_invoice_id;

    IF v_invoice_number IS NULL THEN
        RAISE EXCEPTION 'فاتورة الدخل غير موجودة.';
    END IF;

    FOR v_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = p_invoice_id LOOP
        UPDATE public.model_inventory
        SET available_series = available_series - v_item.quantity
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        INSERT INTO public.stock_movements (tenant_id, model_id, color_id, movement_type, quantity, reference)
        VALUES (v_tenant_id, v_item.model_id, v_item.color_id, 'out', v_item.quantity, 'حذف فاتورة دخل: ' || v_invoice_number);
    END LOOP;

    FOR v_item IN SELECT * FROM public.inbound_invoice_items WHERE inbound_invoice_id = p_invoice_id LOOP
        SELECT available_series INTO v_current_stock FROM public.model_inventory
        WHERE model_id = v_item.model_id AND color_id = v_item.color_id;

        IF v_current_stock < 0 THEN
            SELECT name INTO v_model_name FROM public.models WHERE id = v_item.model_id;
            SELECT name INTO v_color_name FROM public.colors WHERE id = v_item.color_id;

            RAISE EXCEPTION 'لا يمكن حذف الفاتورة (%) لأن الموديل (%) لون (%) تم بيع أجزاء منه وسيتسبب الحذف في رصيد سالب.', 
                v_invoice_number,
                COALESCE(v_model_name, 'غير معروف'), 
                COALESCE(v_color_name, 'غير معروف');
        END IF;
    END LOOP;

    DELETE FROM public.inbound_invoices WHERE id = p_invoice_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_inbound_invoice_safely(uuid) TO authenticated, anon, service_role;
