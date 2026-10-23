// src/lib/webhook/phase4-replies.ts
import { supabaseAdmin } from "@/lib/supabase";

const MAX_DM_BYTES = 900; // Instagram DM limit ~1000 bytes, leave margin

/**
 * Build the first DM for a comment — single message with all products
 */
export async function buildFirstCommentDM(
  products: any[],
  senderId: string,
  isFirstMessageToday: boolean
): Promise<string> {
  const showWeight = await getConfigBool("reply_show_weight", true);
  const showMaking = await getConfigBool("reply_show_making", true);
  
  const lines = products.map((p, i) => buildProductLine(p, i + 1, showWeight, showMaking));
  
  const footer = "\n\nReply a number for full details. May I know your name and mobile number so our team can call you? 🙏";
  
  let header = "Sat Shri Akal Ji 🙏 ";
  if (isFirstMessageToday) {
    header += "This is our automated assistant. ";
  }
  header += "Here are the designs on this reel:\n\n";

  const message = header + lines.join("\n") + footer;
  
  // Truncate if over byte limit
  return truncateToBytes(message, MAX_DM_BYTES, products.length);
}

/**
 * Build a single product line
 */
function buildProductLine(p: any, num: number, showWeight: boolean, showMaking: boolean): string {
  const parts = [];
  
  parts.push(`${num}) ${p.label ?? p.name}`);
  parts.push(`Purity: ${p.purity}`);
  
  if (showWeight && p.weight_grams) {
    parts.push(`Weight: ${p.weight_grams}g`);
  }
  
  const price = p.calculated_price ? `₹${Number(p.calculated_price).toLocaleString("en-IN")}` : "price on request";
  parts.push(`Price: ${price}`);
  
  if (showMaking && p.making_charges_percent) {
    parts.push(`Making: ${p.making_charges_percent}%`);
  }
  
  return parts.join(" | ");
}

/**
 * Build detailed product reply for DM follow-up
 */
export function buildProductDetailReply(p: any, showWeight: boolean, showMaking: boolean): string {
  const lines = [
    `📦 ${p.label ?? p.name}`,
    `✨ Purity: ${p.purity}`,
  ];
  
  if (showWeight) {
    lines.push(p.weight_grams ? `⚖️ Weight: ${p.weight_grams}g` : "⚖️ Weight: on request");
  }
  
  lines.push(
    p.calculated_price 
      ? `💰 Price: ₹${Number(p.calculated_price).toLocaleString("en-IN")}` 
      : "💰 Price: on request"
  );
  
  if (p.description) lines.push(`📝 ${p.description.slice(0, 200)}`);
  if (showMaking && p.making_charges_percent) lines.push(`🔨 Making: ${p.making_charges_percent}%`);
  if (p.stone_value) lines.push(`💎 Stone: ₹${Number(p.stone_value).toLocaleString("en-IN")}`);
  if (p.diamond_value) lines.push(`💍 Diamond: ₹${Number(p.diamond_value).toLocaleString("en-IN")}`);
  if (p.polki_value) lines.push(`✨ Polki: ₹${Number(p.polki_value).toLocaleString("en-IN")}`);
  
  if (p.is_combo) {
    lines.unshift("💎 COMBO SET PRICE");
  }
  
  return lines.join("\n");
}

/**
 * Build compact list for "all" or pagination
 */
export function buildCompactList(products: any[], startNum: number, showWeight: boolean, showMaking: boolean): string {
  return products
    .map((p, i) => buildProductLine(p, startNum + i, showWeight, showMaking))
    .join("\n");
}

/**
 * Truncate message to byte limit (UTF-8)
 */
function truncateToBytes(text: string, maxBytes: number, totalProducts: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  
  if (bytes.length <= maxBytes) return text;
  
  // Find last complete line that fits
  let truncated = "";
  for (const line of text.split("\n")) {
    const testBytes = encoder.encode(truncated + (truncated ? "\n" : "") + line);
    if (testBytes.length > maxBytes) break;
    truncated += (truncated ? "\n" : "") + line;
  }
  
  // Add truncation indicator
  const shownLines = truncated.split("\n").length;
  const remaining = totalProducts - shownLines;
  if (remaining > 0) {
    truncated += `\n+${remaining} more: reply MORE`;
  }
  
  return truncated;
}

async function getConfigBool(key: string, defaultVal: boolean): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("admin_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    
    if (!data?.value) return defaultVal;
    return JSON.parse(data.value);
  } catch {
    return defaultVal;
  }
}

/**
 * Check if comment should trigger a reply (intent-based gating)
 */
export function shouldReplyToComment(text: string, mode: "all" | "intent"): boolean {
  if (mode === "all") return true;
  
  // Question-like patterns
  const questionPatterns = [
    /\b(price|pp|kimat|rate|kitna|how much|bhaav|cost|daam|mull|bhav|dam|amount|paisa|rupee|₹)\b/,
    /\b(weight|wajan|vajan|gram|gm|kitna gram)\b/,
    /\b(purity|karat|carat|18k|22k|24k|14k|16k|kitna sona|hallmark)\b/,
    /\b(details|sab kuch|full details|poori|poora|sab batao|puri jankari)\b/,
    /\?$/,
    /^(what|how|why|when|where|who|which)\b/i,
  ];
  
  return questionPatterns.some(p => p.test(text));
}

/**
 * Check 24h cooldown for comment replies
 */
export async function checkCommentCooldown(senderId: string, reelCode: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("reel_context")
      .select("id")
      .eq("platform", "instagram")
      .eq("sender_id", senderId)
      .eq("reel_code", reelCode)
      .gte("shown_at", cutoff)
      .maybeSingle();
    
    return !!data; // true = already replied in last 24h
  } catch {
    return false;
  }
}

/**
 * Skip emoji-only or bot's own comments
 */
export function shouldSkipComment(text: string): boolean {
  const trimmed = text.trim();
  
  // Emoji only (no letters/digits)
  if (/^[\s\p{Emoji}\p{Extended_Pictographic}]+$/u.test(trimmed)) return true;
  
  // Very short non-question
  if (trimmed.length < 3 && !trimmed.includes("?")) return true;
  
  return false;
}

/**
 * Build gold rate reply from metal_prices
 */
export async function buildGoldRateReply(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("metal_prices")
    .select("karat_label, price_per_gram, updated_at")
    .in("karat_label", ["24K", "22K", "18K"])
    .order("karat_label", { ascending: false });

  if (!data?.length) return "Gold rates not available. Our team will confirm.";

  const lines = data.map((r) => `${r.karat_label}: ₹${r.price_per_gram.toLocaleString("en-IN")}/gm`);
  const updated = data[0]?.updated_at ? new Date(data[0].updated_at).toLocaleString("en-IN") : "recently";
  
  return [
    "Sat Shri Akal Ji 🙏 Today's gold rates (updated " + updated + "):",
    ...lines,
    "",
    "Send the reel link or comment under a reel for a design's price."
  ].join("\n");
}

/**
 * Build store info reply from company_info
 */
export async function buildStoreInfoReply(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("company_info")
    .select("info_key, info_value")
    .or("info_key.eq.address,info_key.eq.hours,info_key.eq.contact");

  const info: Record<string, string> = {};
  data?.forEach((r) => {
    const key = r.info_key.replace("context_", "");
    info[key] = r.info_value;
  });

  const address = info.address ?? "Adalat Bazaar, near AC Market, Patiala";
  const hours = info.hours ?? "10:00 AM to 9:00 PM";

  return `Sat Shri Akal Ji 🙏\n📍 ${address}\n🕐 ${hours}\n\nReply with any questions!`;
}