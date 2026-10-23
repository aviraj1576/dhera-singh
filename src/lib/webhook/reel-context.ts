// src/lib/webhook/reel-context.ts
import { supabaseAdmin } from "@/lib/supabase";

export interface ReelContext {
  platform: string;
  senderId: string;
  commentId?: string;
  reelCode: string;
  productIds: string[];
  page?: number;
  selectedProductId?: string;
}

const CONTEXT_TTL_HOURS = 168; // 7 days

/**
 * Store reel context for a sender
 */
export async function setReelContext(context: ReelContext): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + CONTEXT_TTL_HOURS * 60 * 60 * 1000).toISOString();
    
    await supabaseAdmin.from("reel_context").upsert({
      platform: context.platform,
      sender_id: context.senderId,
      comment_id: context.commentId ?? null,
      reel_code: context.reelCode,
      product_ids: context.productIds,
      page: context.page ?? 0,
      shown_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
  } catch (e) {
    console.error("❌ Set reel context error:", e);
  }
}

/**
 * Get reel context for a sender
 */
export async function getReelContext(senderId: string): Promise<ReelContext | null> {
  try {
    const { data } = await supabaseAdmin
      .from("reel_context")
      .select("*")
      .eq("platform", "instagram")
      .eq("sender_id", senderId)
      .gt("expires_at", new Date().toISOString())
      .order("shown_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    return {
      platform: data.platform,
      senderId: data.sender_id,
      commentId: data.comment_id,
      reelCode: data.reel_code,
      productIds: data.product_ids ?? [],
      page: data.page ?? 0,
      selectedProductId: data.selected_product_id,
    };
  } catch (e) {
    console.error("❌ Get reel context error:", e);
    return null;
  }
}

/**
 * Clear reel context for a sender
 */
export async function clearReelContext(senderId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("reel_context")
      .delete()
      .eq("platform", "instagram")
      .eq("sender_id", senderId);
  } catch (e) {
    console.error("❌ Clear reel context error:", e);
  }
}