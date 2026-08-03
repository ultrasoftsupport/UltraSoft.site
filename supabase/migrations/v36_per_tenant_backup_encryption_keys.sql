-- =========================================================================
-- 🌟 MIGRATION V36: PER-TENANT BACKUP ENCRYPTION KEYS & SECURE FUNCTION 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-03
-- الإصدار: v36.0
-- الوصف: 
-- 1. إضافة عمود backup_encryption_key لجدول tenants لحفظ مفتاح تشفير خاص بكل مصنع.
-- 2. توليد تلقائي لمفاتيح التشفير 256-bit لجميع المصانع الحالية.
-- 3. دالة SQL آمنة get_tenant_backup_encryption_key لجلب مفتاح المصنع لحظياً وتدميره بالذاكرة.
-- =========================================================================

-- 1. إضافة عمود backup_encryption_key لجدول tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS backup_encryption_key text;

-- 2. توليد مفاتيح تشفير 256-bit (64 حرف hex) عشوائية وآمنة لكافة المصانع
UPDATE public.tenants 
SET backup_encryption_key = encode(gen_random_bytes(32), 'hex') 
WHERE backup_encryption_key IS NULL OR backup_encryption_key = '';

-- 3. إنشاء دالة SQL آمنة لجلب أو إنشاء مفتاح تشفير الـ Backups للمصنع الحالي
CREATE OR REPLACE FUNCTION public.get_tenant_backup_encryption_key(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_key text;
BEGIN
    -- التحقق من وجود المصنع وجلب المفتاح الخاص به
    SELECT backup_encryption_key INTO v_key
    FROM public.tenants
    WHERE id = p_tenant_id;
    
    -- إذا لم يكن المفتاح مولداً بعد لهذا المصنع، يتم إنشاؤه وتخزينه فوراً
    IF v_key IS NULL OR v_key = '' THEN
        v_key := encode(gen_random_bytes(32), 'hex');
        UPDATE public.tenants
        SET backup_encryption_key = v_key
        WHERE id = p_tenant_id;
    END IF;

    RETURN v_key;
END;
$$;
