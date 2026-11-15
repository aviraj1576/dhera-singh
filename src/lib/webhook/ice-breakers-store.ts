// src/lib/webhook/ice-breakers-store.ts
// Saved ice-breaker wording (what the dashboard edits and "Sync" publishes). Server-only.
import { supabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_ICE_BREAKER_QUESTIONS,
  parseIceBreakerQuestions,
  type IceBreakerQuestion,
} from "./ice-breakers";

export const ICE_BREAKERS_CONFIG_KEY = "ice_breakers_questions";
export const ICE_BREAKERS_HASH_KEY = "ice_breakers_hash";

/**
 * Load the saved questions, or the defaults if none were saved (or the saved value is unusable).
 * Throws on a database error so a sync never silently publishes the defaults over custom wording.
 */
export async function loadIceBreakerQuestions(): Promise<{ questions: IceBreakerQuestion[]; customised: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("admin_config")
    .select("value")
    .eq("key", ICE_BREAKERS_CONFIG_KEY)
    .maybeSingle();

  if (error) throw new Error(`Could not load ice breakers: ${error.message}`);
  if (!data?.value) return { questions: DEFAULT_ICE_BREAKER_QUESTIONS, customised: false };

  try {
    const parsed = parseIceBreakerQuestions(JSON.parse(data.value));
    if (parsed.ok) return { questions: parsed.questions, customised: true };
    console.warn("Saved ice breakers are invalid, using defaults:", parsed.error);
  } catch {
    console.warn("Saved ice breakers are not valid JSON, using defaults");
  }
  return { questions: DEFAULT_ICE_BREAKER_QUESTIONS, customised: false };
}

export async function saveIceBreakerQuestions(questions: IceBreakerQuestion[]): Promise<void> {
  const { error } = await supabaseAdmin
    .from("admin_config")
    // admin_config has only key / value / created_at (no updated_at column).
    .upsert({ key: ICE_BREAKERS_CONFIG_KEY, value: JSON.stringify(questions) });
  if (error) throw new Error(`Could not save ice breakers: ${error.message}`);
}
