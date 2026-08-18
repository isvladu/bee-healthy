import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cloud sync is optional. When the env vars are absent, the app runs fully
// local-only and every sync path becomes a no-op.
// Trim whitespace and any trailing slash — a trailing slash on the project URL
// makes the client build "…supabase.co//auth/v1/…" which the API gateway rejects
// with "Invalid path specified in request URL".
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const url = rawUrl?.trim().replace(/\/+$/, '');
const anonKey = rawKey?.trim();

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  cached = url && anonKey ? createClient(url, anonKey) : null;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
