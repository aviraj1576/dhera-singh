// src/lib/webhook/conversation-history.ts
import { supabaseAdmin } from "@/lib/supabase";

export interface ConversationTurn {
  human_message: string;
  ai_response: string | null;
  platform: string;
  created_at: string;
}

/**
 * Get last N conversation turns for a sender
 */
export async function getConversationHistory(
  senderId: string,
  platform: string,
  limit = 6
): Promise<ConversationTurn[]> {
  try {
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("human_message, ai_response, platform, created_at")
      .eq("sender_id", senderId)
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []).reverse(); // chronological order
  } catch (e) {
    console.error("Conversation history error:", e);
    return [];
  }
}

/**
 * Format conversation history for Claude context
 */
export function formatHistoryForClaude(turns: ConversationTurn[]): string {
  if (!turns.length) return "";

  return turns
    .map((t) => {
      const parts = [`Customer: ${t.human_message}`];
      if (t.ai_response) parts.push(`Assistant: ${t.ai_response}`);
      return parts.join("\n");
    })
    .join("\n\n");
}