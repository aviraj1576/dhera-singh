// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ── Public client ─────────────────────────────────────────────────────────────
// Uses the anon key. Safe to use in browser/client components.
// Row Level Security policies control what it can access.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Admin client ──────────────────────────────────────────────────────────────
// Uses the service_role key — bypasses RLS entirely.
// ONLY use inside API routes (server-side). Never import in client components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);