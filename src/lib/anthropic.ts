// src/lib/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface AgentInput {
  userMessage: string;
  instagramPostLink?: string;
  senderName?: string;
  platform?: string;
  messageType?: "text" | "image" | "reel" | "story_reply";
  attachedLink?: string; // any link extracted from the message itself
}

export interface AgentOutput {
  reply: string;
  followUp?: string; // second message asking for phone number
  needsHuman: boolean;
  latencyMs: number;
}

// ─── Detect intent from message ───────────────────────────────────────────────
function detectIntent(message: string): "price" | "purity" | "weight" | "image" | "greeting" | "other" {
  const msg = message.toLowerCase().trim();

  // Screenshot / image signals
  if (msg.includes("screenshot") || msg.includes("ss") || msg.includes("screen shot")) return "image";

  // Price signals
  if (
    msg === "pp" || msg === "price" || msg === "p" ||
    msg.includes("price") || msg.includes("pp") ||
    msg.includes("kimat") || msg.includes("rate") ||
    msg.includes("kitna") || msg.includes("how much") ||
    msg.includes("bhaav") || msg.includes("cost") ||
    msg.includes("daam")
  ) return "price";

  // Purity signals
  if (
    msg === "stuff" || msg.includes("stuff") ||
    msg.includes("purity") || msg.includes("karat") ||
    msg.includes("gold") || msg.includes("silver") ||
    msg.includes("18k") || msg.includes("22k") || msg.includes("24k")
  ) return "purity";

  // Weight signals
  if (
    msg.includes("weight") || msg.includes("wajan") ||
    msg.includes("gram") || msg.includes("gm")
  ) return "weight";

  // Greeting
  if (
    msg === "hi" || msg === "hello" || msg === "hey" ||
    msg.includes("sat sri akal") || msg.includes("ssa") ||
    msg.includes("namaste")
  ) return "greeting";

  return "other";
}

// ─── Extract any Instagram link from a message ────────────────────────────────
export function extractLinkFromMessage(message: string): string | undefined {
  const urlRegex = /(https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/[^\s]+)/i;
  const match = message.match(urlRegex);
  return match?.[0];
}

// ─── Fetch product by instagram link ─────────────────────────────────────────
async function getProductByLink(link: string) {
  if (!link) return null;

  // Normalise the link — remove query params and trailing slashes
  const cleanLink = link.split("?")[0].replace(/\/$/, "");

  const { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .or(
      `instagram_link.eq.${link},instagram_link.eq.${cleanLink}`
    )
    .limit(1)
    .single();

  return data ?? null;
}

// ─── Format price display ─────────────────────────────────────────────────────
function formatPrice(product: {
  fixed_price: number | null;
  calculated_price: number | null;
}): string {
  const price = product.fixed_price ?? product.calculated_price;
  if (!price || price === 0) return "price on request";
  return `₹${Number(price).toLocaleString("en-IN")}`;
}

// ─── Build product detail line ────────────────────────────────────────────────
function buildProductLine(
  product: Record<string, unknown>,
  intent: "price" | "purity" | "weight"
): string {
  if (intent === "price") {
    return `${product.name} — ${formatPrice(product as { fixed_price: number | null; calculated_price: number | null })}`;
  }
  if (intent === "purity") {
    return `${product.name} — ${product.purity ?? "not specified"}`;
  }
  if (intent === "weight") {
    return `${product.name} — ${product.weight_grams}g`;
  }
  return String(product.name);
}

// ─── Main agent ───────────────────────────────────────────────────────────────
export async function runJewelleryAgent(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();

  const intent = detectIntent(input.userMessage);

  // Resolve the product link — from input or extracted from message text
  const resolvedLink =
    input.instagramPostLink ||
    input.attachedLink ||
    extractLinkFromMessage(input.userMessage);

  // ── CASE 1: User sent a screenshot ───────────────────────────────────────
  if (intent === "image" || input.messageType === "image") {
    return {
      reply: "Sat Shri Akal Ji 🙏 Please send us the actual reel or post link — we'll get you all the details right away!",
      followUp: "Ji, kindly share your phone number too so our team can assist you personally 🙏",
      needsHuman: false,
      latencyMs: Date.now() - startTime,
    };
  }

  // ── CASE 2: Greeting ─────────────────────────────────────────────────────
  if (intent === "greeting") {
    return {
      reply: "Sat Shri Akal Ji 🙏 Welcome to Dhera Singh Jewellers! Please share the reel or post you're interested in and I'll get you the details.",
      followUp: "Ji, kindly also share your phone number so our team can assist you personally 🙏",
      needsHuman: false,
      latencyMs: Date.now() - startTime,
    };
  }

  // ── CASE 3: Price/purity/weight asked WITHOUT any product link ────────────
  if ((intent === "price" || intent === "purity" || intent === "weight") && !resolvedLink) {
    return {
      reply: "Sat Shri Akal Ji 🙏 Please send us the reel or post you're referring to and I'll get you the details right away!",
      followUp: "Ji, kindly share your phone number too so our team can personally assist you 🙏",
      needsHuman: false,
      latencyMs: Date.now() - startTime,
    };
  }

  // ── CASE 4: Price/purity/weight WITH a product link ──────────────────────
  if ((intent === "price" || intent === "purity" || intent === "weight") && resolvedLink) {
    const product = await getProductByLink(resolvedLink);

    if (!product) {
      // Link found but no matching product in DB
      return {
        reply: "Sat Shri Akal Ji 🙏 We're adding this piece to our system — our team will DM you the details shortly!",
        followUp: "Ji, kindly share your phone number so we can reach you personally 🙏",
        needsHuman: true,
        latencyMs: Date.now() - startTime,
      };
    }

    const detail = buildProductLine(product, intent);

    return {
      reply: `Sat Shri Akal Ji 🙏\n${detail}\nFor more details, our team is here to help!`,
      followUp: "Ji, could you share your phone number? Our team will reach out personally 🙏",
      needsHuman: false,
      latencyMs: Date.now() - startTime,
    };
  }

  // ── CASE 5: General question — use Claude for anything else ──────────────
  const { data: companyRows } = await supabaseAdmin
    .from("company_info")
    .select("info_key, info_value");

  const companyContext = (companyRows ?? [])
    .map((r) => `${r.info_key}: ${r.info_value}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    system: `You are the customer service AI for Dhera Singh Jewellers, a premium jewellery shop in Punjab.
Reply in warm Punjabi-English. MAX 2 lines. Never give long replies.
Only answer about: prices, jewellery, shop info, services.
If asked anything unrelated, say you can only help with jewellery queries.

COMPANY INFO:
${companyContext}`,
    messages: [{ role: "user", content: input.userMessage }],
  });

  const replyText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const needsHuman = replyText.toLowerCase().includes("connecting you with our team");

  return {
    reply: replyText,
    followUp: "Ji, could you share your phone number? Our team will reach out personally 🙏",
    needsHuman,
    latencyMs: Date.now() - startTime,
  };
}