-- =========================================================================
-- 🌟 MIGRATION V87: 24/7 AUTOMATED TELEGRAM REPORT SCHEDULER (PG_CRON) 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-09-03
-- الإصدار: v87.0
-- الوصف: 
-- 1. إنشاء جدول سجل تنفيذ التقارير المجدولة لمنع التكرار (tenant_scheduled_report_logs).
-- 2. دالة توليد وإرسال التقرير التنفيذي الشامل مباشرة من قاعدة البيانات (generate_and_send_tenant_telegram_report).
-- 3. دالة فحص مواعيد الجدولة التلقائية لكل مصنع (execute_tenant_scheduled_reports).
-- 4. ربط الجدولة بمحرك pg_cron ليعمل كل دقيقة على مدار الساعة (24/7).
-- =========================================================================

-- 1. جدول تسجيل عمليات إرسال التقارير التلقائية لضمان عدم التكرار
CREATE TABLE IF NOT EXISTS public.tenant_scheduled_report_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    report_type text NOT NULL,
    execution_key text NOT NULL UNIQUE,
    status text DEFAULT 'success',
    error_message text,
    executed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_sched_report_logs_key ON public.tenant_scheduled_report_logs(execution_key);
CREATE INDEX IF NOT EXISTS idx_tenant_sched_report_logs_tenant ON public.tenant_scheduled_report_logs(tenant_id, executed_at DESC);

ALTER TABLE public.tenant_scheduled_report_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service and authenticated read logs" ON public.tenant_scheduled_report_logs;
CREATE POLICY "Allow service and authenticated read logs" 
ON public.tenant_scheduled_report_logs 
FOR SELECT 
TO authenticated, service_role 
USING (true);

-- 2. دالة توليد وإرسال التقرير التنفيذي الشامل عبر Telegram
CREATE OR REPLACE FUNCTION public.generate_and_send_tenant_telegram_report(
    p_tenant_id uuid,
    p_report_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bot_token text;
    v_reports_chat_id text;
    v_reports_enabled boolean := true;
    v_factory_name text := '';
    
    v_now_cairo timestamp;
    v_start_date timestamptz;
    v_end_date timestamptz;
    
    v_report_title text;
    v_period_desc text;
    v_time_str text;
    
    v_total_sales numeric := 0;
    v_total_deposits numeric := 0;
    v_remaining numeric := 0;
    v_orders_count integer := 0;
    v_avg_order numeric := 0;
    v_total_series integer := 0;
    v_total_pieces integer := 0;
    
    v_models_text text := '';
    v_colors_text text := '';
    v_staff_text text := '';
    v_daily_text text := '';
    v_message text;
    
    v_rec record;
    v_idx integer := 0;
    v_medals text[] := ARRAY['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
BEGIN
    -- أ) جلب إعدادات البوت والجروب للمصنع
    SELECT bot_token, reports_chat_id, reports_enabled
    INTO v_bot_token, v_reports_chat_id, v_reports_enabled
    FROM public.tenant_telegram_settings
    WHERE tenant_id = p_tenant_id;
    
    -- إذا لم تكن مفعلة للمصنع، نخرج
    IF v_reports_enabled = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'تقارير التليجرام معطلة لهذا المصنع');
    END IF;
    
    -- التراجع للتوكن الموحد إن لم يكن للمصنع توكن خاص
    IF v_bot_token IS NULL OR trim(v_bot_token) = '' THEN
        SELECT bot_token INTO v_bot_token
        FROM public.super_admin_telegram_bots
        WHERE bot_token IS NOT NULL AND trim(bot_token) <> ''
        LIMIT 1;
    END IF;
    
    -- التراجع لجروب التقارير الموحد إن لم يكن للمصنع جروب خاص
    IF v_reports_chat_id IS NULL OR trim(v_reports_chat_id) = '' THEN
        SELECT chat_id INTO v_reports_chat_id
        FROM public.super_admin_telegram_bots
        WHERE bot_key = 'reports_bot' AND chat_id IS NOT NULL AND trim(chat_id) <> ''
        LIMIT 1;
    END IF;
    
    IF v_bot_token IS NULL OR v_reports_chat_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'بيانات البوت أو الجروب غير مكتملة');
    END IF;

    -- ب) جلب اسم المصنع
    SELECT factory_name INTO v_factory_name
    FROM public.tenant_invoice_settings
    WHERE tenant_id = p_tenant_id;
    
    IF v_factory_name IS NULL OR trim(v_factory_name) = '' THEN
        SELECT name INTO v_factory_name
        FROM public.tenants
        WHERE id = p_tenant_id;
    END IF;
    v_factory_name := COALESCE(v_factory_name, 'المصنع الرئيسي');

    -- ج) حساب التوقيت والفترة الزمنية بتوقيت القاهرة
    v_now_cairo := now() AT TIME ZONE 'Africa/Cairo';
    v_time_str := to_char(v_now_cairo, 'HH12:MI') || CASE WHEN to_char(v_now_cairo, 'AM') = 'AM' THEN ' صباحاً' ELSE ' مساءً' END;
    
    IF p_report_type = 'daily' THEN
        v_report_title := 'تقرير المبيعات والعمليات اليومي';
        v_start_date := date_trunc('day', v_now_cairo) AT TIME ZONE 'Africa/Cairo';
        v_end_date := (date_trunc('day', v_now_cairo) + interval '1 day' - interval '1 millisecond') AT TIME ZONE 'Africa/Cairo';
        v_period_desc := to_char(v_now_cairo, 'YYYY-MM-DD');
    ELSIF p_report_type = 'weekly' THEN
        v_report_title := 'التقرير التنفيذي الشامل للأسبوع';
        v_start_date := (date_trunc('day', v_now_cairo) - interval '6 days') AT TIME ZONE 'Africa/Cairo';
        v_end_date := (date_trunc('day', v_now_cairo) + interval '1 day' - interval '1 millisecond') AT TIME ZONE 'Africa/Cairo';
        v_period_desc := 'من ' || to_char(v_start_date, 'YYYY-MM-DD') || ' ⬅️ إلى ' || to_char(v_end_date, 'YYYY-MM-DD');
    ELSIF p_report_type = 'monthly' THEN
        v_report_title := 'التقرير المالي والإداري الشامل للشهر';
        v_start_date := date_trunc('month', v_now_cairo) AT TIME ZONE 'Africa/Cairo';
        v_end_date := (date_trunc('month', v_now_cairo) + interval '1 month' - interval '1 millisecond') AT TIME ZONE 'Africa/Cairo';
        v_period_desc := to_char(v_now_cairo, 'YYYY-MM');
    ELSE
        v_report_title := 'التقرير السنوي الشامل والختامي';
        v_start_date := date_trunc('year', v_now_cairo) AT TIME ZONE 'Africa/Cairo';
        v_end_date := (date_trunc('year', v_now_cairo) + interval '1 year' - interval '1 millisecond') AT TIME ZONE 'Africa/Cairo';
        v_period_desc := to_char(v_now_cairo, 'YYYY');
    END IF;

    -- د) حساب المؤشرات المالية للأوردرات
    SELECT 
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(total_price), 0),
        COALESCE(SUM(deposit), 0)
    INTO v_orders_count, v_total_sales, v_total_deposits
    FROM public.orders
    WHERE tenant_id = p_tenant_id
      AND status <> 'cancelled'
      AND created_at >= v_start_date
      AND created_at <= v_end_date;

    v_remaining := v_total_sales - v_total_deposits;
    IF v_orders_count > 0 THEN
        v_avg_order := round(v_total_sales / v_orders_count, 2);
    END IF;

    -- هـ) حساب السريات والقطع وأكثر الموديلات طلباً
    v_idx := 0;
    FOR v_rec IN 
        SELECT 
            COALESCE(m.name, 'موديل بدون اسم') AS model_name,
            COALESCE(m.factory_code, '') AS factory_code,
            COALESCE(SUM(oi.quantity), 0) AS series_count,
            COALESCE(SUM(oi.quantity * COALESCE(
                (SELECT count(*) FROM public.class_sizes cs WHERE cs.class_id = m.class_id),
                (SELECT count(*) FROM public.model_sizes ms WHERE ms.model_id = m.id),
                1
            )), 0) AS pieces_count,
            COALESCE(SUM(oi.total_price), 0) AS model_revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.models m ON m.id = oi.model_id
        WHERE o.tenant_id = p_tenant_id
          AND o.status <> 'cancelled'
          AND o.created_at >= v_start_date
          AND o.created_at <= v_end_date
        GROUP BY m.id, m.name, m.factory_code, m.class_id
        ORDER BY series_count DESC
        LIMIT 7
    LOOP
        v_idx := v_idx + 1;
        v_total_series := v_total_series + v_rec.series_count;
        v_total_pieces := v_total_pieces + v_rec.pieces_count;
        
        v_models_text := v_models_text || v_medals[v_idx] || ' <b>' || v_rec.model_name || '</b>' || E'\n' ||
                         CASE WHEN v_rec.factory_code <> '' THEN '   • كود: <code>' || v_rec.factory_code || '</code>' || E'\n' ELSE '' END ||
                         '   • الكمية: <b>' || v_rec.series_count || ' سيري</b> (' || v_rec.pieces_count || ' قطعة)' || E'\n' ||
                         '   • الإجمالي: <b>' || to_char(v_rec.model_revenue, 'FM999,999,999') || ' ج.م</b>' || E'\n\n';
    END LOOP;

    IF v_models_text = '' THEN
        v_models_text := 'لا توجد مبيعات موديلات مسجلة في هذه الفترة' || E'\n\n';
    END IF;

    -- و) أكثر الألوان طلباً
    FOR v_rec IN 
        SELECT 
            COALESCE(c.name, 'غير محدد') AS color_name,
            COALESCE(SUM(oi.quantity), 0) AS color_series,
            COALESCE(SUM(oi.quantity * COALESCE(
                (SELECT count(*) FROM public.class_sizes cs WHERE cs.class_id = m.class_id),
                (SELECT count(*) FROM public.model_sizes ms WHERE ms.model_id = m.id),
                1
            )), 0) AS color_pieces
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.colors c ON c.id = oi.color_id
        LEFT JOIN public.models m ON m.id = oi.model_id
        WHERE o.tenant_id = p_tenant_id
          AND o.status <> 'cancelled'
          AND o.created_at >= v_start_date
          AND o.created_at <= v_end_date
        GROUP BY c.name
        ORDER BY color_series DESC
        LIMIT 5
    LOOP
        v_colors_text := v_colors_text || '▫️ ' || v_rec.color_name || ': <b>' || v_rec.color_series || ' سيري</b> (' || v_rec.color_pieces || ' قطعة)' || E'\n';
    END LOOP;

    IF v_colors_text = '' THEN
        v_colors_text := 'لا توجد بيانات ألوان في هذه الفترة' || E'\n\n';
    ELSE
        v_colors_text := v_colors_text || E'\n';
    END IF;

    -- ز) أداء موظفي المبيعات
    FOR v_rec IN 
        SELECT 
            COALESCE(u.full_name, u.username, o.assigned_admin_name, 'مسؤول المبيعات') AS staff_name,
            COUNT(*) AS staff_orders,
            COALESCE(SUM(o.total_price), 0) AS staff_revenue
        FROM public.orders o
        LEFT JOIN public.system_users u ON u.id = o.worker_id
        WHERE o.tenant_id = p_tenant_id
          AND o.status <> 'cancelled'
          AND o.created_at >= v_start_date
          AND o.created_at <= v_end_date
        GROUP BY COALESCE(u.full_name, u.username, o.assigned_admin_name, 'مسؤول المبيعات')
        ORDER BY staff_revenue DESC
    LOOP
        v_staff_text := v_staff_text || '👤 <b>' || v_rec.staff_name || ':</b> ' || v_rec.staff_orders || ' فواتير • <b>' || to_char(v_rec.staff_revenue, 'FM999,999,999') || ' ج.م</b>' || E'\n';
    END LOOP;

    IF v_staff_text = '' THEN
        v_staff_text := 'لا توجد فواتير مسجلة للموظفين في هذه الفترة' || E'\n\n';
    ELSE
        v_staff_text := v_staff_text || E'\n';
    END IF;

    -- ح) تكوين نص الرسالة النهائي المطابق للنموذج التنفيذي
    v_message := 
        'Devo Bot:' || E'\n' ||
        '📅 <b>' || v_report_title || '</b>' || E'\n' ||
        '━━━━━━━━━━━━' || E'\n' ||
        '🗓️ <b>الفترة:</b> ' || v_period_desc || E'\n' ||
        '⏰ <b>وقت إصدار التقرير:</b> ' || v_time_str || E'\n' ||
        '🏭 <b>المصنع:</b> <b>' || v_factory_name || '</b>' || E'\n' ||
        '━━━━━━━━━━━━' || E'\n\n' ||
        '💰 <b><u>المؤشرات المالية والكميات:</u></b>' || E'\n' ||
        '🧾 <b>عدد الفواتير:</b> ' || v_orders_count || ' فاتورة' || E'\n' ||
        '💵 <b>إجمالي المبيعات:</b> <b>' || to_char(v_total_sales, 'FM999,999,999') || ' ج.م</b>' || E'\n' ||
        '📥 <b>العرابين المقبوضة:</b> <b>' || to_char(v_total_deposits, 'FM999,999,999') || ' ج.م</b>' || E'\n' ||
        '⏳ <b>المتبقي للتحصيل:</b> <b>' || to_char(v_remaining, 'FM999,999,999') || ' ج.م</b>' || E'\n' ||
        '🎯 <b>متوسط الفاتورة:</b> <b>' || to_char(v_avg_order, 'FM999,999,999.00') || ' ج.م</b>' || E'\n' ||
        '📦 <b>إجمالي السريات:</b> ' || v_total_series || ' سيري' || E'\n' ||
        '👕 <b>إجمالي القطع:</b> ' || v_total_pieces || ' قطعة' || E'\n\n' ||
        '🔥 <b><u>أكثر الموديلات طلباً وسحباً:</u></b>' || E'\n' ||
        v_models_text ||
        '🎨 <b><u>أكثر الألوان طلباً:</u></b>' || E'\n' ||
        v_colors_text ||
        '🏆 <b><u>أداء موظفي المبيعات:</u></b>' || E'\n' ||
        v_staff_text ||
        '━━━━━━━━━━━━' || E'\n' ||
        '🤖 <i>تم إرسال هذا التقرير آلياً بواسطة بوت تقارير UltraSoft</i>';

    -- ط) إرسال الرسالة إلى تليجرام باستخدام pg_net
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
            PERFORM net.http_post(
                url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
                body := jsonb_build_object(
                    'chat_id', v_reports_chat_id,
                    'text', v_message,
                    'parse_mode', 'HTML'
                ),
                headers := jsonb_build_object('Content-Type', 'application/json')
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم توليد وإرسال التقرير بنجاح عبر البوت 🚀',
        'orders_count', v_orders_count,
        'total_sales', v_total_sales
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_and_send_tenant_telegram_report(uuid, text) TO anon, authenticated, service_role;

-- 3. الدالة الدورية الرئيسية لفحص مواعيد كافة المصانع وإرسال التقارير التلقائية
CREATE OR REPLACE FUNCTION public.execute_tenant_scheduled_reports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now_cairo timestamp;
    v_cur_time text;
    v_cur_day text;
    v_cur_mday text;
    v_is_last_day boolean;
    v_cur_adate text;
    
    v_sched record;
    v_exec_key text;
    v_sent_count integer := 0;
BEGIN
    -- توقيت مصر/القاهرة المحلي الدقيق
    v_now_cairo := now() AT TIME ZONE 'Africa/Cairo';
    v_cur_time := to_char(v_now_cairo, 'HH24:MI');
    v_cur_day := lower(trim(to_char(v_now_cairo, 'Day')));
    v_cur_mday := to_char(v_now_cairo, 'FMDD');
    v_is_last_day := (v_now_cairo::date = (date_trunc('month', v_now_cairo) + interval '1 month' - interval '1 day')::date);
    v_cur_adate := to_char(v_now_cairo, 'MM-DD');

    -- المرور على جداول مواعيد كافة المصانع
    FOR v_sched IN 
        SELECT 
            tenant_id, 
            daily_enabled, daily_time,
            weekly_enabled, weekly_day, weekly_time,
            monthly_enabled, monthly_day, monthly_time,
            annual_enabled, annual_date, annual_time
        FROM public.tenant_report_schedules
    LOOP
        -- 1. فحص التقرير اليومي
        IF v_sched.daily_enabled = true AND v_sched.daily_time = v_cur_time THEN
            v_exec_key := v_sched.tenant_id::text || ':daily:' || to_char(v_now_cairo, 'YYYY-MM-DD');
            IF NOT EXISTS (SELECT 1 FROM public.tenant_scheduled_report_logs WHERE execution_key = v_exec_key) THEN
                INSERT INTO public.tenant_scheduled_report_logs (tenant_id, report_type, execution_key)
                VALUES (v_sched.tenant_id, 'daily', v_exec_key)
                ON CONFLICT (execution_key) DO NOTHING;
                
                PERFORM public.generate_and_send_tenant_telegram_report(v_sched.tenant_id, 'daily');
                v_sent_count := v_sent_count + 1;
            END IF;
        END IF;

        -- 2. فحص التقرير الأسبوعي
        IF v_sched.weekly_enabled = true AND lower(trim(v_sched.weekly_day)) = v_cur_day AND v_sched.weekly_time = v_cur_time THEN
            v_exec_key := v_sched.tenant_id::text || ':weekly:' || to_char(v_now_cairo, 'IYYY-IW');
            IF NOT EXISTS (SELECT 1 FROM public.tenant_scheduled_report_logs WHERE execution_key = v_exec_key) THEN
                INSERT INTO public.tenant_scheduled_report_logs (tenant_id, report_type, execution_key)
                VALUES (v_sched.tenant_id, 'weekly', v_exec_key)
                ON CONFLICT (execution_key) DO NOTHING;
                
                PERFORM public.generate_and_send_tenant_telegram_report(v_sched.tenant_id, 'weekly');
                v_sent_count := v_sent_count + 1;
            END IF;
        END IF;

        -- 3. فحص التقرير الشهري
        IF v_sched.monthly_enabled = true AND (v_sched.monthly_day = v_cur_mday OR (v_sched.monthly_day = 'last_day' AND v_is_last_day = true)) AND v_sched.monthly_time = v_cur_time THEN
            v_exec_key := v_sched.tenant_id::text || ':monthly:' || to_char(v_now_cairo, 'YYYY-MM');
            IF NOT EXISTS (SELECT 1 FROM public.tenant_scheduled_report_logs WHERE execution_key = v_exec_key) THEN
                INSERT INTO public.tenant_scheduled_report_logs (tenant_id, report_type, execution_key)
                VALUES (v_sched.tenant_id, 'monthly', v_exec_key)
                ON CONFLICT (execution_key) DO NOTHING;
                
                PERFORM public.generate_and_send_tenant_telegram_report(v_sched.tenant_id, 'monthly');
                v_sent_count := v_sent_count + 1;
            END IF;
        END IF;

        -- 4. فحص التقرير السنوي
        IF v_sched.annual_enabled = true AND v_sched.annual_date = v_cur_adate AND v_sched.annual_time = v_cur_time THEN
            v_exec_key := v_sched.tenant_id::text || ':annual:' || to_char(v_now_cairo, 'YYYY');
            IF NOT EXISTS (SELECT 1 FROM public.tenant_scheduled_report_logs WHERE execution_key = v_exec_key) THEN
                INSERT INTO public.tenant_scheduled_report_logs (tenant_id, report_type, execution_key)
                VALUES (v_sched.tenant_id, 'annual', v_exec_key)
                ON CONFLICT (execution_key) DO NOTHING;
                
                PERFORM public.generate_and_send_tenant_telegram_report(v_sched.tenant_id, 'annual');
                v_sent_count := v_sent_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'executed_at', v_now_cairo, 'reports_sent', v_sent_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_tenant_scheduled_reports() TO anon, authenticated, service_role;

-- 4. تسجيل الجدولة في pg_cron للعمل التلقائي كل دقيقة
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('ultrasoft_tenant_scheduled_reports');
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        
        BEGIN
            PERFORM cron.schedule(
                'ultrasoft_tenant_scheduled_reports',
                '* * * * *',
                'SELECT public.execute_tenant_scheduled_reports();'
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;
