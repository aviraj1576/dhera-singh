// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ── Validate env vars at module load time ──────────────────────────────────
// Fix #19: fail loudly if env not set instead of using placeholder URLs
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set or is still the placeholder value");
}
if (!supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set or is still the placeholder value");
}
if (!supabaseServiceKey || supabaseServiceKey.includes("placeholder")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set or is still the placeholder value");
}

// ── Public client (browser-safe, respects RLS) ─────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
});

// ── Admin client (server-only, bypasses RLS) ───────────────────────────────
// NEVER import this in any client component
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});