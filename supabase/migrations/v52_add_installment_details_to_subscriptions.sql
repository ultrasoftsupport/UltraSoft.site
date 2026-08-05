-- =========================================================================
-- 🚀 MIGRATION V52: ADD INSTALLMENT DETAILS & MONTHLY EXCEL CREDITS TO SUBSCRIPTIONS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-05
-- 💡 Description: Adds monthly_excel_credits & installment_details jsonb columns
--    to public.subscriptions to allow per-factory installment plans & credits tracking.
-- =========================================================================

ALTER TABLE public.subscriptions 
    ADD COLUMN IF NOT EXISTS monthly_excel_credits integer DEFAULT 200,
    ADD COLUMN IF NOT EXISTS installment_details jsonb DEFAULT '{"enabled": false, "count": 1, "amount": 0, "next_due_date": null, "notes": ""}'::jsonb;
