// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// Check if we are in Next.js build phase
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || (isBuildPhase ? "https://placeholder-url.supabase.co" : "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (isBuildPhase ? "placeholder-key" : "");
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (isBuildPhase ? "placeholder-key" : "");

if (!isBuildPhase) {
    if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set or is still the placeholder value");
    }
    if (!supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set or is still the placeholder value");
    }
    if (!supabaseServiceKey || supabaseServiceKey.includes("placeholder")) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set or is still the placeholder value");
    }
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