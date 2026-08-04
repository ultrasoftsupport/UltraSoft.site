-- =========================================================================
-- 🚀 MIGRATION V51: ADD CUSTOM LIMIT BADGES COLUMN TO SYSTEM SUBSCRIPTION PLANS
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-04
-- 💡 Description: Adds 'custom_limit_badges' jsonb column to public.system_subscription_plans.
-- =========================================================================

ALTER TABLE public.system_subscription_plans 
ADD COLUMN IF NOT EXISTS custom_limit_badges jsonb DEFAULT '[]'::jsonb;
