// src/lib/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase";
import { formatPrice } from "./price-calculator";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface AgentInput {
  userMessage: string;
  instagramPostLink?: string; // the specific post/reel the customer is asking about
  senderName?: string;
  platform?: string;
}

export interface AgentOutput {
  reply: string;
  needsHuman: boolean;
  latencyMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Agent Function
// Called for every DM, WhatsApp message, and comment question.
// ─────────────────────────────────────────────────────────────────────────────
export async function runJewelleryAgent(
  input: AgentInput
): Promise<AgentOutput> {
  const startTime = Date.now();

  // ── 1. Fetch company context ──────────────────────────────────────────────
  const { data: companyRows } = await supabaseAdmin
    .from("company_info")
    .select("info_key, info_value");

  const companyContext = (companyRows ?? [])
    .map((row) => `${row.info_key}: ${row.info_value}`)
    .join("\n");

  // ── 2. Fetch current metal prices ─────────────────────────────────────────
  const { data: metalRows } = await supabaseAdmin
    .from("metal_prices")
    .select("karat_label, price_per_gram");

  const metalContext = (metalRows ?? [])
    .map((row) => `${row.karat_label}: ₹${row.price_per_gram}/gram`)
    .join("  |  ");

  // ── 3. Fetch product catalogue ────────────────────────────────────────────
  const { data: products } = await supabaseAdmin
    .from("products")
    .select(
      "product_id, name, purity, weight_grams, fixed_price, calculated_price, making_charges_percent, stone_value, diamond_value, polki_value, instagram_link, description, is_available"
    )
    .eq("is_available", true);

  // Sort: if the customer is asking about a specific post, put that product first
  let sortedProducts = [...(products ?? [])];
  if (input.instagramPostLink) {
    const matchIdx = sortedProducts.findIndex(
      (p) =>
        p.instagram_link &&
        p.instagram_link.trim() === input.instagramPostLink?.trim()
    );
    if (matchIdx > -1) {
      const [matched] = sortedProducts.splice(matchIdx, 1);
      sortedProducts = [matched, ...sortedProducts];
    }
  }

  const productContext = sortedProducts
    .map((p) => {
      const price = formatPrice(p);
      const parts = [
        `Name: ${p.name}`,
        `ID: ${p.product_id}`,
        `Purity: ${p.purity}`,
        `Weight: ${p.weight_grams}g`,
        `Price: ${price}`,
        p.instagram_link ? `Post: ${p.instagram_link}` : null,
        p.description ? `Desc: ${p.description}` : null,
      ].filter(Boolean);
      return `[ ${parts.join(" | ")} ]`;
    })
    .join("\n");

  // ── 4. Build system prompt ────────────────────────────────────────────────
  const systemPrompt = `You are the AI customer service representative for Dhera Singh Jewellers — a premium, trusted jewellery shop in Punjab, India. You are warm, respectful, culturally aware, and knowledgeable about jewellery. You speak in a natural Punjabi-English tone, using phrases like "Sat Shri Akal Ji", "Vadhayian", or "Ji zaroor" where appropriate. Your replies are always helpful, concise (under 130 words), and never robotic.

━━━ COMPANY INFORMATION ━━━
${companyContext}

━━━ CURRENT METAL RATES ━━━
${metalContext || "Rates are being updated — please ask for the latest price directly."}
Note: For products with a calculated price, the making charges and all stone/polki/diamond values are already included in the final price shown.

━━━ LIVE PRODUCT CATALOGUE ━━━
${productContext || "No products have been added yet."}

━━━ PLATFORM ━━━
${input.platform || "Not specified"} | Customer reference post: ${input.instagramPostLink || "None"}

━━━ YOUR RULES — FOLLOW STRICTLY ━━━
1. ONLY answer questions related to the jewellery shop: prices, weight, purity, availability, services, location, hours, bridal sets, custom orders, repair, and resizing.
2. If a customer asks about a specific Instagram post or reel, find the matching product by its "Post" URL in the catalogue and give them the price, weight, and purity from that entry. Never say "I don't know the price" if it is in the catalogue.
3. Always give actual ₹ prices. Never say "please call for price" unless the product genuinely has no price set (shows "Price on request").
4. If the question is about something you genuinely cannot answer from the data above (a very specific repair job, a custom design not in catalogue, etc.), respond warmly and include the phrase "connecting you with our team" so the system knows to escalate.
5. NEVER discuss competitors. NEVER make up prices. NEVER answer questions unrelated to jewellery or the shop. If a customer asks about something irrelevant (e.g. politics, recipes), politely redirect: "Ji, I can only help with jewellery-related questions for Dhera Singh Jewellers!"
6. Keep replies under 130 words. Use ₹ symbol for prices. Use Indian number formatting (₹1,20,000 not ₹120000).
7. If a message is just a greeting ("hello", "hi"), respond warmly and ask how you can help.

Customer name/ID: ${input.senderName || "valued customer"}`;

  // ── 5. Call Claude ────────────────────────────────────────────────────────
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: input.userMessage,
      },
    ],
  });

  const latencyMs = Date.now() - startTime;

  // Extract text from response
  const replyText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // ── 6. Detect if human is needed ─────────────────────────────────────────
  // The AI is instructed to include "connecting you with our team" when uncertain.
  const needsHuman =
    replyText.toLowerCase().includes("connecting you with our team") ||
    replyText.toLowerCase().includes("human intervention") ||
    replyText.length < 15; // suspiciously short = something went wrong

  return {
    reply: replyText,
    needsHuman,
    latencyMs,
  };
}