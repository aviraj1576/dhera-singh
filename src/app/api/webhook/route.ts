// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  runJewelleryAgent,
  extractLinkFromMessage,
  normaliseLink,
  detectIntent,
} from "@/lib/anthropic";
import { createHmac } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const OUR_PAGE_ID = process.env.INSTAGRAM_PAGE_ID ?? "";
const FUNCTION_TIMEOUT = 8500;
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;

// List of exact strings the bot itself sends as public comment replies
// Used to detect and ignore our own comments coming back as webhook events
const BOT_COMMENT_SIGNATURES = [
  "sat shri akal ji ?? please check your dm",
  "sat shri akal ji 🙏 please check your dm",
  "please check your dm for the details",
];

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────────────────────────
function verifyMetaSignature(signature: string | null, rawBody: string): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    console.warn("⚠️ INSTAGRAM_APP_SECRET not set — skipping verification");
    return true;
  }
  if (!signature) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return signature === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION — DB-based
// ─────────────────────────────────────────────────────────────────────────────
async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("processed_events")
      .insert({ event_id: eventId });
    if (error?.code === "23505") return true;
    if (error) console.error("Dedup error:", error.message);
    return false;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BURST DEDUPLICATION
// Prevents replying twice to the same sender within 5 seconds
// This replaces the broken sleep-based buffer
// ─────────────────────────────────────────────────────────────────────────────
async function recentlyRepliedTo(
  senderId: string,
  platform: string,
  windowMs = 5000
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const { data } = await supabaseAdmin
      .from("recent_replies")
      .select("replied_at")
      .eq("sender_id", senderId)
      .eq("platform", platform)
      .gte("replied_at", cutoff)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function markReplied(senderId: string, platform: string) {
  try {
    await supabaseAdmin
      .from("recent_replies")
      .upsert(
        { sender_id: senderId, platform, replied_at: new Date().toISOString() },
        { onConflict: "sender_id,platform" }
      );
  } catch (e) {
    console.error("markReplied error:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────
async function isRateLimited(senderId: string): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
    const { data } = await supabaseAdmin
      .from("sender_rate_limits")
      .select("message_count, window_start")
      .eq("sender_id", senderId)
      .maybeSingle();

    if (!data) {
      await supabaseAdmin.from("sender_rate_limits").insert({
        sender_id: senderId,
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
        .eq("sender_id", senderId);
      return false;
    }

    if (data.message_count >= RATE_LIMIT_MAX) {
      console.warn(`⚠️ Rate limit hit: ${senderId}`);
      return true;
    }

    await supabaseAdmin
      .from("sender_rate_limits")
      .update({
        message_count: data.message_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("sender_id", senderId);

    return false;
  } catch (e) {
    console.error("Rate limit error:", e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: Verification
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    (token === process.env.INSTAGRAM_VERIFY_TOKEN ||
      token === process.env.WHATSAPP_VERIFY_TOKEN)
  ) {
    console.log("✅ Webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Events
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(signature, rawBody)) {
    console.error("❌ Invalid signature");
    return NextResponse.json({ status: "ok" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  // Opportunistic cleanup
  if (Math.random() < 0.02) cleanupOldEvents().catch(() => null);

  try {
    await Promise.race([
      processEvent(body),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), FUNCTION_TIMEOUT)
      ),
    ]);
  } catch (err: unknown) {
    console.error("Webhook error:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ status: "ok" });
}

async function cleanupOldEvents() {
  await supabaseAdmin
    .from("processed_events")
    .delete()
    .lt("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
  await supabaseAdmin
    .from("recent_replies")
    .delete()
    .lt("replied_at", new Date(Date.now() - 60 * 1000).toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
async function processEvent(body: Record<string, unknown>) {
  if (!body || typeof body !== "object") return;
  if (body.object === "instagram") await handleInstagram(body);
  else if (body.object === "whatsapp_business_account") await handleWhatsApp(body);
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM
// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagram(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];
  if (!entries.length) return;

  for (const entry of entries) {
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];
    for (const event of messaging) {
      await handleInstagramDM(event).catch((e) =>
        console.error("DM handler crashed:", e)
      );
    }

    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) === "comments") {
        await handleInstagramComment(
          change.value as Record<string, unknown>
        ).catch((e) => console.error("Comment handler crashed:", e));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagramDM(event: Record<string, unknown>) {
  const msg = event.message as Record<string, unknown> | undefined;
  if (!msg) return;

  // GUARD: Skip echoes and reactions
  if (msg.is_echo) return;
  if (msg.reaction) return;

  const senderId = (event.sender as { id?: string })?.id;
  if (!senderId) return;

  // GUARD: Never reply to ourselves
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) {
    console.log("⏭️ Skipping — sender is our own page");
    return;
  }

  // GUARD: Deduplicate
  const mid = (msg.mid as string | undefined) ?? "";
  if (mid && await alreadyProcessed(`ig_dm_${mid}`)) {
    console.log("⏭️ Duplicate DM:", mid);
    return;
  }

  // GUARD: Rate limit
  if (await isRateLimited(`ig_${senderId}`)) return;

  const messageText = ((msg.text as string | undefined) ?? "").trim();
  const msgType = classifyAttachment(msg);

  // Unsupported media
  if (msgType === "unsupported") {
    await sendIGDM(
      senderId,
      "Sat Shri Akal Ji 🙏 Please send the reel or post link as text and we'll help right away!"
    );
    await saveConversation({
      platform: "instagram_dm",
      sender_id: senderId,
      post_link: null,
      human_message: "[unsupported media]",
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  const attachedLink = safeExtractAttachedLink(msg);
  const textLink = extractLinkFromMessage(messageText);
  const resolvedLink = attachedLink || textLink;

  if (!messageText && !resolvedLink && msgType !== "image") return;

  // GUARD: Burst deduplication — don't reply to same sender twice in 5s
  // This handles the case where someone sends 3 messages rapidly
  // We process the FIRST one, the others get deduplicated here
  const alreadyReplied = await recentlyRepliedTo(senderId, "instagram_dm");
  if (alreadyReplied) {
    console.log(`⏭️ Already replied to ${senderId} recently — skipping burst message`);
    // Still save the message so owner can see the full conversation
    await saveConversation({
      platform: "instagram_dm",
      sender_id: senderId,
      post_link: resolvedLink,
      human_message: messageText || `[${msgType}]`,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  console.log(
    `📨 IG DM | ${senderId} | "${messageText.slice(0, 80)}" | link:${resolvedLink ?? "none"}`
  );

  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: messageText || (msgType === "image" ? "screenshot" : ""),
    instagramPostLink: resolvedLink,
    senderName: senderId,
    platform: "instagram_dm",
    messageType:
      msgType === "image" ? "image" : msgType === "reel" ? "reel" : "text",
    attachedLink: resolvedLink,
  });

  await saveConversation({
    platform: "instagram_dm",
    sender_id: senderId,
    post_link: resolvedLink,
    human_message: messageText || `[${msgType}]`,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

  if (reply.trim()) {
    await sendIGDM(senderId, reply);
    await markReplied(senderId, "instagram_dm");

    if (!needsHuman && followUp?.trim()) {
      const intent = detectIntent(messageText);
      if (intent !== "phone_number" && intent !== "negative" && intent !== "thanks") {
        await sleep(1500);
        await sendIGDM(senderId, followUp);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagramComment(value: Record<string, unknown>) {
  if (!value || typeof value !== "object") return;

  const commentText = ((value.text as string | undefined) ?? "").trim();
  const commentId = value.id as string | undefined;
  const from = value.from as { id?: string } | undefined;
  const senderId = from?.id;
  const media = value.media as { id?: string; link?: string } | undefined;

  if (!commentId || !senderId || !commentText) return;

  // GUARD 1: Never reply to our own page
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) {
    console.log("⏭️ Own page comment — skipping");
    return;
  }

  // GUARD 2: Detect if this is our own bot reply coming back as a webhook
  // This is the critical fix for your screenshot bug
  const lowerText = commentText.toLowerCase();
  const isBotReply = BOT_COMMENT_SIGNATURES.some((sig) =>
    lowerText.includes(sig)
  );
  if (isBotReply) {
    console.log("⏭️ This is our own bot comment — ignoring to prevent loop");
    return;
  }

  // GUARD 3: Deduplicate
  if (await alreadyProcessed(`ig_comment_${commentId}`)) {
    console.log("⏭️ Duplicate comment:", commentId);
    return;
  }

  // GUARD 4: Rate limit
  if (await isRateLimited(`ig_comment_${senderId}`)) {
    console.log("⏭️ Comment rate limited:", senderId);
    return;
  }

  // Build post link
  let postLink: string | null = null;
  if (media?.link) {
    postLink = media.link;
  } else if (media?.id && !/^\d+$/.test(media.id)) {
    postLink = `https://www.instagram.com/p/${media.id}/`;
  }

  console.log(
    `💬 IG Comment | ${senderId} | "${commentText.slice(0, 80)}" | post:${postLink ?? "unknown"}`
  );

  // GUARD 5: Only engage with posts in our products DB
  const productExists = postLink ? await checkProductExists(postLink) : false;

  if (!productExists) {
    console.log("⏭️ Post not in DB — human_needed, no reply");
    await saveConversation({
      platform: "instagram_comment",
      sender_id: senderId,
      post_link: postLink,
      human_message: commentText,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  // PUBLIC reply — ONLY greeting + check DM — NEVER price or any details
  await replyToComment(
    commentId,
    "Sat Shri Akal Ji 🙏 Please check your DM for the details!"
  );

  // Get the actual answer for the DM
  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: commentText,
    instagramPostLink: postLink ?? undefined,
    senderName: senderId,
    platform: "instagram_comment",
    attachedLink: postLink ?? undefined,
  });

  // Save the comment interaction (what the customer asked, what DM we sent)
  await saveConversation({
    platform: "instagram_comment",
    sender_id: senderId,
    post_link: postLink,
    human_message: commentText,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

  // Send DM with price/details
  if (!needsHuman && reply.trim()) {
    await sendIGDM(senderId, reply);
    if (followUp?.trim()) {
      await sleep(1500);
      await sendIGDM(senderId, followUp);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────────────────────────────────────────
async function handleWhatsApp(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];
  if (!entries.length) return;

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "messages") continue;

      const value = change.value as Record<string, unknown>;
      if (value.statuses) continue; // skip status updates

      const messages = (value.messages as Record<string, unknown>[]) ?? [];
      for (const msg of messages) {
        await handleWhatsAppMessage(msg).catch((e) =>
          console.error("WA handler crashed:", e)
        );
      }
    }
  }
}

async function handleWhatsAppMessage(msg: Record<string, unknown>) {
  const msgId = msg.id as string | undefined;
  const from = msg.from as string | undefined;
  const msgType = (msg.type as string | undefined) ?? "";

  if (!from?.trim()) return;
  const senderId = from.trim();

  if (msgType === "status" || msgType === "reaction") return;

  if (msgId && await alreadyProcessed(`wa_${msgId}`)) {
    console.log("⏭️ Duplicate WA:", msgId);
    return;
  }

  if (await isRateLimited(`wa_${senderId}`)) return;

  const messageText = (
    (msg.text as { body?: string } | undefined)?.body ||
    (msg.image as { caption?: string } | undefined)?.caption ||
    (msg.video as { caption?: string } | undefined)?.caption ||
    ""
  ).trim();

  const isImage = msgType === "image";
  const isAudio = msgType === "audio";
  const isSticker = msgType === "sticker";
  const isLocation = msgType === "location";
  const isDocument = msgType === "document";

  if (isAudio || isSticker || isLocation || isDocument) {
    await sendWA(
      senderId,
      "Sat Shri Akal Ji 🙏 Please send text or share the Instagram post/reel link you're asking about!"
    );
    await saveConversation({
      platform: "whatsapp",
      sender_id: senderId,
      post_link: null,
      human_message: `[${msgType}]`,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  // Burst deduplication for WhatsApp too
  const alreadyReplied = await recentlyRepliedTo(senderId, "whatsapp");
  if (alreadyReplied) {
    console.log(`⏭️ Already replied to WA ${senderId} recently`);
    await saveConversation({
      platform: "whatsapp",
      sender_id: senderId,
      post_link: null,
      human_message: messageText || `[${msgType}]`,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  const resolvedLink = extractLinkFromMessage(messageText);

  console.log(
    `📱 WA | ${senderId} | type:${msgType} | "${messageText.slice(0, 80)}"`
  );

  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: messageText || (isImage ? "screenshot" : ""),
    instagramPostLink: resolvedLink,
    senderName: senderId,
    platform: "whatsapp",
    messageType: isImage ? "image" : "text",
    attachedLink: resolvedLink,
  });

  await saveConversation({
    platform: "whatsapp",
    sender_id: senderId,
    post_link: resolvedLink,
    human_message: messageText || `[${msgType}]`,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

  if (reply.trim()) {
    await sendWA(senderId, reply);
    await markReplied(senderId, "whatsapp");

    if (!needsHuman && followUp?.trim()) {
      const intent = detectIntent(messageText);
      if (intent !== "phone_number" && intent !== "negative" && intent !== "thanks") {
        await sleep(1500);
        await sendWA(senderId, followUp);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT LOOKUP
// ─────────────────────────────────────────────────────────────────────────────
async function checkProductExists(postLink: string): Promise<boolean> {
  const variants = normaliseLink(postLink);
  if (!variants.length) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id")
      .in("instagram_link", variants)
      .eq("is_available", true)
      .limit(1);
    if (error) {
      console.error("Product lookup error:", error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function classifyAttachment(
  msg: Record<string, unknown>
): "text" | "image" | "reel" | "story_reply" | "unsupported" {
  const attachments = msg.attachments as
    | { type?: string }[]
    | undefined;
  if (!attachments?.length) return "text";
  const type = (attachments[0]?.type ?? "").toLowerCase();
  if (!type) return "text";
  if (type === "image") return "image";
  if (type === "ig_reel" || type === "share" || type === "video") return "reel";
  if (type === "story_mention" || type === "story_reply") return "story_reply";
  return "unsupported";
}

function safeExtractAttachedLink(msg: Record<string, unknown>): string | undefined {
  try {
    const attachments = msg.attachments as Record<string, unknown>[] | undefined;
    if (!attachments?.length) return undefined;
    for (const att of attachments) {
      const payload = att.payload as Record<string, unknown> | undefined;
      const raw = (payload?.url || payload?.link) as string | undefined;
      if (raw) return extractLinkFromMessage(raw) ?? raw;
    }
  } catch (e) {
    console.error("extractAttachedLink error:", e);
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function saveConversation(data: {
  platform: string;
  sender_id: string;
  post_link?: string | null;
  human_message: string;
  ai_response: string | null;
  status: string;
  latency: number;
}) {
  try {
    const { error } = await supabaseAdmin.from("conversations").insert({
      platform: data.platform,
      sender_id: data.sender_id,
      instagram_post_link: data.post_link ?? null,
      human_message: data.human_message,
      ai_response: data.ai_response,
      status: data.status,
      response_latency_ms: data.latency,
    });
    if (error) console.error("❌ DB save:", error.message);
    else console.log("✅ Conversation saved");
  } catch (e) {
    console.error("❌ DB exception:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function sendIGDM(recipientId: string, message: string) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN || !message.trim()) return;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          messaging_type: "RESPONSE",
        }),
      }
    );
    if (!res.ok) console.error("❌ IG DM failed:", await res.text());
    else console.log("✅ IG DM →", recipientId);
  } catch (e) {
    console.error("❌ IG DM exception:", e);
  }
}

async function replyToComment(commentId: string, message: string): Promise<boolean> {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN || !message.trim()) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${commentId}/replies?access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }
    );
    if (!res.ok) {
      console.error("❌ Comment reply failed:", await res.text());
      return false;
    }
    console.log("✅ Comment replied");
    return true;
  } catch (e) {
    console.error("❌ Comment reply exception:", e);
    return false;
  }
}

async function sendWA(to: string, message: string) {
  if (
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !message.trim()
  ) return;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );
    if (!res.ok) console.error("❌ WA failed:", await res.text());
    else console.log("✅ WA →", to);
  } catch (e) {
    console.error("❌ WA exception:", e);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}