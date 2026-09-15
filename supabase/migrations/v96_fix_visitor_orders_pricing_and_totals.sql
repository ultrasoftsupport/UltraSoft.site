-- ==============================================================================
-- 🚀 MIGRATION V96: FIX VISITOR ORDERS PRICING, PIECE PRICE & TOTALS (NO DECIMALS)
-- ==============================================================================
-- 1. Updates submit_visitor_order to calculate total amount based on (qty * sizes_count * piece_price)
-- 2. Updates approve_visitor_order to insert piece_price and price_per_series correctly into order_items
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_visitor_order(
    p_order_data JSONB,
    p_order_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
    v_order_code TEXT;
    v_order_id UUID;
    v_item JSONB;
    v_total_models INT := 0;
    v_total_series INT := 0;
    v_total_amount NUMERIC(12,2) := 0.00;
    v_db_stock INT;
    v_model_id UUID;
    v_color_id UUID;
    v_qty INT;
    v_price NUMERIC(12,2);
    v_sizes_count INT;
    v_model_name TEXT;
    v_color_name TEXT;
BEGIN
    -- 🔒 استخراج أو تحديد معرف المصنع بدقة متناهية
    IF p_order_data->>'tenant_id' IS NOT NULL AND (p_order_data->>'tenant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        v_tenant_id := (p_order_data->>'tenant_id')::uuid;
    ELSIF p_order_data->>'tenant_slug' IS NOT NULL AND p_order_data->>'tenant_slug' <> '' THEN
        SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = (p_order_data->>'tenant_slug') AND status = 'active' LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
        v_tenant_id := public.current_tenant_id();
    END IF;

    -- في حال تعذر تحديد المصنع، جلب أول مصنع نشط كإجراء احترازي
    IF v_tenant_id IS NULL THEN
        SELECT id INTO v_tenant_id FROM public.tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المصنع التابع له الطلب!';
    END IF;

    IF p_order_items IS NULL OR jsonb_array_length(p_order_items) = 0 THEN
        RAISE EXCEPTION 'لا توجد أصناف في السلة لإرسال الطلب!';
    END IF;

    -- التحقق المبدئي من عزل المصنع ووفرة المخزون وحساب الإجماليات
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        v_model_id := (v_item->>'model_id')::uuid;
        v_color_id := (v_item->>'color_id')::uuid;
        v_qty := COALESCE((v_item->>'qty')::int, 0);
        v_price := COALESCE((v_item->>'piece_price')::numeric, (v_item->>'price')::numeric, 0.00);
        v_sizes_count := COALESCE((v_item->>'sizes_count')::int, 1);
        IF v_sizes_count <= 0 THEN v_sizes_count := 1; END IF;
        v_model_name := COALESCE(v_item->>'model_name', '');
        v_color_name := COALESCE(v_item->>'color_name', '');

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'الكمية المطلوبة يجب أن تكون أكبر من صفر للصنف %', v_model_name;
        END IF;

        -- 🛡️ العزل الصارم: التحقق من أن الموديل يتبع نفس المصنع حصراً لمنع خلط الموديلات بين المصانع
        IF NOT EXISTS (
            SELECT 1 FROM public.models 
            WHERE id = v_model_id AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        ) THEN
            RAISE EXCEPTION 'الموديل [%] لا يتبع هذا المصنع! غير مسموح بطلب موديلات عبر مصانع أخرى.', v_model_name;
        END IF;

        -- فحص المخزون الحالي الخاص بنفس المصنع
        SELECT available_series INTO v_db_stock
        FROM public.model_inventory
        WHERE model_id = v_model_id AND color_id = v_color_id
          AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL);

        IF COALESCE(v_db_stock, 0) < v_qty THEN
            RAISE EXCEPTION 'عجز في المخزون: الموديل [%] لون [%] المتاح منه بالمخزن [%] سيريه فقط والمطلوب [%]',
                v_model_name, v_color_name, COALESCE(v_db_stock, 0), v_qty;
        END IF;

        v_total_series := v_total_series + v_qty;
        v_total_amount := v_total_amount + (v_qty * v_sizes_count * v_price);
    END LOOP;

    -- حساب عدد الموديلات الفريدة
    SELECT count(DISTINCT (x->>'model_id')) INTO v_total_models
    FROM jsonb_array_elements(p_order_items) as x;

    -- توليد كود الطلب
    v_order_code := public.generate_visitor_order_code();

    -- إدراج الطلب في جدول طلبات الزوار مع ربطه الصارم بالمصنع
    INSERT INTO public.visitor_orders (
        order_code,
        tenant_id,
        customer_name,
        customer_phone_1,
        customer_phone_2,
        customer_address,
        notes,
        status,
        items,
        total_models,
        total_series,
        total_amount
    ) VALUES (
        v_order_code,
        v_tenant_id,
        trim(p_order_data->>'customer_name'),
        trim(p_order_data->>'customer_phone_1'),
        nullif(trim(p_order_data->>'customer_phone_2'), ''),
        trim(p_order_data->>'customer_address'),
        nullif(trim(p_order_data->>'notes'), ''),
        'pending',
        p_order_items,
        v_total_models,
        v_total_series,
        v_total_amount
    )
    RETURNING id INTO v_order_id;

    -- إرسال إشعار في نظام الإشعارات لإعلام إدارة هذا المصنع حصراً
    BEGIN
        INSERT INTO public.system_notifications (
            type,
            title,
            body,
            metadata,
            tenant_id
        ) VALUES (
            'visitor_order_created',
            'طلب زائر جديد (#' || v_order_code || ')',
            'وصل طلب جديد من الزائر: ' || trim(p_order_data->>'customer_name') || ' بقيمة ' || v_total_amount || ' ج.م وهو الآن في قائمة الانتظار.',
            jsonb_build_object(
                'visitor_order_id', v_order_id,
                'order_code', v_order_code,
                'customer_name', trim(p_order_data->>'customer_name'),
                'total_amount', v_total_amount
            ),
            v_tenant_id
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- إرسال تنبيه Telegram فوري للمصنع عبر البوت
    BEGIN
        PERFORM public.dispatch_visitor_order_telegram_alert(
            v_tenant_id,
            v_order_id,
            v_order_code,
            trim(p_order_data->>'customer_name'),
            trim(p_order_data->>'customer_phone_1'),
            trim(p_order_data->>'customer_address'),
            v_total_models,
            v_total_series,
            v_total_amount
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_code', v_order_code,
        'total_amount', v_total_amount,
        'total_series', v_total_series,
        'customer_name', trim(p_order_data->>'customer_name'),
        'customer_phone', trim(p_order_data->>'customer_phone_1')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.approve_visitor_order(
    p_visitor_order_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_vorder RECORD;
    v_tenant_id UUID;
    v_created_order_id UUID;
    v_invoice_number TEXT;
    v_next_invoice_num BIGINT;
    v_item JSONB;
    v_model_id UUID;
    v_color_id UUID;
    v_qty INT;
    v_price NUMERIC(12,2);
    v_sizes_count INT;
    v_db_stock INT;
    v_valid_admin_id UUID := p_admin_user_id;
    v_admin_tenant_id UUID;
    v_model_name TEXT;
    v_color_name TEXT;
BEGIN
    -- جلب طلب الزائر وقفله للفحص
    SELECT * INTO v_vorder
    FROM public.visitor_orders
    WHERE id = p_visitor_order_id AND is_deleted = false
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الزائر غير موجود أو تم حذفه مسبقاً!';
    END IF;

    IF v_vorder.status = 'approved' THEN
        RAISE EXCEPTION 'هذا الطلب معتمد ومحول لأوردر نشط بالفعل برقم فاتورة سابق!';
    END IF;

    v_tenant_id := v_vorder.tenant_id;

    -- 🔒 العزل الصارم: التحقق من أن الأدمن ينتمي لنفس مصنع الطلب (أو سوبر أدمن)
    IF v_valid_admin_id IS NOT NULL THEN
        SELECT tenant_id INTO v_admin_tenant_id 
        FROM public.system_users 
        WHERE id = v_valid_admin_id;

        IF FOUND AND v_admin_tenant_id IS NOT NULL AND v_tenant_id IS NOT NULL AND v_admin_tenant_id <> v_tenant_id THEN
            RAISE EXCEPTION 'غير مصرح: هذا المستخدم لا يملك صلاحية اعتماد طلبات تابعة لمصنع آخر!';
        END IF;
    END IF;

    -- التحقق من المخزون اللحظي لكل صنف لمصنع الطلب وقفل السطور بالـ FOR UPDATE
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_vorder.items)
    LOOP
        v_model_id := (v_item->>'model_id')::uuid;
        v_color_id := (v_item->>'color_id')::uuid;
        v_qty := COALESCE((v_item->>'qty')::int, 0);
        v_model_name := COALESCE(v_item->>'model_name', '');
        v_color_name := COALESCE(v_item->>'color_name', '');

        SELECT available_series INTO v_db_stock
        FROM public.model_inventory
        WHERE model_id = v_model_id AND color_id = v_color_id
          AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL)
        FOR UPDATE;

        IF COALESCE(v_db_stock, 0) < v_qty THEN
            RAISE EXCEPTION 'تعذر اعتماد الطلب! عجز في المخزون: الموديل [%] لون [%] المتاح حالياً [%] سيريه فقط والمطلوب [%] سيريه. يرجى تعديل الطلب أو زيادة المخزون أولاً.',
                v_model_name, v_color_name, COALESCE(v_db_stock, 0), v_qty;
        END IF;
    END LOOP;

    -- توليد رقم الفاتورة التسلسلي المستقل تماماً لهذا المصنع
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1 
    INTO v_next_invoice_num
    FROM public.orders
    WHERE tenant_id = v_tenant_id;

    v_invoice_number := v_next_invoice_num::text;

    -- التحقق من وجود v_valid_admin_id في system_users
    IF v_valid_admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.system_users WHERE id = v_valid_admin_id) THEN
        v_valid_admin_id := NULL;
    END IF;

    -- إنشاء الأوردر في جدول orders بالأعمدة المطابقة لنظام المصنع بدقة متناهية
    INSERT INTO public.orders (
        tenant_id,
        invoice_number,
        customer_name,
        phone_1,
        phone_2,
        address,
        deposit,
        deposit_receiver,
        notes,
        total_price,
        total_series,
        worker_id,
        status,
        preparation_status,
        created_at
    ) VALUES (
        v_tenant_id,
        v_invoice_number,
        v_vorder.customer_name,
        v_vorder.customer_phone_1,
        v_vorder.customer_phone_2,
        v_vorder.customer_address,
        0.00,
        NULL,
        COALESCE(v_vorder.notes, '') || ' (طلب زائر محول - كود: ' || v_vorder.order_code || ')',
        v_vorder.total_amount,
        v_vorder.total_series,
        v_valid_admin_id,
        'created',
        'pending',
        now()
    )
    RETURNING id INTO v_created_order_id;

    -- تحديث عداد فواتير الموظف إذا وجد
    IF v_valid_admin_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET invoice_count = COALESCE(invoice_count, 0) + 1 
        WHERE id = v_valid_admin_id;
    END IF;

    -- خصم المخزون وإدراج order_items وتسجيل stock_movements للمصنع المحدد حصراً
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_vorder.items)
    LOOP
        v_model_id := (v_item->>'model_id')::uuid;
        v_color_id := (v_item->>'color_id')::uuid;
        v_qty := COALESCE((v_item->>'qty')::int, 0);
        v_price := COALESCE((v_item->>'piece_price')::numeric, (v_item->>'price')::numeric, 0.00);
        v_sizes_count := COALESCE((v_item->>'sizes_count')::int, 1);
        IF v_sizes_count <= 0 THEN v_sizes_count := 1; END IF;

        -- إدراج في order_items
        INSERT INTO public.order_items (
            order_id,
            model_id,
            color_id,
            quantity,
            price_per_series,
            total_price,
            sizes_count,
            piece_price,
            total_pieces
        ) VALUES (
            v_created_order_id,
            v_model_id,
            v_color_id,
            v_qty,
            round(v_price * v_sizes_count),
            round(v_qty * v_sizes_count * v_price),
            v_sizes_count,
            round(v_price),
            v_qty * v_sizes_count
        );

        -- خصم المخزون بصورة آمنة خاصة بنفس المصنع
        INSERT INTO public.model_inventory (tenant_id, model_id, color_id, available_series)
        VALUES (v_tenant_id, v_model_id, v_color_id, 0)
        ON CONFLICT (model_id, color_id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id;

        UPDATE public.model_inventory
        SET available_series = available_series - v_qty
        WHERE model_id = v_model_id AND color_id = v_color_id
          AND (tenant_id = v_tenant_id OR v_tenant_id IS NULL);

        -- تسجيل حركة المخزون
        INSERT INTO public.stock_movements (
            tenant_id,
            model_id,
            color_id,
            movement_type,
            quantity,
            reference
        ) VALUES (
            v_tenant_id,
            v_model_id,
            v_color_id,
            'out',
            v_qty,
            'فاتورة زائر رقم ' || v_invoice_number || ' (طلب #' || v_vorder.order_code || ')'
        );
    END LOOP;

    -- تحديث حالة طلب الزائر إلى معتمد
    UPDATE public.visitor_orders
    SET 
        status = 'approved',
        updated_at = now()
    WHERE id = p_visitor_order_id;

    -- إرسال إشعار في نظام الإشعارات لإعلام الإدارة بنجاح الاعتماد
    BEGIN
        INSERT INTO public.system_notifications (
            type,
            title,
            body,
            metadata,
            tenant_id
        ) VALUES (
            'visitor_order_approved',
            'تم اعتماد طلب زائر (#' || v_vorder.order_code || ')',
            'تم تحويل طلب الزائر: ' || v_vorder.customer_name || ' إلى فاتورة مبيعات نشطة برقم (#' || v_invoice_number || ').',
            jsonb_build_object(
                'visitor_order_id', p_visitor_order_id,
                'order_id', v_created_order_id,
                'order_code', v_vorder.order_code,
                'invoice_number', v_invoice_number,
                'customer_name', v_vorder.customer_name
            ),
            v_tenant_id
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_created_order_id,
        'invoice_number', v_invoice_number,
        'order_code', v_vorder.order_code,
        'total_amount', v_vorder.total_amount,
        'customer_name', v_vorder.customer_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
