// src/lib/webhook/burst-buffer.ts
import { supabaseAdmin } from "@/lib/supabase";

const BURST_WAIT_MS = 3000;
const BURST_WINDOW_MS = 10000;

export interface BufferedMessage {
  id: string;
  sender_id: string;
  platform: string;
  message: string;
  resolved_link: string | null;
  created_at: string;
}

/**
 * Insert message into burst buffer
 * Returns the inserted message ID
 */
export async function insertBurstMessage(
  senderId: string,
  platform: string,
  message: string,
  resolvedLink: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("message_buffer")
      .insert({
        sender_id: senderId,
        platform,
        message,
        resolved_link: resolvedLink,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Burst buffer insert error:", error?.message);
      return null;
    }
    return data.id;
  } catch (e) {
    console.error("Burst buffer insert exception:", e);
    return null;
  }
}

/**
 * Wait for burst window, then collect and merge messages
 * Only processes if this message is the first in the burst
 */
export async function processBurstMessages(
  senderId: string,
  platform: string,
  insertedId: string
): Promise<{ combinedText: string; combinedLink: string | null; buffered: BufferedMessage[] } | null> {
  // Wait for more messages to arrive
  await new Promise((resolve) => setTimeout(resolve, BURST_WAIT_MS));

  const windowStart = new Date(Date.now() - BURST_WINDOW_MS).toISOString();
  const { data: buffered } = await supabaseAdmin
    .from("message_buffer")
    .select("id, message, resolved_link, created_at")
    .eq("sender_id", senderId)
    .eq("platform", platform)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (!buffered?.length) {
    console.log("⏭️ Buffer empty — already processed by another handler");
    return null;
  }

  // Only the FIRST message in the burst should trigger processing
  if (buffered[0].id !== insertedId) {
    console.log("⏭️ Not first in burst — another handler will process");
    return null;
  }

  // Merge all burst messages
  const combinedText = buffered
    .map((b) => b.message)
    .filter((m) => m && !m.startsWith("[")) // skip [image], [reel] placeholders
    .join(" ")
    .trim();

  const combinedLink =
    buffered.find((b) => b.resolved_link)?.resolved_link ?? null;

  // Clear the buffer
  const bufferIds = buffered.map((b) => b.id);
  await supabaseAdmin.from("message_buffer").delete().in("id", bufferIds);

  console.log(
    `📦 Burst: ${buffered.length} msgs merged → "${combinedText.slice(0, 100)}" | link:${combinedLink ?? "none"}`
  );

  return { combinedText, combinedLink, buffered: buffered as BufferedMessage[] };
}