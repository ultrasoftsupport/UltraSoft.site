-- =========================================================================
-- 🌟 Migration v104: Comparison Features Icons & Ordering Engine
-- 💡 Description: Adds 'icon' column to subscription_comparison_features, 
--                 backfills modern Phosphor icons, and ensures sort_order index.
-- =========================================================================

-- 1. Add icon column if not exists
ALTER TABLE public.subscription_comparison_features 
ADD COLUMN IF NOT EXISTS icon text DEFAULT 'ph ph-check text-ultra-400';

-- 2. Backfill existing features with descriptive icons
UPDATE public.subscription_comparison_features
SET icon = 'ph ph-t-shirt text-ultra-400'
WHERE feature_name LIKE '%الموديلات النشطة%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-squares-four text-sky-400'
WHERE feature_name LIKE '%إجمالي الموديلات%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-receipt text-emerald-400'
WHERE feature_name LIKE '%حد الفواتير%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-file-arrow-up text-amber-400'
WHERE feature_name LIKE '%Excel%' OR feature_name LIKE '%الرفع والتعديل%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-users-three text-purple-400'
WHERE feature_name LIKE '%المستخدمين%' OR feature_name LIKE '%فريق العمل%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-telegram-logo text-sky-400'
WHERE feature_name LIKE '%إشعارات%' OR feature_name LIKE '%تليجرام%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-arrows-clockwise text-emerald-400'
WHERE feature_name LIKE '%المزامنة%' OR feature_name LIKE '%المشاركة%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-bell-ringing text-amber-400'
WHERE feature_name LIKE '%تنبيهات%' OR feature_name LIKE '%نواقص%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-pencil-line text-sky-400'
WHERE feature_name LIKE '%تعديل الفواتير%' OR feature_name LIKE '%الأوردرات%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-user-switch text-purple-400'
WHERE feature_name LIKE '%إسناد الطلبات%' OR feature_name LIKE '%العامل المسؤول%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-palette text-rose-400'
WHERE feature_name LIKE '%ألوان%' OR feature_name LIKE '%المظهر%' OR feature_name LIKE '%Themes%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-hand-coins text-blue-400'
WHERE feature_name LIKE '%العربون%' OR feature_name LIKE '%الإيداعات%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-qr-code text-sky-400'
WHERE feature_name LIKE '%معرض الموديلات%' OR feature_name LIKE '%الباركود%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-package text-emerald-400'
WHERE feature_name LIKE '%المخزن%' OR feature_name LIKE '%شحن%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-printer text-blue-400'
WHERE feature_name LIKE '%الطباعة%' OR feature_name LIKE '%حراري%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-headphones text-rose-400'
WHERE feature_name LIKE '%الدعم الفني%' OR feature_name LIKE '%التدريب%';

UPDATE public.subscription_comparison_features
SET icon = 'ph ph-database text-teal-400'
WHERE feature_name LIKE '%النسخ الاحتياطي%' OR feature_name LIKE '%استعادة%';

-- 3. Create index on sort_order for fast ordering queries
CREATE INDEX IF NOT EXISTS idx_subscription_comparison_features_sort_order 
ON public.subscription_comparison_features (sort_order ASC);
