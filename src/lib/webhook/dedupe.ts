// src/lib/webhook/dedupe.ts
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Check and mark event as processed using processed_events table.
 * Returns true if already processed (duplicate), false if new.
 */
export async function checkAndMarkProcessed(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("processed_events")
      .insert({ event_id: eventId });

    if (error?.code === "23505") return true; // unique violation = duplicate
    if (error) console.error("Dedup error:", error.message);
    return false;
  } catch {
    return false;
  }
}

/**
 * Clean up old processed_events (older than 48 hours)
 */
export async function cleanupOldProcessedEvents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("processed_events")
      .delete()
      .lt("created_at", cutoff);
  } catch (e) {
    console.error("Cleanup old events error:", e);
  }
}

/**
 * Rate limiting per sender per kind
 */
export async function checkRateLimit(
  senderId: string,
  kind: "comment" | "dm",
  max: number,
  windowMs: number
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const key = `${kind}_${senderId}`;

    const { data } = await supabaseAdmin
      .from("sender_rate_limits")
      .select("message_count, window_start")
      .eq("sender_id", key)
      .maybeSingle();

    if (!data) {
      await supabaseAdmin.from("sender_rate_limits").insert({
        sender_id: key,
        window_start: new Date().toISOString(),
        message_count: 1,
        updated_at: new Date().toISOString(),
      });
      return false;
    }

    if (new Date(data.window_start) < new Date(windowStart)) {
      await supabaseAdmin
        .from("sender_rate_limits")
        .update({
          window_start: new Date().toISOString(),
          message_count: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("sender_id", key);
      return false;
    }

    if (data.message_count >= max) {
      console.warn(`⚠️ Rate limit hit: ${kind} for ${senderId}`);
      return true;
    }

    await supabaseAdmin
      .from("sender_rate_limits")
      .update({
        message_count: data.message_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("sender_id", key);

    return false;
  } catch (e) {
    console.error("Rate limit error:", e);
    return false;
  }
}