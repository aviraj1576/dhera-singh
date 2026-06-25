// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

// ── Public client ─────────────────────────────────────────────────────────────
// Uses the anon key. Safe to use in browser/client components.
// Row Level Security policies control what it can access.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Admin client ──────────────────────────────────────────────────────────────
// Uses the service_role key — bypasses RLS entirely.
// ONLY use inside API routes (server-side). Never import in client components.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);