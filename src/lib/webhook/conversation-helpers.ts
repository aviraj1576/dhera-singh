// src/lib/webhook/conversation-helpers.ts
import { supabaseAdmin } from "@/lib/supabase";

export interface ConversationData {
  platform: string;
  sender_id: string;
  post_link: string | null;
  human_message: string;
  ai_response: string | null;
  status: string;
  latency: number;
  message_id?: string;
  context?: string;
  error_info?: string;
  handled_by?: string;
}

/**
 * Save conversation to database
 */
export async function saveConversation(data: ConversationData): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("conversations").insert({
      platform: data.platform,
      sender_id: data.sender_id,
      instagram_post_link: data.post_link,
      human_message: data.human_message,
      ai_response: data.ai_response,
      status: data.status,
      response_latency_ms: data.latency,
      message_id: data.message_id ?? null,
      context: data.context ?? null,
      error_info: data.error_info ?? null,
      handled_by: data.handled_by ?? null,
    });
    if (error) console.error("❌ Conversation save:", error.message);
    else console.log("✅ Conversation saved");
  } catch (e) {
    console.error("❌ Conversation exception:", e);
  }
}