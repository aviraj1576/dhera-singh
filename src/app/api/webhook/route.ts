// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  runJewelleryAgent,
  extractLinkFromMessage,
  normaliseLink,
  detectIntent,
  bufferAndProcess,  // ADD THIS
} from "@/lib/anthropic";
import { createHmac } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Fix #18: validate at load time — if missing, self-reply guard is broken
const OUR_PAGE_ID = process.env.INSTAGRAM_PAGE_ID ?? "";
if (!OUR_PAGE_ID) {
  console.error(
    "❌ CRITICAL: INSTAGRAM_PAGE_ID env var not set — bot self-reply protection is DISABLED"
  );
}

const FUNCTION_TIMEOUT_MS = 8000; // bail before Vercel's 10s hard limit
const RATE_LIMIT_MAX = 8;    // messages per sender per window
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY — verify every POST is actually from Meta
// Fix #9: rawBody is read once and passed through, not re-read
// ─────────────────────────────────────────────────────────────────────────────
function verifyMetaSignature(signature: string | null, rawBody: string): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    console.warn("⚠️ INSTAGRAM_APP_SECRET not set — skipping signature check (dev mode only)");
    return true;
  }
  if (!signature) {
    console.error("❌ Missing x-hub-signature-256 header");
    return false;
  }
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return signature === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION — DB-based to work across all Vercel instances
// Fix #10: auto-cleanup via created_at filter, not table growth forever
// ─────────────────────────────────────────────────────────────────────────────
async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("processed_events")
      .insert({ event_id: eventId });

    // Unique violation = already processed
    if (error?.code === "23505") return true;
    if (error) console.error("Dedup insert error:", error.message);
    return false;
  } catch {
    // On error, allow processing — better to reply twice than not at all
    return false;
  }
}

// Cleanup events older than 48h — called opportunistically, not on every request
async function cleanupOldEvents() {
  try {
    await supabaseAdmin
      .from("processed_events")
      .delete()
      .lt(
        "created_at",
        new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      );
  } catch {
    // Non-critical, ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING
// Fix #11: safe DB upsert that never throws on missing row
// ─────────────────────────────────────────────────────────────────────────────
async function isRateLimited(senderId: string): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

    // Use upsert-style logic: fetch first, then update
    const { data, error } = await supabaseAdmin
      .from("sender_rate_limits")
      .select("message_count, window_start")
      .eq("sender_id", senderId)
      .maybeSingle(); // Fix #11: maybeSingle() returns null on 0 rows, never throws

    if (error) {
      console.error("Rate limit fetch error:", error.message);
      return false; // allow on error
    }

    if (!data) {
      // First message from this sender
      await supabaseAdmin.from("sender_rate_limits").insert({
        sender_id: senderId,
        window_start: new Date().toISOString(),
        message_count: 1,
        updated_at: new Date().toISOString(),
      });
      return false;
    }

    // Window expired — reset
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

    // Within window — check limit
    if (data.message_count >= RATE_LIMIT_MAX) {
      console.warn(`⚠️ Rate limit: ${senderId} (${data.message_count} messages)`);
      return true;
    }

    // Increment
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
// GET: Webhook verification
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

  console.error("❌ Webhook verification failed — token mismatch");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Receive events
// Fix #9: read rawBody ONCE, pass it everywhere
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Read body once
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // Security check
  if (!verifyMetaSignature(signature, rawBody)) {
    console.error("❌ Invalid Meta signature — dropping");
    return NextResponse.json({ status: "ok" }); // 200 to stop retries
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  // Run cleanup opportunistically (1 in 50 requests)
  if (Math.random() < 0.02) {
    cleanupOldEvents().catch(() => null);
  }

  // Hard timeout — always return before Vercel kills us
  try {
    await Promise.race([
      processEvent(body),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("FUNCTION_TIMEOUT")),
          FUNCTION_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "FUNCTION_TIMEOUT") {
      console.error("⏰ Webhook function timed out");
    } else {
      console.error("Webhook error:", msg);
    }
  }

  return NextResponse.json({ status: "ok" });
}

// ─────────────────────────────────────────────────────────────────────────────
async function processEvent(body: Record<string, unknown>) {
  if (!body || typeof body !== "object") return;
  if (body.object === "instagram") {
    await handleInstagram(body);
  } else if (body.object === "whatsapp_business_account") {
    await handleWhatsApp(body);
  }
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
      // All other change types (story_insights, live_comments, etc.) are ignored
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagramDM(event: Record<string, unknown>) {
  const msg = event.message as Record<string, unknown> | undefined;
  if (!msg) return;

  // GUARD: Echo — bot's own sent messages reflected back
  if (msg.is_echo) return;

  // GUARD: Reaction events (thumbs up on a message, etc.)
  if (msg.reaction) return;

  const senderId = (event.sender as { id?: string })?.id;
  if (!senderId) return;

  // GUARD: Never reply to ourselves
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) return;

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

  // GUARD: Unsupported media (voice notes, files, locations, stickers)
  if (msgType === "unsupported") {
    await sendIGDM(
      senderId,
      "Sat Shri Akal Ji 🙏 Please send the reel or post link as text and we'll help right away!"
    );
    await saveConversation({
      platform: "instagram_dm",
      sender_id: senderId,
      post_link: null,
      human_message: "[unsupported media type]",
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  // Fix #12: safe attachment extraction
  const attachedLink = safeExtractAttachedLink(msg);
  const textLink = extractLinkFromMessage(messageText);
  const resolvedLink = attachedLink || textLink;

  // Guard: completely empty message with no attachment
  if (!messageText && !resolvedLink && msgType !== "image") return;

  console.log(
    `📨 IG DM | ${senderId} | "${messageText.slice(0, 80)}" | type:${msgType} | link:${resolvedLink ?? "none"}`
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

    // Fix #6: only send followUp when NOT escalating
    // Fix: don't ask for phone if they just gave it or said no
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

  // GUARD: Required fields
  if (!commentId || !senderId || !commentText) return;

  // GUARD: Never reply to our own comments — PRIMARY loop prevention
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) {
    console.log("⏭️ Own comment — skipping to prevent loop");
    return;
  }

  // GUARD: Deduplicate
  if (await alreadyProcessed(`ig_comment_${commentId}`)) {
    console.log("⏭️ Duplicate comment:", commentId);
    return;
  }

  // GUARD: Rate limit per commenter
  if (await isRateLimited(`ig_comment_${senderId}`)) {
    console.log("⏭️ Rate limited commenter:", senderId);
    return;
  }

  // Build post link
  // Fix #31: log when we get numeric ID so owner knows why it wasn't matched
  let postLink: string | null = null;
  if (media?.link) {
    postLink = media.link;
  } else if (media?.id) {
    if (/^\d+$/.test(media.id)) {
      // Numeric ID — cannot build shortcode URL, need to escalate
      console.warn(
        `⚠️ Got numeric media ID (${media.id}) — cannot build Instagram URL. Add product manually.`
      );
      postLink = null;
    } else {
      postLink = `https://www.instagram.com/p/${media.id}/`;
    }
  }

  console.log(`💬 IG Comment | ${senderId} | "${commentText.slice(0, 80)}" | post:${postLink ?? "unknown"}`);

  // GUARD: Only engage if post is in our products DB
  const productExists = postLink ? await checkProductExists(postLink) : false;

  if (!productExists) {
    console.log("⏭️ Post not in products DB — escalating silently");
    await saveConversation({
      platform: "instagram_comment",
      sender_id: senderId,
      post_link: postLink,
      human_message: commentText,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return; // No public reply, no DM — just flag for human
  }

  // Public reply — greeting + check DM only, NOTHING else
  const commentReplied = await replyToComment(
    commentId,
    "Sat Shri Akal Ji 🙏 Please check your DM for the details!"
  );

  // Fix #14: if comment reply failed due to deleted post/network blip,
  // still send the DM — customer should still get their answer
  if (!commentReplied) {
    console.warn("⚠️ Comment reply failed — still sending DM");
  }

  // Get AI response for DM
  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: commentText,
    instagramPostLink: postLink ?? undefined,
    senderName: senderId,
    platform: "instagram_comment",
    attachedLink: postLink ?? undefined,
  });

  await saveConversation({
    platform: "instagram_comment",
    sender_id: senderId,
    post_link: postLink,
    human_message: commentText,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

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

      // Fix #15: skip status update webhooks — correct path is value.statuses
      if (value.statuses) {
        console.log("⏭️ Skipping WA status update");
        continue;
      }

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

  // Fix #16: validate senderId is non-empty string
  if (!from || from.trim() === "") return;
  const senderId = from.trim();

  // GUARD: Skip status and reaction events
  if (msgType === "status" || msgType === "reaction") return;

  // GUARD: Deduplicate
  if (msgId && await alreadyProcessed(`wa_${msgId}`)) {
    console.log("⏭️ Duplicate WA:", msgId);
    return;
  }

  // GUARD: Rate limit
  if (await isRateLimited(`wa_${senderId}`)) {
    console.log("⏭️ WA rate limited:", senderId);
    return;
  }

  // Extract text safely from all message types
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
  // Fix #13: video is NOT unsupported — it may have a caption with a link
  const isVideo = msgType === "video";

  // GUARD: Truly unsupported types — tell customer what to send
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

  const resolvedLink = extractLinkFromMessage(messageText);

  console.log(
    `📱 WA | ${senderId} | type:${msgType} | "${messageText.slice(0, 80)}" | link:${resolvedLink ?? "none"}`
  );

  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: messageText || (isImage ? "screenshot" : isVideo ? "video" : ""),
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
  } catch (e) {
    console.error("Product lookup exception:", e);
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
    | { type?: string; payload?: Record<string, unknown> }[]
    | undefined;
  if (!attachments?.length) return "text";

  const type = (attachments[0]?.type ?? "").toLowerCase();
  if (!type) return "text";

  if (type === "image") return "image";
  if (type === "ig_reel" || type === "share" || type === "video") return "reel";
  if (type === "story_mention" || type === "story_reply") return "story_reply";

  // audio, file, location, sticker, animated_image → unsupported
  return "unsupported";
}

// Fix #12: safe extraction that never throws
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
    if (error) console.error("❌ DB save failed:", error.message);
    else console.log("✅ Conversation saved");
  } catch (e) {
    console.error("❌ DB exception:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPERS — all wrapped in try/catch, check for empty message
// ─────────────────────────────────────────────────────────────────────────────
async function sendIGDM(recipientId: string, message: string) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    console.warn("⚠️ INSTAGRAM_ACCESS_TOKEN not set");
    return;
  }
  if (!message.trim() || !recipientId) return;

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
    if (!res.ok) {
      const err = await res.text();
      console.error("❌ IG DM failed:", err);
    } else {
      console.log("✅ IG DM →", recipientId);
    }
  } catch (e) {
    console.error("❌ IG DM exception:", e);
  }
}

// Returns true on success, false on failure
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
    !process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    console.warn("⚠️ WhatsApp tokens not set");
    return;
  }
  if (!message.trim() || !to) return;

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