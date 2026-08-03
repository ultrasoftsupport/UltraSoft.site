-- =========================================================================
-- 🌟 MIGRATION V35: SETUP SYSTEM BACKUPS STORAGE BUCKET AND POLICIES 🌟
-- =========================================================================
-- تاريخ الإنشاء: 2026-08-03
-- الإصدار: v35.0
-- الوصف: 
-- 1. إنشاء حاوية التخزين السحابي (system_backups) في Supabase Storage بحد أقصى 50 ميجابايت.
-- 2. إعطاء سياسات الوصول الشاملة للرفع والقراءة والتنزيل بملفات JSON والنسخ الاحتياطية.
-- =========================================================================

-- 1. إنشاء Supabase Storage Bucket لحفظ النسخ السحابية بأمان وبطريقة عامة للوصول المباشر
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'system_backups',
    'system_backups',
    true,
    52428800, -- 50 MB
    ARRAY['application/json', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE 
SET public = true,
    file_size_limit = 52428800;

-- 2. سياسات الوصول الشاملة المباشرة لـ Storage Bucket system_backups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Access for system_backups bucket'
    ) THEN
        CREATE POLICY "Public Access for system_backups bucket"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'system_backups');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Upload for system_backups bucket'
    ) THEN
        CREATE POLICY "Public Upload for system_backups bucket"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'system_backups');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Delete for system_backups bucket'
    ) THEN
        CREATE POLICY "Public Delete for system_backups bucket"
            ON storage.objects FOR DELETE
            USING (bucket_id = 'system_backups');
    END IF;
END $$;
