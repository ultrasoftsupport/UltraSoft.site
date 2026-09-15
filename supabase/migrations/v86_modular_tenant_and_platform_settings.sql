-- =========================================================================
-- v86: Modular Tenant and Platform Settings Architecture
-- تقسيم وهيكلة إعدادات المنظومة والمصانع إلى جداول تخصصية مهيكلة (Modular Architecture)
-- =========================================================================

-- =========================================================================
-- 1. جدول إعدادات الهوية والمظهر (tenant_branding_settings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_branding_settings (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    active_theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL,
    header_config jsonb DEFAULT jsonb_build_object(
        'layout', 'classic',
        'sticky', false,
        'transparent', true,
        'height', 80,
        'compact_on_scroll', false
    ),
    hero_config jsonb DEFAULT jsonb_build_object(
        'show', true,
        'badge', '',
        'title', '',
        'title_color', '#ffffff',
        'subtitle', '',
        'subtitle_color', '#ff8800',
        'desktop_url', '',
        'mobile_url', '',
        'opacity', 90,
        'overlay_opacity', 0,
        'blur', 1,
        'blend', 'normal',
        'edge_feather', 25,
        'glass_mode', 'soft',
        'glass_blur', 2,
        'glass_opacity', 25
    ),
    footer_config jsonb DEFAULT jsonb_build_object(
        'layout', 'brand-social',
        'bio_text', '',
        'copyright_text', '',
        'show_quick_links', false
    ),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 2. جدول روابط التواصل الاجتماعي (tenant_social_links)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_social_links (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    facebook_url text DEFAULT '',
    whatsapp_number text DEFAULT '',
    telegram_channel text DEFAULT '',
    google_maps_url text DEFAULT '',
    extra_links jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 3. جدول إعدادات الفواتير والطباعة (tenant_invoice_settings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_invoice_settings (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    factory_name text DEFAULT '',
    admin_title text DEFAULT 'فاتورة للإدارة',
    customer_title text DEFAULT 'فاتورة للعميل',
    subtitle text DEFAULT '',
    notes text DEFAULT 'البضاعة المباعة لا تُرد بعد 14 يوماً من تاريخ الفاتورة.',
    logo_url text DEFAULT '',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 4. جدول إعدادات الباركود ونقاط البيع والصفحات (tenant_pos_settings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_pos_settings (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    barcode_match_type text DEFAULT 'factory' CHECK (barcode_match_type IN ('factory', 'both', 'global')),
    barcode_scan_mode text DEFAULT 'both' CHECK (barcode_scan_mode IN ('camera', 'scanner', 'both')),
    enable_barcode boolean DEFAULT false,
    enable_cart boolean DEFAULT false,
    enable_gallery boolean DEFAULT false,
    enable_orders boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 5. جدول إعدادات تليجرام وإشعارات المصنع (tenant_telegram_settings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_telegram_settings (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    bot_token text DEFAULT '',
    general_chat_id text DEFAULT '',
    general_enabled boolean DEFAULT false,
    reports_chat_id text DEFAULT '',
    reports_enabled boolean DEFAULT false,
    reports_group_link text DEFAULT '',
    stock_chat_id text DEFAULT '',
    stock_enabled boolean DEFAULT false,
    web_notifications_enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 6. جدول إعدادات التقارير المجدولة التلقائية للمصنع (tenant_report_schedules)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_report_schedules (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    daily_enabled boolean DEFAULT false,
    daily_time text DEFAULT '23:00',
    weekly_enabled boolean DEFAULT true,
    weekly_day text DEFAULT 'thursday',
    weekly_time text DEFAULT '23:00',
    monthly_enabled boolean DEFAULT true,
    monthly_day text DEFAULT 'last_day',
    monthly_time text DEFAULT '23:00',
    annual_enabled boolean DEFAULT true,
    annual_date text DEFAULT '12-31',
    annual_time text DEFAULT '23:00',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 7. جدول إعدادات السوبر أدمن والمنظومة العامة (system_platform_settings)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.system_platform_settings (
    setting_key text PRIMARY KEY,
    setting_value jsonb NOT NULL,
    description text,
    updated_by uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
    updated_at timestamptz DEFAULT now()
);

-- =========================================================================
-- 8. تفعيل الأمان وسياسات RLS (Row Level Security)
-- =========================================================================
ALTER TABLE public.tenant_branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_telegram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_platform_settings ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة والكتابة
DROP POLICY IF EXISTS "tenant_branding_public_read" ON public.tenant_branding_settings;
CREATE POLICY "tenant_branding_public_read" ON public.tenant_branding_settings FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "tenant_branding_tenant_write" ON public.tenant_branding_settings;
CREATE POLICY "tenant_branding_tenant_write" ON public.tenant_branding_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_social_public_read" ON public.tenant_social_links;
CREATE POLICY "tenant_social_public_read" ON public.tenant_social_links FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "tenant_social_tenant_write" ON public.tenant_social_links;
CREATE POLICY "tenant_social_tenant_write" ON public.tenant_social_links FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_invoice_tenant_access" ON public.tenant_invoice_settings;
CREATE POLICY "tenant_invoice_tenant_access" ON public.tenant_invoice_settings FOR ALL TO public
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_pos_tenant_access" ON public.tenant_pos_settings;
CREATE POLICY "tenant_pos_tenant_access" ON public.tenant_pos_settings FOR ALL TO public
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_telegram_tenant_access" ON public.tenant_telegram_settings;
CREATE POLICY "tenant_telegram_tenant_access" ON public.tenant_telegram_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant_reports_tenant_access" ON public.tenant_report_schedules;
CREATE POLICY "tenant_reports_tenant_access" ON public.tenant_report_schedules FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "system_platform_settings_access" ON public.system_platform_settings;
CREATE POLICY "system_platform_settings_access" ON public.system_platform_settings FOR ALL TO public
USING (true) WITH CHECK (true);

-- =========================================================================
-- 9. سكريبت ترحيل البيانات الحالية من home_settings للجداول الجديدة
-- =========================================================================
DO $$
DECLARE
    r_tenant RECORD;
    v_t_id uuid;
    v_map jsonb;
BEGIN
    FOR r_tenant IN SELECT DISTINCT tenant_id FROM public.home_settings LOOP
        v_t_id := r_tenant.tenant_id;
        
        -- تجميع إعدادات هذا المصنع في JSONB Map
        SELECT jsonb_object_agg(setting_key, setting_value)
        INTO v_map
        FROM public.home_settings
        WHERE tenant_id = v_t_id;

        IF v_map IS NOT NULL THEN
            -- 1. ترحيل Branding & UI
            INSERT INTO public.tenant_branding_settings (
                tenant_id, active_theme_id, header_config, hero_config, footer_config, updated_at
            ) VALUES (
                v_t_id,
                CASE WHEN (v_map->>'active_theme_id') ~ '^[0-9a-fA-F-]{36}$' THEN (v_map->>'active_theme_id')::uuid ELSE NULL END,
                jsonb_build_object(
                    'layout', COALESCE(v_map->>'header_layout', 'classic'),
                    'sticky', (COALESCE(v_map->>'header_sticky', 'false') = 'true'),
                    'transparent', (COALESCE(v_map->>'header_transparent', 'true') = 'true'),
                    'height', COALESCE((v_map->>'header_height')::numeric, 80),
                    'compact_on_scroll', (COALESCE(v_map->>'header_compact_on_scroll', 'false') = 'true')
                ),
                jsonb_build_object(
                    'show', (COALESCE(v_map->>'hero_bg_show', 'true') = 'true'),
                    'badge', COALESCE(v_map->>'hero_badge', ''),
                    'title', COALESCE(v_map->>'hero_title', ''),
                    'title_color', COALESCE(v_map->>'hero_title_color', '#ffffff'),
                    'subtitle', COALESCE(v_map->>'hero_subtitle', ''),
                    'subtitle_color', COALESCE(v_map->>'hero_subtitle_color', '#ff8800'),
                    'desktop_url', COALESCE(v_map->>'hero_bg_desktop', ''),
                    'mobile_url', COALESCE(v_map->>'hero_bg_mobile', ''),
                    'opacity', COALESCE((v_map->>'hero_bg_opacity')::numeric, 90),
                    'overlay_opacity', COALESCE((v_map->>'hero_bg_overlay_opacity')::numeric, 0),
                    'blur', COALESCE((v_map->>'hero_bg_blur')::numeric, 1),
                    'blend', COALESCE(v_map->>'hero_bg_blend', 'normal'),
                    'edge_feather', COALESCE((v_map->>'hero_bg_edge_feather')::numeric, 25),
                    'glass_mode', COALESCE(v_map->>'hero_bg_glass', 'soft'),
                    'glass_blur', COALESCE((v_map->>'hero_glass_blur')::numeric, 2),
                    'glass_opacity', COALESCE((v_map->>'hero_glass_opacity')::numeric, 25)
                ),
                jsonb_build_object(
                    'layout', COALESCE(v_map->>'footer_layout', 'brand-social'),
                    'bio_text', COALESCE(v_map->>'footer_bio_text', ''),
                    'copyright_text', COALESCE(v_map->>'footer_copyright_text', ''),
                    'show_quick_links', (COALESCE(v_map->>'footer_show_quick_links', 'false') = 'true')
                ),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

            -- 2. ترحيل Social Links
            INSERT INTO public.tenant_social_links (
                tenant_id, facebook_url, whatsapp_number, telegram_channel, google_maps_url, updated_at
            ) VALUES (
                v_t_id,
                COALESCE(v_map->>'social_facebook', ''),
                COALESCE(v_map->>'social_whatsapp', ''),
                COALESCE(v_map->>'social_telegram', ''),
                COALESCE(v_map->>'social_maps', ''),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

            -- 3. ترحيل Invoice Settings
            INSERT INTO public.tenant_invoice_settings (
                tenant_id, factory_name, admin_title, customer_title, subtitle, notes, updated_at
            ) VALUES (
                v_t_id,
                COALESCE(v_map->>'invoice_factory_name', ''),
                COALESCE(v_map->>'invoice_admin_title', 'فاتورة للإدارة'),
                COALESCE(v_map->>'invoice_customer_title', 'فاتورة للعميل'),
                COALESCE(v_map->>'invoice_subtitle', ''),
                COALESCE(v_map->>'invoice_notes', 'البضاعة المباعة لا تُرد بعد 14 يوماً من تاريخ الفاتورة.'),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

            -- 4. ترحيل POS & Barcode Settings
            INSERT INTO public.tenant_pos_settings (
                tenant_id, barcode_match_type, barcode_scan_mode, enable_barcode, enable_cart, enable_gallery, enable_orders, updated_at
            ) VALUES (
                v_t_id,
                COALESCE(v_map->>'barcode_match_type', 'factory'),
                COALESCE(v_map->>'barcode_scan_mode', 'both'),
                (COALESCE(v_map->>'bg_enable_barcode', 'false') = 'true'),
                (COALESCE(v_map->>'bg_enable_cart', 'false') = 'true'),
                (COALESCE(v_map->>'bg_enable_gallery', 'false') = 'true'),
                (COALESCE(v_map->>'bg_enable_orders', 'false') = 'true'),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

            -- 5. ترحيل Telegram Settings
            INSERT INTO public.tenant_telegram_settings (
                tenant_id, bot_token, general_chat_id, general_enabled, reports_chat_id, reports_enabled, reports_group_link, stock_chat_id, stock_enabled, web_notifications_enabled, updated_at
            ) VALUES (
                v_t_id,
                COALESCE(v_map->>'telegram_bot_token', ''),
                COALESCE(v_map->>'telegram_chat_id', ''),
                (COALESCE(v_map->>'telegram_enabled', 'false') = 'true'),
                COALESCE(v_map->>'telegram_reports_chat_id', ''),
                (COALESCE(v_map->>'telegram_reports_enabled', 'false') = 'true'),
                COALESCE(v_map->>'telegram_reports_group_link', ''),
                COALESCE(v_map->>'telegram_stock_chat_id', ''),
                (COALESCE(v_map->>'telegram_stock_enabled', 'false') = 'true'),
                (COALESCE(v_map->>'web_notifications_enabled', 'true') = 'true'),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

            -- 6. ترحيل Report Schedules
            INSERT INTO public.tenant_report_schedules (
                tenant_id, daily_enabled, daily_time, weekly_enabled, weekly_day, weekly_time, monthly_enabled, monthly_day, monthly_time, annual_enabled, annual_date, annual_time, updated_at
            ) VALUES (
                v_t_id,
                (COALESCE(v_map->>'report_daily_enabled', 'false') = 'true'),
                COALESCE(v_map->>'report_daily_time', '23:00'),
                (COALESCE(v_map->>'report_weekly_enabled', 'true') = 'true'),
                COALESCE(v_map->>'report_weekly_day', 'thursday'),
                COALESCE(v_map->>'report_weekly_time', '23:00'),
                (COALESCE(v_map->>'report_monthly_enabled', 'true') = 'true'),
                COALESCE(v_map->>'report_monthly_day', 'last_day'),
                COALESCE(v_map->>'report_monthly_time', '23:00'),
                (COALESCE(v_map->>'report_annual_enabled', 'true') = 'true'),
                COALESCE(v_map->>'report_annual_date', '12-31'),
                COALESCE(v_map->>'report_annual_time', '23:00'),
                now()
            )
            ON CONFLICT (tenant_id) DO NOTHING;

        END IF;
    END LOOP;
END;
$$;

-- =========================================================================
-- 10. دوال الـ RPC الموحدة لقراءة وحفظ الإعدادات المنظمة بسهولة
-- =========================================================================

-- دالة جلب كافة إعدادات المصنع مجمعة بشكل مهيكل ونظيف بطلب واحد!
CREATE OR REPLACE FUNCTION public.get_tenant_modular_settings(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res jsonb;
BEGIN
    SELECT jsonb_build_object(
        'branding', (SELECT to_jsonb(b) FROM public.tenant_branding_settings b WHERE b.tenant_id = p_tenant_id),
        'social', (SELECT to_jsonb(s) FROM public.tenant_social_links s WHERE s.tenant_id = p_tenant_id),
        'invoice', (SELECT to_jsonb(i) FROM public.tenant_invoice_settings i WHERE i.tenant_id = p_tenant_id),
        'pos', (SELECT to_jsonb(p) FROM public.tenant_pos_settings p WHERE p.tenant_id = p_tenant_id),
        'telegram', (SELECT to_jsonb(t) FROM public.tenant_telegram_settings t WHERE t.tenant_id = p_tenant_id),
        'reports', (SELECT to_jsonb(r) FROM public.tenant_report_schedules r WHERE r.tenant_id = p_tenant_id)
    ) INTO v_res;

    RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_modular_settings(uuid) TO public, anon, authenticated, service_role;

-- دالة حفظ إعدادات نمطية مخصصة لمصنع
CREATE OR REPLACE FUNCTION public.save_tenant_modular_settings(
    p_tenant_id uuid,
    p_module text,
    p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_tenant_id IS NULL OR p_module IS NULL OR p_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'بيانات غير مكتملة.');
    END IF;

    IF p_module = 'branding' THEN
        INSERT INTO public.tenant_branding_settings (
            tenant_id, active_theme_id, header_config, hero_config, footer_config, updated_at
        ) VALUES (
            p_tenant_id,
            CASE WHEN (p_data->>'active_theme_id') ~ '^[0-9a-fA-F-]{36}$' THEN (p_data->>'active_theme_id')::uuid ELSE NULL END,
            COALESCE(p_data->'header_config', '{}'::jsonb),
            COALESCE(p_data->'hero_config', '{}'::jsonb),
            COALESCE(p_data->'footer_config', '{}'::jsonb),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            active_theme_id = COALESCE(EXCLUDED.active_theme_id, tenant_branding_settings.active_theme_id),
            header_config = COALESCE(EXCLUDED.header_config, tenant_branding_settings.header_config),
            hero_config = COALESCE(EXCLUDED.hero_config, tenant_branding_settings.hero_config),
            footer_config = COALESCE(EXCLUDED.footer_config, tenant_branding_settings.footer_config),
            updated_at = now();

    ELSIF p_module = 'social' THEN
        INSERT INTO public.tenant_social_links (
            tenant_id, facebook_url, whatsapp_number, telegram_channel, google_maps_url, updated_at
        ) VALUES (
            p_tenant_id,
            COALESCE(p_data->>'facebook_url', ''),
            COALESCE(p_data->>'whatsapp_number', ''),
            COALESCE(p_data->>'telegram_channel', ''),
            COALESCE(p_data->>'google_maps_url', ''),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            facebook_url = EXCLUDED.facebook_url,
            whatsapp_number = EXCLUDED.whatsapp_number,
            telegram_channel = EXCLUDED.telegram_channel,
            google_maps_url = EXCLUDED.google_maps_url,
            updated_at = now();

    ELSIF p_module = 'invoice' THEN
        INSERT INTO public.tenant_invoice_settings (
            tenant_id, factory_name, admin_title, customer_title, subtitle, notes, logo_url, updated_at
        ) VALUES (
            p_tenant_id,
            COALESCE(p_data->>'factory_name', ''),
            COALESCE(p_data->>'admin_title', 'فاتورة للإدارة'),
            COALESCE(p_data->>'customer_title', 'فاتورة للعميل'),
            COALESCE(p_data->>'subtitle', ''),
            COALESCE(p_data->>'notes', ''),
            COALESCE(p_data->>'logo_url', ''),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            factory_name = EXCLUDED.factory_name,
            admin_title = EXCLUDED.admin_title,
            customer_title = EXCLUDED.customer_title,
            subtitle = EXCLUDED.subtitle,
            notes = EXCLUDED.notes,
            logo_url = EXCLUDED.logo_url,
            updated_at = now();

    ELSIF p_module = 'pos' THEN
        INSERT INTO public.tenant_pos_settings (
            tenant_id, barcode_match_type, barcode_scan_mode, enable_barcode, enable_cart, enable_gallery, enable_orders, updated_at
        ) VALUES (
            p_tenant_id,
            COALESCE(p_data->>'barcode_match_type', 'factory'),
            COALESCE(p_data->>'barcode_scan_mode', 'both'),
            (COALESCE(p_data->>'enable_barcode', 'false') = 'true'),
            (COALESCE(p_data->>'enable_cart', 'false') = 'true'),
            (COALESCE(p_data->>'enable_gallery', 'false') = 'true'),
            (COALESCE(p_data->>'enable_orders', 'false') = 'true'),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            barcode_match_type = EXCLUDED.barcode_match_type,
            barcode_scan_mode = EXCLUDED.barcode_scan_mode,
            enable_barcode = EXCLUDED.enable_barcode,
            enable_cart = EXCLUDED.enable_cart,
            enable_gallery = EXCLUDED.enable_gallery,
            enable_orders = EXCLUDED.enable_orders,
            updated_at = now();

    ELSIF p_module = 'telegram' THEN
        INSERT INTO public.tenant_telegram_settings (
            tenant_id, bot_token, general_chat_id, general_enabled, reports_chat_id, reports_enabled, reports_group_link, stock_chat_id, stock_enabled, web_notifications_enabled, updated_at
        ) VALUES (
            p_tenant_id,
            COALESCE(p_data->>'bot_token', ''),
            COALESCE(p_data->>'general_chat_id', ''),
            (COALESCE(p_data->>'general_enabled', 'false') = 'true'),
            COALESCE(p_data->>'reports_chat_id', ''),
            (COALESCE(p_data->>'reports_enabled', 'false') = 'true'),
            COALESCE(p_data->>'reports_group_link', ''),
            COALESCE(p_data->>'stock_chat_id', ''),
            (COALESCE(p_data->>'stock_enabled', 'false') = 'true'),
            (COALESCE(p_data->>'web_notifications_enabled', 'true') = 'true'),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            bot_token = CASE WHEN EXCLUDED.bot_token <> '' THEN EXCLUDED.bot_token ELSE tenant_telegram_settings.bot_token END,
            general_chat_id = EXCLUDED.general_chat_id,
            general_enabled = EXCLUDED.general_enabled,
            reports_chat_id = EXCLUDED.reports_chat_id,
            reports_enabled = EXCLUDED.reports_enabled,
            reports_group_link = EXCLUDED.reports_group_link,
            stock_chat_id = EXCLUDED.stock_chat_id,
            stock_enabled = EXCLUDED.stock_enabled,
            web_notifications_enabled = EXCLUDED.web_notifications_enabled,
            updated_at = now();

    ELSIF p_module = 'reports' THEN
        INSERT INTO public.tenant_report_schedules (
            tenant_id, daily_enabled, daily_time, weekly_enabled, weekly_day, weekly_time, monthly_enabled, monthly_day, monthly_time, annual_enabled, annual_date, annual_time, updated_at
        ) VALUES (
            p_tenant_id,
            (COALESCE(p_data->>'daily_enabled', 'false') = 'true'),
            COALESCE(p_data->>'daily_time', '23:00'),
            (COALESCE(p_data->>'weekly_enabled', 'true') = 'true'),
            COALESCE(p_data->>'weekly_day', 'thursday'),
            COALESCE(p_data->>'weekly_time', '23:00'),
            (COALESCE(p_data->>'monthly_enabled', 'true') = 'true'),
            COALESCE(p_data->>'monthly_day', 'last_day'),
            COALESCE(p_data->>'monthly_time', '23:00'),
            (COALESCE(p_data->>'annual_enabled', 'true') = 'true'),
            COALESCE(p_data->>'annual_date', '12-31'),
            COALESCE(p_data->>'annual_time', '23:00'),
            now()
        )
        ON CONFLICT (tenant_id) DO UPDATE
        SET 
            daily_enabled = EXCLUDED.daily_enabled,
            daily_time = EXCLUDED.daily_time,
            weekly_enabled = EXCLUDED.weekly_enabled,
            weekly_day = EXCLUDED.weekly_day,
            weekly_time = EXCLUDED.weekly_time,
            monthly_enabled = EXCLUDED.monthly_enabled,
            monthly_day = EXCLUDED.monthly_day,
            monthly_time = EXCLUDED.monthly_time,
            annual_enabled = EXCLUDED.annual_enabled,
            annual_date = EXCLUDED.annual_date,
            annual_time = EXCLUDED.annual_time,
            updated_at = now();
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'وحدة الإعدادات غير معروفة: ' || p_module);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'تم حفظ إعدادات ' || p_module || ' بنجاح 💾');
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_tenant_modular_settings(uuid, text, jsonb) TO authenticated, service_role;
