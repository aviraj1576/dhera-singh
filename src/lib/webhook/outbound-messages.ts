// src/lib/webhook/outbound-messages.ts
import { supabaseAdmin } from "@/lib/supabase";

export interface OutboundMessage {
  message_id: string;
  platform: string;
  recipient_id: string;
  kind: "bot" | "human" | "private_reply";
  created_at: string;
}

/**
 * Store outbound message ID for human reply detection
 */
export async function storeOutboundMessage(message: OutboundMessage): Promise<void> {
  try {
    await supabaseAdmin.from("outbound_messages").insert({
      message_id: message.message_id,
      platform: message.platform,
      recipient_id: message.recipient_id,
      kind: message.kind,
      created_at: message.created_at,
    });
  } catch (e) {
    console.error("Store outbound message error:", e);
  }
}

/**
 * Check if an echo message_id matches our outbound messages
 * Returns true if this echo is from a human (not our bot)
 */
export async function isHumanReply(
  platform: string,
  recipientId: string,
  echoMessageId: string
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("outbound_messages")
      .select("message_id")
      .eq("platform", platform)
      .eq("recipient_id", recipientId)
      .eq("message_id", echoMessageId)
      .maybeSingle();

    // If not found in our outbound messages, it was sent by a human
    return !data;
  } catch (e) {
    console.error("Human reply check error:", e);
    return false;
  }
}

/**
 * Pause bot for a sender (set bot_paused_until)
 */
export async function pauseBotForSender(
  senderId: string,
  platform: string,
  hours = 12
): Promise<void> {
  try {
    const pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    
    await supabaseAdmin.from("leads").upsert({
      platform,
      platform_user_id: senderId,
      bot_paused_until: pausedUntil,
      needs_human: true,
    }, { onConflict: "platform,platform_user_id" });

    await supabaseAdmin.from("conversations").insert({
      platform,
      sender_id: senderId,
      human_message: "[Bot paused — human took over conversation]",
      ai_response: null,
      status: "human_needed",
      response_latency_ms: 0,
      context: "human_takeover",
    });
  } catch (e) {
    console.error("Pause bot error:", e);
  }
}

/**
 * Check if bot is paused for a sender
 */
export async function isBotPaused(senderId: string, platform: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("bot_paused_until")
      .eq("platform", platform)
      .eq("platform_user_id", senderId)
      .maybeSingle();

    if (!data?.bot_paused_until) return false;
    return new Date(data.bot_paused_until) > new Date();
  } catch {
    return false;
  }
}

/**
 * Resume bot for a sender
 */
export async function resumeBotForSender(senderId: string, platform: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("leads")
      .update({ bot_paused_until: null, needs_human: false })
      .eq("platform", platform)
      .eq("platform_user_id", senderId);
  } catch (e) {
    console.error("Resume bot error:", e);
  }
}

/**
 * Check global kill switch
 */
export async function isBotEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("admin_config")
      .select("value")
      .eq("key", "bot_enabled")
      .maybeSingle();

    return data?.value !== "false";
  } catch {
    return true; // default enabled
  }
}