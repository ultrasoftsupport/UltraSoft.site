-- =========================================================================
-- 🌟 Migration v49: Deduplicate comparison features and add UNIQUE constraint
-- =========================================================================

-- 1. Remove duplicate rows keeping the earliest created row for each feature_name
DELETE FROM public.subscription_comparison_features
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY feature_name 
            ORDER BY created_at ASC, id ASC
        ) as rn
        FROM public.subscription_comparison_features
    ) t
    WHERE t.rn = 1
);

-- 2. Add UNIQUE constraint on feature_name to prevent future duplicates
ALTER TABLE public.subscription_comparison_features 
DROP CONSTRAINT IF EXISTS subscription_comparison_features_feature_name_key;

ALTER TABLE public.subscription_comparison_features 
ADD CONSTRAINT subscription_comparison_features_feature_name_key UNIQUE (feature_name);

-- 3. Re-seed clean features list with ON CONFLICT (feature_name) DO UPDATE
INSERT INTO public.subscription_comparison_features (feature_name, plan_values, sort_order)
VALUES
('حدود الموديلات النشطة بالمعرض', '{"quarterly": "حتى 200 موديل", "semi_annual": "حتى 600 موديل (3x)", "annual": "غير محدود ∞"}'::jsonb, 1),
('إجمالي الموديلات بالمعرض (نشطة + غير نشطة)', '{"quarterly": "حتى 500 موديل", "semi_annual": "حتى 1,500 موديل", "annual": "غير محدود ∞"}'::jsonb, 2),
('حد الفواتير المسموح إنشاؤها', '{"quarterly": "حتى 1,000 فاتورة", "semi_annual": "حتى 3,000 فاتورة", "annual": "غير محدود ∞"}'::jsonb, 3),
('رصيد الرفع والتعديل المجمع (Excel)', '{"quarterly": "200 كريديت / شهرياً", "semi_annual": "500 كريديت / شهرياً", "annual": "غير محدود ∞"}'::jsonb, 4),
('حسابات المستخدمين وفريق العمل', '{"quarterly": "حتى 4 مستخدمين", "semi_annual": "حتى 10 مستخدمين", "annual": "حتى 25 مستخدم"}'::jsonb, 5),
('إشعارات المتصفح الفورية والتليجرام', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 6),
('المزامنة والمشاركة اللحظية على الأجهزة', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 7),
('تنبيهات نواقص الأصناف والطلبات صوتياً', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 8),
('تعديل الفواتير والأوردرات وإعادة تحميلها', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 9),
('إسناد الطلبات وتغيير العامل المسؤول', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 10),
('تخصيص ألوان الواجهة والمظهر (Themes)', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 11),
('حساب العربون والمتبقي وتقارير الإيداعات', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 12),
('معرض الموديلات وقارئ الباركود الكاميرا', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 13),
('إدارة المخزن وشحن دفعات الرصيد', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 14),
('الفواتير والطباعة (حراري & A4)', '{"quarterly": "متاح", "semi_annual": "متاح", "annual": "متاح"}'::jsonb, 15),
('الدعم الفني والتدريب', '{"quarterly": "24/7 طوال الأسبوع", "semi_annual": "24/7 طوال الأسبوع", "annual": "VIP 24/7 (أولوية كبار العملاء)"}'::jsonb, 16),
('النسخ الاحتياطي واستعادة البيانات', '{"quarterly": "تلقائي سحابي", "semi_annual": "تلقائي سحابي", "annual": "تلقائي سحابي"}'::jsonb, 17)
ON CONFLICT (feature_name) DO UPDATE SET
    plan_values = EXCLUDED.plan_values,
    sort_order = EXCLUDED.sort_order;
