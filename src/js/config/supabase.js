import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// DEVO Factory Supabase Credentials
const SUPABASE_URL = 'https://huyzroaqvzbwhenilpjh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IBhIvEnrzgpY0iip4ek9ag_C5kWk2FV';
// Initialize and export the Supabase client for global use across services
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);