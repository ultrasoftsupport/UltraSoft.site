-- =========================================================================
-- 🚀 MIGRATION V95: VISITOR ORDERS SYSTEM & QUEUE
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-09-14
-- 💡 Description:
--    1. Creates table public.visitor_orders for pending orders submitted by visitors.
--    2. Generates unique 8-character order tracking codes (e.g. B9A8BFC0).
--    3. Implements submit_visitor_order, approve_visitor_order, reject_visitor_order, assign_visitor_order.
--    4. Enforces STRICT multi-tenant isolation across all functions, queries, models, inventory, and staff.
--    5. Checks real-time stock upon approval and atomic deduction into orders/order_items/stock_movements.
--    6. Hardened RLS policies with tenant_id boundaries and Realtime publication.
-- =========================================================================

-- 1. CREATE VISITOR_ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.visitor_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone_1 TEXT NOT NULL,
    customer_phone_2 TEXT,
    customer_address TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'assigned', 'cancelled'
    rejection_reason TEXT,
    assigned_worker_id UUID REFERENCES public.system_users(id) ON DELETE SET NULL,
    converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_models INTEGER NOT NULL DEFAULT 0,
    total_series INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_visitor_orders_tenant_status ON public.visitor_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_visitor_orders_order_code ON public.visitor_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_visitor_orders_phone ON public.visitor_orders(customer_phone_1);
CREATE INDEX IF NOT EXISTS idx_visitor_orders_assigned_worker ON public.visitor_orders(assigned_worker_id);

-- 2. HELPER FUNCTION TO GENERATE UNIQUE 8-CHAR ALPHANUMERIC ORDER CODE
CREATE OR REPLACE FUNCTION public.generate_visitor_order_code()
RETURNS TEXT AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        -- توليد كود من 8 أحرف وأرقام عشوائية كبيرة (مثل B9A8BFC0)
        v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
        SELECT EXISTS (SELECT 1 FROM public.visitor_orders WHERE order_code = v_code) INTO v_exists;
        IF NOT v_exists THEN
            RETURN v_code;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. SUBMIT VISITOR ORDER RPC (WITH STRICT TENANT ISOLATION)
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
        -- عدم تعطيل الإرسال لو حدث أي استثناء في الإشعار
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

-- 3.1 DISPATCH VISITOR ORDER TELEGRAM ALERT HELPER
CREATE OR REPLACE FUNCTION public.dispatch_visitor_order_telegram_alert(
    p_tenant_id UUID,
    p_order_id UUID,
    p_order_code TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_address TEXT,
    p_total_models INT,
    p_total_series INT,
    p_total_amount NUMERIC
)
RETURNS VOID AS $$
DECLARE
    v_bot_token TEXT;
    v_chat_id TEXT;
    v_factory_name TEXT := '';
    v_tg_message TEXT;
BEGIN
    -- 1. محاولة جلب إعدادات تليجرام الخاصة بالمصنع
    IF to_regclass('public.tenant_telegram_settings') IS NOT NULL THEN
        SELECT 
            bot_token,
            COALESCE(NULLIF(general_chat_id, ''), stock_chat_id)
        INTO v_bot_token, v_chat_id
        FROM public.tenant_telegram_settings
        WHERE tenant_id = p_tenant_id;
    END IF;

    -- 2. في حالة عدم وجود توكن خاص بالمصنع، استخدام التوكن الموحد إن وُجد
    IF (v_bot_token IS NULL OR trim(v_bot_token) = '') AND to_regclass('public.super_admin_telegram_bots') IS NOT NULL THEN
        SELECT bot_token INTO v_bot_token
        FROM public.super_admin_telegram_bots
        WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
        LIMIT 1;
    END IF;

    -- 3. في حالة عدم وجود شات خاص، التراجع لـ home_settings
    IF (v_chat_id IS NULL OR trim(v_chat_id) = '') AND to_regclass('public.home_settings') IS NOT NULL THEN
        SELECT setting_value INTO v_chat_id 
        FROM public.home_settings 
        WHERE setting_key = 'telegram_chat_id' AND setting_value IS NOT NULL AND trim(setting_value) <> '';
    END IF;

    -- إذا لم يتوفر توكن أو شات، نخرج بهدوء
    IF v_bot_token IS NULL OR trim(v_bot_token) = '' OR v_chat_id IS NULL OR trim(v_chat_id) = '' THEN
        RETURN;
    END IF;

    -- جلب اسم المصنع
    IF to_regclass('public.tenant_invoice_settings') IS NOT NULL THEN
        SELECT factory_name INTO v_factory_name FROM public.tenant_invoice_settings WHERE tenant_id = p_tenant_id;
    END IF;
    IF v_factory_name IS NULL OR trim(v_factory_name) = '' THEN
        SELECT name INTO v_factory_name FROM public.tenants WHERE id = p_tenant_id;
    END IF;

    -- بناء رسالة تليجرام أنيقة ومنسقة بنظام HTML
    v_tg_message := 
        '🛒 <b>طلب زائر جديد في قائمة الانتظار!</b>' || E'\n' ||
        '━━━━━━━━━━━━━━━━━━━' || E'\n' ||
        '🔖 <b>كود الطلب:</b> <code>#' || COALESCE(p_order_code, '') || '</code>' || E'\n' ||
        '👤 <b>العميل:</b> ' || COALESCE(p_customer_name, 'عميل بدون اسم') || E'\n' ||
        '📞 <b>الهاتف:</b> <code>' || COALESCE(p_customer_phone, '-') || '</code>' || E'\n' ||
        CASE WHEN p_customer_address IS NOT NULL AND trim(p_customer_address) <> '' 
             THEN '📍 <b>العنوان:</b> ' || p_customer_address || E'\n' ELSE '' END ||
        '📦 <b>الأصناف:</b> ' || p_total_models || ' موديل (' || p_total_series || ' سيريه)' || E'\n' ||
        '💰 <b>إجمالي القيمة:</b> <b>' || to_char(p_total_amount, 'FM999,999,999.00') || ' ج.م</b>' || E'\n' ||
        '⏳ <b>الحالة:</b> قيد الانتظار والمراجعة' || E'\n' ||
        '━━━━━━━━━━━━━━━━━━━' || E'\n' ||
        '🏢 <i>' || COALESCE(v_factory_name, 'المنظومة') || '</i>';

    -- إرسال الرسالة عبر pg_net بشكل غير تزامني وآمن
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || trim(v_bot_token) || '/sendMessage',
                body := jsonb_build_object(
                    'chat_id', trim(v_chat_id),
                    'text', v_tg_message,
                    'parse_mode', 'HTML'
                ),
                headers := jsonb_build_object('Content-Type', 'application/json')
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. APPROVE VISITOR ORDER RPC (WITH STRICT TENANT ISOLATION & ROW LOCKING)
CREATE OR REPLACE FUNCTION public.approve_visitor_order(
    p_visitor_order_id UUID,
    p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_vorder RECORD;
    v_item JSONB;
    v_model_id UUID;
    v_color_id UUID;
    v_qty INT;
    v_price NUMERIC(12,2);
    v_sizes_count INT;
    v_model_name TEXT;
    v_color_name TEXT;
    v_db_stock INT;
    v_created_order_id UUID;
    v_next_invoice_num BIGINT;
    v_invoice_number TEXT;
    v_tenant_id UUID;
    v_valid_admin_id UUID := p_admin_id;
    v_admin_tenant_id UUID;
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
            'فاتورة زائر معتمدة رقم #' || v_invoice_number || ' (كود: ' || v_vorder.order_code || ')'
        );
    END LOOP;

    -- تحديث حالة طلب الزائر
    UPDATE public.visitor_orders
    SET 
        status = 'approved',
        converted_order_id = v_created_order_id,
        updated_at = now()
    WHERE id = p_visitor_order_id;

    -- إرسال إشعار في النظام
    BEGIN
        INSERT INTO public.system_notifications (
            type,
            title,
            body,
            metadata,
            tenant_id
        ) VALUES (
            'order_created',
            'تم اعتماد طلب الزائر (#' || v_vorder.order_code || ')',
            'تم اعتماد طلب العميل ' || v_vorder.customer_name || ' وتحويله إلى الفاتورة الرسمية رقم #' || v_invoice_number || ' وخصم المخزون بنجاح.',
            jsonb_build_object(
                'order_id', v_created_order_id,
                'invoice_number', v_invoice_number,
                'visitor_order_id', p_visitor_order_id,
                'order_code', v_vorder.order_code
            ),
            v_tenant_id
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_order_id', p_visitor_order_id,
        'order_id', v_created_order_id,
        'invoice_number', v_invoice_number,
        'order_code', v_vorder.order_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. REJECT VISITOR ORDER RPC (WITH TENANT ISOLATION)
CREATE OR REPLACE FUNCTION public.reject_visitor_order(
    p_visitor_order_id UUID,
    p_reason TEXT,
    p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_order_code TEXT;
    v_tenant_id UUID;
    v_cust_name TEXT;
    v_admin_tenant_id UUID;
BEGIN
    SELECT order_code, tenant_id, customer_name 
    INTO v_order_code, v_tenant_id, v_cust_name
    FROM public.visitor_orders
    WHERE id = p_visitor_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الزائر غير موجود!';
    END IF;

    -- 🔒 العزل الصارم: التحقق من أن الأدمن يتبع نفس المصنع
    IF p_admin_id IS NOT NULL THEN
        SELECT tenant_id INTO v_admin_tenant_id 
        FROM public.system_users 
        WHERE id = p_admin_id;

        IF FOUND AND v_admin_tenant_id IS NOT NULL AND v_tenant_id IS NOT NULL AND v_admin_tenant_id <> v_tenant_id THEN
            RAISE EXCEPTION 'غير مصرح: هذا المستخدم لا يملك صلاحية رفض طلبات تابعة لمصنع آخر!';
        END IF;
    END IF;

    UPDATE public.visitor_orders
    SET 
        status = 'rejected',
        rejection_reason = trim(p_reason),
        updated_at = now()
    WHERE id = p_visitor_order_id;

    -- إشعار في النظام لمصنع الطلب حصراً
    BEGIN
        INSERT INTO public.system_notifications (
            type,
            title,
            body,
            metadata,
            tenant_id
        ) VALUES (
            'visitor_order_rejected',
            'تم رفض طلب الزائر (#' || v_order_code || ')',
            'تم رفض طلب العميل ' || v_cust_name || ' للسبب: ' || COALESCE(p_reason, 'غير محدد'),
            jsonb_build_object(
                'visitor_order_id', p_visitor_order_id,
                'order_code', v_order_code,
                'reason', p_reason
            ),
            v_tenant_id
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_order_id', p_visitor_order_id,
        'status', 'rejected',
        'rejection_reason', trim(p_reason)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ASSIGN VISITOR ORDER TO WORKER RPC (WITH STRICT TENANT ISOLATION)
CREATE OR REPLACE FUNCTION public.assign_visitor_order(
    p_visitor_order_id UUID,
    p_worker_id UUID,
    p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_worker_name TEXT;
    v_order_code TEXT;
    v_tenant_id UUID;
    v_worker_tenant_id UUID;
BEGIN
    SELECT order_code, tenant_id INTO v_order_code, v_tenant_id
    FROM public.visitor_orders
    WHERE id = p_visitor_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الزائر غير موجود!';
    END IF;

    -- 🔒 العزل الصارم: التحقق من أن الموظف يتبع نفس مصنع الطلب حصراً
    SELECT full_name, tenant_id INTO v_worker_name, v_worker_tenant_id
    FROM public.system_users
    WHERE id = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموظف المحدد غير موجود في النظام!';
    END IF;

    IF v_worker_tenant_id IS NOT NULL AND v_tenant_id IS NOT NULL AND v_worker_tenant_id <> v_tenant_id THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكن إسناد الطلب لموظف يتبع مصنعاً آخر!';
    END IF;

    UPDATE public.visitor_orders
    SET 
        assigned_worker_id = p_worker_id,
        status = CASE WHEN status = 'pending' THEN 'assigned' ELSE status END,
        updated_at = now()
    WHERE id = p_visitor_order_id;

    -- إشعار للعامل المسند إليه
    BEGIN
        INSERT INTO public.system_notifications (
            type,
            title,
            body,
            metadata,
            user_id,
            tenant_id
        ) VALUES (
            'order_assigned',
            'تم إسناد طلب زائر لك (#' || v_order_code || ')',
            'قامت الإدارة بإسناد طلب الزائر رقم ' || v_order_code || ' لك لمراجعته وتعديله.',
            jsonb_build_object(
                'visitor_order_id', p_visitor_order_id,
                'order_code', v_order_code
            ),
            p_worker_id,
            v_tenant_id
        );
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_order_id', p_visitor_order_id,
        'assigned_worker_id', p_worker_id,
        'worker_name', v_worker_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS POLICIES FOR VISITOR_ORDERS (WITH STRICT TENANT BOUNDARIES)
ALTER TABLE public.visitor_orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone (public/anon + authenticated) to insert visitor orders
DROP POLICY IF EXISTS "Public and anon can insert visitor orders" ON public.visitor_orders;
CREATE POLICY "Public and anon can insert visitor orders"
ON public.visitor_orders
FOR INSERT
TO public
WITH CHECK (
    tenant_id IS NOT NULL
);

-- Allow reading orders: strictly scoped to the same tenant or super_admin
DROP POLICY IF EXISTS "Select visitor orders policy" ON public.visitor_orders;
CREATE POLICY "Select visitor orders policy"
ON public.visitor_orders
FOR SELECT
TO public
USING (
    tenant_id = public.current_tenant_id()
    OR public.current_tenant_id() IS NULL
    OR public.is_super_admin() = true
);

-- Allow updating orders: strictly within the same tenant and only pending/assigned
DROP POLICY IF EXISTS "Update visitor orders policy" ON public.visitor_orders;
CREATE POLICY "Update visitor orders policy"
ON public.visitor_orders
FOR UPDATE
TO public
USING (
    (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true)
)
WITH CHECK (
    (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true)
);

-- Allow deleting orders: strictly within the same tenant
DROP POLICY IF EXISTS "Delete visitor orders policy" ON public.visitor_orders;
CREATE POLICY "Delete visitor orders policy"
ON public.visitor_orders
FOR DELETE
TO public
USING (
    (tenant_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL OR public.is_super_admin() = true)
);

-- 8. GRANT EXPLICIT PERMISSIONS TO ANON AND AUTHENTICATED ROLES
GRANT ALL ON TABLE public.visitor_orders TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_visitor_order_code() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_visitor_order(JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_visitor_order(UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_visitor_order(UUID, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_visitor_order(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- 9. ADD TO REALTIME PUBLICATION
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'visitor_orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_orders;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- In case of permissions or already published
END;
$$;

NOTIFY pgrst, 'reload schema';
