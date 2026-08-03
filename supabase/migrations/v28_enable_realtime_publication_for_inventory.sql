-- =========================================================================
-- 🚀 MIGRATION V28: ENABLE REALTIME PUBLICATION FOR MODELS AND INVENTORY
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-02
-- 💡 Description: Adds public.models and public.model_inventory to the
--    supabase_realtime publication to enable instant, real-time website updates.
-- =========================================================================

-- Enable Replica Identity for full Realtime update payloads
ALTER TABLE public.models REPLICA IDENTITY FULL;
ALTER TABLE public.model_inventory REPLICA IDENTITY FULL;

-- Add models and model_inventory to Supabase Realtime publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.models;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.model_inventory;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END $$;
