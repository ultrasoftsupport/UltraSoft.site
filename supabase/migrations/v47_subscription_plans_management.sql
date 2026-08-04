-- =========================================================================
-- 🚀 MIGRATION V47: SYSTEM SUBSCRIPTION PLANS & COMPARISON MATRIX MANAGEMENT
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Creates system_subscription_plans and subscription_comparison_features
--    tables to allow full dynamic management of plans, pricing, card features & comparison matrix.
-- =========================================================================

-- 1. Create system_subscription_plans Table
CREATE TABLE IF NOT EXISTS public.system_subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL, -- 'quarterly', 'semi_annual', 'annual'
    name text NOT NULL,
    badge_text text,
    discount_tag text,
    savings_tag text, 
    period_months integer NOT NULL DEFAULT 3,
    price numeric NOT NULL DEFAULT 0,
    currency text DEFAULT 'ج.م',
    subtitle text,
    max_products_label text,
    max_products_val integer DEFAULT 200,
    excel_credits_label text,
    excel_credits_val integer DEFAULT 200,
    max_users_label text,
    max_users_val integer DEFAULT 4,
    features_list jsonb DEFAULT '[]'::jsonb,
    color_scheme text DEFAULT 'emerald',
    is_featured boolean DEFAULT false,
    sort_order integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Create subscription_comparison_features Table
CREATE TABLE IF NOT EXISTS public.subscription_comparison_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name text NOT NULL,
    plan_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order integer DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.system_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_comparison_features ENABLE ROW LEVEL SECURITY;

-- Allow Public Read Access
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public read system_subscription_plans" ON public.system_subscription_plans;
    CREATE POLICY "Public read system_subscription_plans" ON public.system_subscription_plans FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Public read subscription_comparison_features" ON public.subscription_comparison_features;
    CREATE POLICY "Public read subscription_comparison_features" ON public.subscription_comparison_features FOR SELECT USING (true);

    DROP POLICY IF EXISTS "All access system_subscription_plans" ON public.system_subscription_plans;
    CREATE POLICY "All access system_subscription_plans" ON public.system_subscription_plans FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "All access subscription_comparison_features" ON public.subscription_comparison_features;
    CREATE POLICY "All access subscription_comparison_features" ON public.subscription_comparison_features FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 4. Seed Default Subscription Plans Data
INSERT INTO public.system_subscription_plans 
(key, name, badge_text, discount_tag, savings_tag, period_months, price, currency, subtitle, max_products_label, max_products_val, excel_credits_label, excel_credits_val, max_users_label, max_users_val, features_list, color_scheme, is_featured, sort_order)
VALUES 
(
    'quarterly',
    'باقة البداية الاقتصادية',
    'اشتراك 3 أشهر / ربع سنوي',
    '',
    '',
    3,
    7000,
    'ج.م',
    'الباقة الأساسية للمحلات والمتاجر الناشئة',
    'حتى 200 موديل',
    200,
    '200 كريديت / شهرياً',
    200,
    'حتى 4 مستخدمين',
    4,
    '["مناسبة للمتاجر والمحلات في بداية الانطلاق", "إعداد وتأمين قاعدة البيانات السحابية فورياً", "دعم فني وتدريب كامل 24/7 طوال الأسبوع", "نسخ احتياطي سحابي تلقائي لبيانات الحساب"]'::jsonb,
    'emerald',
    false,
    1
),
(
    'semi_annual',
    'الباقة الأكثر طلباً',
    'اشتراك 6 أشهر',
    'خصم 28%',
    'توفير 4,000 ج.م',
    6,
    10000,
    'ج.م',
    'الباقة المتكاملة لنشاط تجاري متوسط ومتوسع',
    'حتى 600 موديل (3 أضعاف)',
    600,
    '500 كريديت / شهرياً (2.5x)',
    500,
    'حتى 10 مستخدمين',
    10,
    '["جميع مميزات وتسهيلات باقة الـ 3 أشهر", "توفير اقتصادي ممتاز بنسبة 28%", "تخصيص الشعار والألوان والهوية على الفاتورة", "أولوية مرتفعة في الدعم الفني والتدريب"]'::jsonb,
    'sky',
    true,
    2
),
(
    'annual',
    'أفضل قيمة وتوفير',
    'اشتراك سنة كاملة',
    'خصم 46%',
    'توفير 13,000 ج.م',
    12,
    15000,
    'ج.م',
    'الباقة الملكية الشاملة لكافة الإمكانيات بلا حدود',
    'غير محدود ∞',
    -1,
    'غير محدود ∞',
    -1,
    'حتى 25 مستخدم',
    25,
    '["جميع المميزات والوظائف المتقدمة بلا حدود", "توفير ضخم يصل إلى 46% مقارنة بالاشتراك الربع سنوي", "دعم فني وتدريب VIP 24/7 (أولوية كبار العملاء)", "تصميم وتفصيل قوالب الفواتير والباركود مخصصاً"]'::jsonb,
    'amber',
    false,
    3
)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    badge_text = EXCLUDED.badge_text,
    discount_tag = EXCLUDED.discount_tag,
    savings_tag = EXCLUDED.savings_tag,
    price = EXCLUDED.price,
    subtitle = EXCLUDED.subtitle,
    max_products_label = EXCLUDED.max_products_label,
    excel_credits_label = EXCLUDED.excel_credits_label,
    max_users_label = EXCLUDED.max_users_label,
    features_list = EXCLUDED.features_list;

-- 5. Seed Comparison Matrix Default Items
INSERT INTO public.subscription_comparison_features (feature_name, plan_values, sort_order)
VALUES
('حدود الموديلات النشطة بالمعرض', '{"quarterly": "حتى 200 موديل", "semi_annual": "حتى 600 موديل (3x)", "annual": "غير محدود ∞"}'::jsonb, 1),
('رصيد الرفع والتعديل المجمع (Excel)', '{"quarterly": "200 كريديت / شهرياً", "semi_annual": "500 كريديت / شهرياً", "annual": "غير محدود ∞"}'::jsonb, 2),
('حسابات المستخدمين وفريق العمل', '{"quarterly": "حتى 4 مستخدمين", "semi_annual": "حتى 10 مستخدمين", "annual": "حتى 25 مستخدم"}'::jsonb, 3),
('إشعارات المتصفح الفورية والتليجرام', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 4),
('المزامنة والمشاركة اللحظية على الأجهزة', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 5),
('تنبيهات نواقص الأصناف والطلبات صوتياً', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 6),
('تعديل الفواتير والأوردرات وإعادة تحميلها', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 7),
('إسناد الطلبات وتغيير العامل المسؤول', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 8),
('تخصيص ألوان الواجهة والمظهر (Themes)', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 9),
('حساب العربون والمتبقي وتقارير الإيداعات', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 10),
('معرض الموديلات وقارئ الباركود الكاميرا', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 11),
('إدارة المخزن وشحن دفعات الرصيد', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 12),
('الفواتير والطباعة (حراري & A4)', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 13),
('الدعم الفني والتدريب', '{"quarterly": "24/7 طوال الأسبوع", "semi_annual": "24/7 طوال الأسبوع", "annual": "VIP 24/7 (أولوية كبار العملاء)"}'::jsonb, 14),
('النسخ الاحتياطي واستعادة البيانات', '{"quarterly": "تلقائي سحابي", "semi_annual": "تلقائي سحابي", "annual": "تلقائي سحابي"}'::jsonb, 15)
ON CONFLICT DO NOTHING;
