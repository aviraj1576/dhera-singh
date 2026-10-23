// src/lib/webhook/human-reply.ts
import { supabaseAdmin } from "@/lib/supabase";
import { sendDM, checkTokenHealth } from "./graph-client";
import { saveConversation } from "./conversation-helpers";
import { storeOutboundMessage, pauseBotForSender } from "./outbound-messages";

/**
 * Send human reply via Graph API with correct messaging_type
 * Returns { success: boolean; error?: any; messageId?: string }
 */
export async function sendHumanReply(
  senderId: string,
  replyText: string,
  staffUserId: string,
  staffDisplayName: string
): Promise<{ success: boolean; error?: any; messageId?: string }> {
  // Check token health first
  const { valid, error: tokenError } = await checkTokenHealth();
  if (!valid) {
    return { success: false, error: tokenError };
  }

  // Determine messaging window
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("last_user_message_at, needs_human, bot_paused_until")
    .eq("platform", "instagram")
    .eq("platform_user_id", senderId)
    .maybeSingle();

  if (!lead) {
    return { success: false, error: { message: "Lead not found" } };
  }

  const lastUserMsg = lead.last_user_message_at ? new Date(lead.last_user_message_at) : null;
  const now = new Date();
  const hoursSinceLastMsg = lastUserMsg ? (now.getTime() - lastUserMsg.getTime()) / (1000 * 60 * 60) : 999;

  let messagingType = "RESPONSE";
  let tag: string | undefined;

  if (hoursSinceLastMsg <= 24) {
    messagingType = "RESPONSE";
  } else if (hoursSinceLastMsg <= 168) { // 7 days = 168 hours
    messagingType = "MESSAGE_TAG";
    tag = "HUMAN_AGENT";
  } else {
    return { success: false, error: { message: "Messaging window closed (>7 days). Cannot send." } };
  }

  // Send via Graph API
  const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
  const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const PAGE_ID = process.env.INSTAGRAM_PAGE_ID!;
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

  const body: any = {
    recipient: { id: senderId },
    message: { text: replyText },
    messaging_type: messagingType,
  };
  if (tag) body.tag = tag;

  try {
    const res = await fetch(`${GRAPH_BASE}/${PAGE_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Human reply send failed:", data);
      return { success: false, error: data.error };
    }

    const messageId = data.message_id;

    // Store outbound message
    await storeOutboundMessage({
      message_id: messageId,
      platform: "instagram",
      recipient_id: senderId,
      kind: "human",
      created_at: new Date().toISOString(),
    });

    // Update conversation with human reply
    await supabaseAdmin
      .from("conversations")
      .update({
        status: "human_replied",
        human_reply: replyText,
        handled_by: staffUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("sender_id", senderId)
      .eq("platform", "instagram_dm")
      .order("created_at", { ascending: false })
      .limit(1);

    // Pause bot for this lead
    await pauseBotForSender(senderId, "instagram", 12);

    // Save conversation record
    await saveConversation({
      platform: "instagram_dm",
      sender_id: senderId,
      post_link: null,
      human_message: `[Human reply from ${staffDisplayName}]`,
      ai_response: replyText,
      status: "human_replied",
      latency: 0,
      handled_by: staffUserId,
    });

    return { success: true, messageId };
  } catch (err) {
    console.error("Human reply exception:", err);
    return { success: false, error: { message: err instanceof Error ? err.message : "Unknown error" } };
  }
}

/**
 * Get messaging window state for a lead
 */
export async function getMessagingWindowState(senderId: string): Promise<{
  canSend: boolean;
  window: "open" | "human_agent" | "closed";
  hoursRemaining: number;
  lastUserMessageAt: string | null;
}> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("last_user_message_at, needs_human, bot_paused_until")
    .eq("platform", "instagram")
    .eq("platform_user_id", senderId)
    .maybeSingle();

  if (!lead?.last_user_message_at) {
    return { canSend: false, window: "closed", hoursRemaining: 0, lastUserMessageAt: null };
  }

  const lastMsg = new Date(lead.last_user_message_at);
  const now = new Date();
  const hoursSince = (now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60);

  if (hoursSince <= 24) {
    return {
      canSend: true,
      window: "open",
      hoursRemaining: 24 - hoursSince,
      lastUserMessageAt: lead.last_user_message_at,
    };
  } else if (hoursSince <= 168) {
    return {
      canSend: true,
      window: "human_agent",
      hoursRemaining: 168 - hoursSince,
      lastUserMessageAt: lead.last_user_message_at,
    };
  } else {
    return {
      canSend: false,
      window: "closed",
      hoursRemaining: 0,
      lastUserMessageAt: lead.last_user_message_at,
    };
  }
}