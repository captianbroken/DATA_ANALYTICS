import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

const hasValidSupabaseUrl = /^https?:\/\//.test(supabaseUrl);
const hasValidSupabaseAnonKey = /^(eyJ|sb_publishable_)/.test(supabaseAnonKey);

export const isSupabaseConfigured = Boolean(hasValidSupabaseUrl && hasValidSupabaseAnonKey);
export const supabaseConfigError = isSupabaseConfigured
  ? null
  : 'The root .env file must contain a valid VITE_SUPABASE_URL and browser-safe VITE_SUPABASE_ANON_KEY';

// Keep a syntactically valid fallback so the app can render config warnings instead of crashing on boot.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
);
