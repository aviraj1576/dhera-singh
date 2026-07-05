// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  runJewelleryAgent,
  extractLinkFromMessage,
  normaliseLink,
  detectIntent,
  detectAllIntents,
} from "@/lib/anthropic";
import { createHmac } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const OUR_PAGE_ID = process.env.INSTAGRAM_PAGE_ID ?? "";
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const GRAPH_API = "https://graph.facebook.com/v25.0";
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const BURST_WAIT_MS = 3000; // wait 3s to collect burst messages

// Bot's own comment signatures — used to ignore our own replies
const BOT_COMMENT_SIGNATURES = [
  "sat shri akal ji",
  "please check your dm",
  "check your dm for the details",
];

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY — verify Meta webhook signature
// ─────────────────────────────────────────────────────────────────────────────
function verifyMetaSignature(signature: string | null, rawBody: string): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    console.warn("⚠️ INSTAGRAM_APP_SECRET not set — skipping verification");
    return true;
  }
  if (!signature) {
    console.error("❌ Missing x-hub-signature-256 header");
    return false;
  }
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const isValid = signature === expected;
  if (!isValid) {
    console.warn(`⚠️ Invalid signature. Expected: ${expected}, Got: ${signature} (Bypassing for testing)`);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION — DB-based (processed_events table)
// ─────────────────────────────────────────────────────────────────────────────
async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("processed_events")
      .insert({ event_id: eventId });
    if (error?.code === "23505") return true; // unique constraint violation = already exists
    if (error) console.error("Dedup error:", error.message);
    return false;
  } catch {
    return false;
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
// GET: Webhook Verification
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
// POST: Receive Events
// IMPORTANT: No Promise.race timeout — let Vercel's built-in timeout handle it
// The old 8.5s timeout was killing DM handlers during the 3s burst sleep
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(signature, rawBody)) {
    console.error("❌ Invalid signature — responding 200 anyway (Meta requires it)");
    return NextResponse.json({ status: "ok" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  // Opportunistic cleanup of old dedup entries (2% chance per request)
  if (Math.random() < 0.02) cleanupOldEvents().catch(() => null);

  // Process the event — NO timeout wrapper
  try {
    await processEvent(body);
  } catch (err: unknown) {
    console.error("Webhook error:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ status: "ok" });
}

async function cleanupOldEvents() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("processed_events")
    .delete()
    .lt("created_at", cutoff);
  // Also clean up old message_buffer entries
  await supabaseAdmin
    .from("message_buffer")
    .delete()
    .lt("created_at", cutoff);
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT ROUTER
// ─────────────────────────────────────────────────────────────────────────────
async function processEvent(body: Record<string, unknown>) {
  if (!body || typeof body !== "object") return;

  // Log the full payload for debugging
  console.log("📥 Webhook payload:", JSON.stringify(body).slice(0, 2000));

  if (body.object === "instagram") {
    await handleInstagram(body);
  } else if (body.object === "whatsapp_business_account") {
    await handleWhatsApp(body);
  } else {
    console.log(`⏭️ Unknown object type: ${body.object}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██ INSTAGRAM HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
async function handleInstagram(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];
  if (!entries.length) return;

  for (const entry of entries) {
    // ── DMs come under entry.messaging or entry.standby (handover protocol) ──
    const messaging = (entry.messaging as Record<string, unknown>[]) ??
                      (entry.standby as Record<string, unknown>[]) ?? [];
    if (messaging.length > 0) {
      console.log(`📩 ${messaging.length} DM/standby event(s) received`);
    }
    for (const event of messaging) {
      await handleInstagramDM(event).catch((e) =>
        console.error("❌ DM handler crashed:", e)
      );
    }

    // ── Comments come under entry.changes[field=comments] ──────────────────
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) === "comments") {
        await handleInstagramComment(
          change.value as Record<string, unknown>
        ).catch((e) => console.error("❌ Comment handler crashed:", e));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ██ INSTAGRAM DM HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagramDM(event: Record<string, unknown>) {
  console.log("📩 DM event payload:", JSON.stringify(event).slice(0, 1500));

  const msg = event.message as Record<string, unknown> | undefined;
  if (!msg) {
    console.log("⏭️ DM event has no .message field — skipping");
    return;
  }

  // GUARD 1: Skip echo messages (our own replies coming back)
  if (msg.is_echo) {
    console.log("⏭️ Echo message — skipping");
    return;
  }

  // GUARD 2: Skip reactions
  if (msg.reaction) {
    console.log("⏭️ Reaction — skipping");
    return;
  }

  // GUARD 3: Extract sender
  const senderId = (event.sender as { id?: string })?.id;
  if (!senderId) {
    console.log("⏭️ No sender ID — skipping");
    return;
  }

  // GUARD 4: Don't reply to ourselves
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) {
    console.log("⏭️ Sender is our own page — skipping");
    return;
  }

  // GUARD 5: Deduplication
  const mid = (msg.mid as string | undefined) ?? "";
  if (mid && (await alreadyProcessed(`ig_dm_${mid}`))) {
    console.log("⏭️ Duplicate DM:", mid);
    return;
  }

  // GUARD 6: Rate limit
  if (await isRateLimited(`ig_${senderId}`)) return;

  // ── EXTRACT MESSAGE CONTENT ──────────────────────────────────────────────
  const messageText = ((msg.text as string | undefined) ?? "").trim();
  const msgType = classifyDMAttachment(msg);
  const attachedLink = extractAttachedLink(msg);
  const textLink = extractLinkFromMessage(messageText);
  const resolvedLink = attachedLink || textLink;

  console.log(`📩 IG DM | ${senderId} | type:${msgType} | text:"${messageText.slice(0, 80)}" | link:${resolvedLink ?? "none"}`);

  // If message is completely empty and has no useful attachment, skip
  if (!messageText && !resolvedLink && msgType === "text") {
    console.log("⏭️ Empty DM — skipping");
    return;
  }

  // Handle unsupported media (stickers, audio, etc.)
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

  // ── BURST MESSAGE BUFFERING ──────────────────────────────────────────────
  // Insert into buffer → wait 3s → collect all burst messages → process once
  const { data: inserted, error: bufferError } = await supabaseAdmin
    .from("message_buffer")
    .insert({
      sender_id: senderId,
      platform: "instagram_dm",
      message: messageText || `[${msgType}]`,
      resolved_link: resolvedLink ?? null,
    })
    .select("id")
    .single();

  if (bufferError || !inserted) {
    console.error("Buffer insert error:", bufferError?.message);
    // Fallback: process immediately without buffering
    await processDMMessage(senderId, messageText, resolvedLink, msgType);
    return;
  }

  // Wait for more messages to arrive
  await sleep(BURST_WAIT_MS);

  // Fetch all buffered messages from this sender in the last 10 seconds
  const windowStart = new Date(Date.now() - 10_000).toISOString();
  const { data: buffered } = await supabaseAdmin
    .from("message_buffer")
    .select("id, message, resolved_link, created_at")
    .eq("sender_id", senderId)
    .eq("platform", "instagram_dm")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (!buffered?.length) {
    console.log("⏭️ Buffer empty — already processed by another handler");
    return;
  }

  // Only the FIRST message in the burst should trigger processing
  if (buffered[0].id !== inserted.id) {
    console.log("⏭️ Not first in burst — another handler will process");
    return;
  }

  // ── MERGE ALL BURST MESSAGES ─────────────────────────────────────────────
  const combinedText = buffered
    .map((b) => b.message)
    .filter((m) => m && !m.startsWith("[")) // skip [image], [reel] placeholders
    .join(" ")
    .trim();
  const combinedLink =
    buffered.find((b) => b.resolved_link)?.resolved_link ?? undefined;

  // Clear the buffer
  const bufferIds = buffered.map((b) => b.id);
  await supabaseAdmin.from("message_buffer").delete().in("id", bufferIds);

  console.log(
    `📦 Burst: ${buffered.length} msgs merged → "${combinedText.slice(0, 100)}" | link:${combinedLink ?? "none"}`
  );

  await processDMMessage(senderId, combinedText, combinedLink, msgType);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS DM MESSAGE — shared logic for both direct and burst-merged DMs
// ─────────────────────────────────────────────────────────────────────────────
async function processDMMessage(
  senderId: string,
  messageText: string,
  link: string | undefined,
  msgType: string
) {
  // ── CONTEXT LINK LOOKUP ──────────────────────────────────────────────────
  // If user asks about a product but didn't share a link, check their recent conversations
  let finalLink = link;
  if (!finalLink) {
    const allIntents = detectAllIntents(messageText);
    const needsLink =
      allIntents.has("price") ||
      allIntents.has("weight") ||
      allIntents.has("purity") ||
      allIntents.has("details");

    if (needsLink) {
      try {
        const { data: recentWithLink } = await supabaseAdmin
          .from("conversations")
          .select("instagram_post_link")
          .eq("sender_id", senderId)
          .eq("platform", "instagram_dm")
          .not("instagram_post_link", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (recentWithLink?.[0]?.instagram_post_link) {
          finalLink = recentWithLink[0].instagram_post_link;
          console.log(`🔗 Context link from history: ${finalLink}`);
        }
      } catch (e) {
        console.error("Context link lookup error:", e);
      }
    }
  }

  // ── RUN AGENT ────────────────────────────────────────────────────────────
  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: messageText || (msgType === "image" ? "screenshot" : ""),
    instagramPostLink: finalLink,
    senderName: senderId,
    platform: "instagram_dm",
    messageType:
      msgType === "image" ? "image" : msgType === "reel" ? "reel" : "text",
    attachedLink: finalLink,
  });

  // ── SAVE TO DB ───────────────────────────────────────────────────────────
  await saveConversation({
    platform: "instagram_dm",
    sender_id: senderId,
    post_link: finalLink,
    human_message: messageText || `[${msgType}]`,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

  // ── SEND REPLY ───────────────────────────────────────────────────────────
  if (reply.trim()) {
    await sendIGDM(senderId, reply);

    // Send follow-up (phone number ask) after a brief delay
    if (!needsHuman && followUp?.trim()) {
      const intent = detectIntent(messageText);
      if (intent !== "phone_number" && intent !== "negative" && intent !== "thanks") {
        await sleep(1500);
        await sendIGDM(senderId, followUp);
      }
    }
  }

  // If the query needs human escalation, pass thread control to Meta Page Inbox
  if (needsHuman) {
    await passThreadControl(senderId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██ INSTAGRAM COMMENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
async function resolveMediaPermalink(mediaId: string): Promise<string | null> {
  if (!IG_TOKEN || !mediaId) return null;
  try {
    const res = await fetch(
      `${GRAPH_API}/${mediaId}?fields=permalink&access_token=${IG_TOKEN}`
    );
    if (!res.ok) {
      console.error("❌ Media permalink fetch failed:", await res.text());
      return null;
    }
    const data = await res.json();
    return (data.permalink as string) ?? null;
  } catch (e) {
    console.error("❌ Media permalink exception:", e);
    return null;
  }
}

async function handleInstagramComment(value: Record<string, unknown>) {
  if (!value || typeof value !== "object") return;

  const commentText = ((value.text as string | undefined) ?? "").trim();
  const commentId = value.id as string | undefined;
  const from = value.from as { id?: string } | undefined;
  const senderId = from?.id;
  const media = value.media as { id?: string; link?: string } | undefined;

  if (!commentId || !senderId || !commentText) return;

  // GUARD 1: Never reply to our own page's comments
  if (OUR_PAGE_ID && senderId === OUR_PAGE_ID) {
    console.log("⏭️ Own page comment — skipping");
    return;
  }

  // GUARD 2: Detect our own bot reply coming back as a webhook
  const lowerText = commentText.toLowerCase();
  const isBotReply = BOT_COMMENT_SIGNATURES.some((sig) =>
    lowerText.includes(sig)
  );
  if (isBotReply) {
    console.log("⏭️ Bot's own comment — ignoring to prevent loop");
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

  // ── RESOLVE POST LINK ───────────────────────────────────────────────────
  let postLink: string | null = null;
  if (media?.link) {
    postLink = media.link;
  } else if (media?.id) {
    postLink = await resolveMediaPermalink(media.id);
  }

  console.log(
    `💬 IG Comment | ${senderId} | "${commentText.slice(0, 80)}" | post:${postLink ?? "unknown"}`
  );

  // GUARD 5: Only engage with posts in our products DB
  const productExists = postLink ? await checkProductExists(postLink) : false;

  if (!productExists) {
    console.log("⏭️ Post not in DB — saving as human_needed, no reply");
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

  // ── PUBLIC COMMENT REPLY — only "check your DM" ─────────────────────────
  const commentReply = "Sat Shri Akal Ji 🙏 Please check your DM for the details!";
  await replyToComment(commentId, commentReply);

  // ── GET PRODUCT DETAILS VIA AGENT ────────────────────────────────────────
  const { reply: dmReply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: commentText,
    instagramPostLink: postLink ?? undefined,
    senderName: senderId,
    platform: "instagram_comment",
    attachedLink: postLink ?? undefined,
  });

  // ── SAVE TO DB ───────────────────────────────────────────────────────────
  // Store both the comment reply and the DM content for the dashboard
  await saveConversation({
    platform: "instagram_comment",
    sender_id: senderId,
    post_link: postLink,
    human_message: commentText,
    ai_response: `[Comment: ${commentReply}] [DM: ${dmReply}]`,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
  });

  // ── SEND DM WITH PRODUCT DETAILS ─────────────────────────────────────────
  // Use comment_id as recipient for Instagram private replies
  if (dmReply.trim()) {
    await sendIGPrivateReply(commentId, dmReply);
    if (followUp?.trim()) {
      await sleep(1500);
      await sendIGPrivateReply(commentId, followUp);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██ WHATSAPP HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
async function handleWhatsApp(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];
  if (!entries.length) return;

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "messages") continue;

      const value = change.value as Record<string, unknown>;
      if (value.statuses) continue; // skip delivery status updates

      const messages = (value.messages as Record<string, unknown>[]) ?? [];
      for (const msg of messages) {
        await handleWhatsAppMessage(msg).catch((e) =>
          console.error("❌ WA handler crashed:", e)
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

  if (msgId && (await alreadyProcessed(`wa_${msgId}`))) {
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
  const isUnsupported = ["audio", "sticker", "location", "document", "contacts"].includes(msgType);

  if (isUnsupported) {
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

  // ── BURST MESSAGE BUFFERING ──────────────────────────────────────────────
  const resolvedLink = extractLinkFromMessage(messageText);

  const { data: inserted, error: bufferError } = await supabaseAdmin
    .from("message_buffer")
    .insert({
      sender_id: senderId,
      platform: "whatsapp",
      message: messageText || `[${msgType}]`,
      resolved_link: resolvedLink ?? null,
    })
    .select("id")
    .single();

  if (bufferError || !inserted) {
    console.error("WA buffer insert error:", bufferError?.message);
    // Fallback: process immediately
    await processWAMessage(senderId, messageText, resolvedLink, isImage ? "image" : "text");
    return;
  }

  await sleep(BURST_WAIT_MS);

  const windowStart = new Date(Date.now() - 10_000).toISOString();
  const { data: buffered } = await supabaseAdmin
    .from("message_buffer")
    .select("id, message, resolved_link, created_at")
    .eq("sender_id", senderId)
    .eq("platform", "whatsapp")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });

  if (!buffered?.length) return;

  if (buffered[0].id !== inserted.id) {
    console.log("⏭️ WA: Not first in burst — skipping");
    return;
  }

  const combinedText = buffered
    .map((b) => b.message)
    .filter((m) => m && !m.startsWith("["))
    .join(" ")
    .trim();
  const combinedLink =
    buffered.find((b) => b.resolved_link)?.resolved_link ?? undefined;

  await supabaseAdmin.from("message_buffer").delete().in("id", buffered.map((b) => b.id));

  console.log(
    `📦 WA Burst: ${buffered.length} msgs → "${combinedText.slice(0, 100)}" | link:${combinedLink ?? "none"}`
  );

  await processWAMessage(senderId, combinedText, combinedLink, isImage ? "image" : "text");
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS WA MESSAGE — shared logic
// ─────────────────────────────────────────────────────────────────────────────
async function processWAMessage(
  senderId: string,
  messageText: string,
  link: string | undefined,
  msgType: string
) {
  // Context link lookup
  let finalLink = link;
  if (!finalLink) {
    const allIntents = detectAllIntents(messageText);
    const needsLink =
      allIntents.has("price") ||
      allIntents.has("weight") ||
      allIntents.has("purity") ||
      allIntents.has("details");

    if (needsLink) {
      try {
        const { data: recentWithLink } = await supabaseAdmin
          .from("conversations")
          .select("instagram_post_link")
          .eq("sender_id", senderId)
          .eq("platform", "whatsapp")
          .not("instagram_post_link", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        if (recentWithLink?.[0]?.instagram_post_link) {
          finalLink = recentWithLink[0].instagram_post_link;
          console.log(`🔗 WA context link from history: ${finalLink}`);
        }
      } catch (e) {
        console.error("WA context link lookup error:", e);
      }
    }
  }

  console.log(
    `📱 WA | ${senderId} | type:${msgType} | "${messageText.slice(0, 80)}" | link:${finalLink ?? "none"}`
  );

  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: messageText || (msgType === "image" ? "screenshot" : ""),
    instagramPostLink: finalLink,
    senderName: senderId,
    platform: "whatsapp",
    messageType: msgType === "image" ? "image" : "text",
    attachedLink: finalLink,
  });

  await saveConversation({
    platform: "whatsapp",
    sender_id: senderId,
    post_link: finalLink,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ██ HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT LOOKUP — check if a post/reel is in our product database
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
// ATTACHMENT CLASSIFICATION — for Instagram DMs
// ─────────────────────────────────────────────────────────────────────────────
function classifyDMAttachment(
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

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT LINK FROM DM ATTACHMENT — handles reel shares, story replies
// ─────────────────────────────────────────────────────────────────────────────
function extractAttachedLink(msg: Record<string, unknown>): string | undefined {
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
// DB HELPER — save conversation to the conversations table
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

// Claim thread control to allow sending messages in handover protocol
async function takeThreadControl(recipientId: string) {
  if (!IG_TOKEN) return;
  try {
    const res = await fetch(
      `${GRAPH_API}/${OUR_PAGE_ID}/take_thread_control?access_token=${IG_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          metadata: "Bot taking control to send reply",
        }),
      }
    );
    if (!res.ok) {
      console.warn("⚠️ Take thread control failed:", await res.text());
    } else {
      console.log("✅ Taken thread control for", recipientId);
    }
  } catch (e) {
    console.error("❌ Take thread control exception:", e);
  }
}

// Pass control back to Facebook Page Inbox so human agents can reply in Meta Business Suite
async function passThreadControl(recipientId: string) {
  if (!IG_TOKEN) return;
  try {
    const res = await fetch(
      `${GRAPH_API}/${OUR_PAGE_ID}/pass_thread_control?access_token=${IG_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          target_app_id: "263902037430900", // Meta Page Inbox App ID
          metadata: "Passing control to human inbox",
        }),
      }
    );
    if (!res.ok) {
      console.warn("⚠️ Pass thread control failed:", await res.text());
    } else {
      console.log("✅ Passed thread control to Page Inbox for", recipientId);
    }
  } catch (e) {
    console.error("❌ Pass thread control exception:", e);
  }
}

// Send a regular DM to a user by their Instagram-scoped user ID (IGSID)
async function sendIGDM(recipientId: string, message: string) {
  if (!IG_TOKEN || !message.trim()) return;
  // Always take thread control before sending a direct message
  await takeThreadControl(recipientId);
  try {
    const res = await fetch(
      `${GRAPH_API}/${OUR_PAGE_ID}/messages?access_token=${IG_TOKEN}`,
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
    const responseText = await res.text();
    if (!res.ok) {
      console.error("❌ IG DM failed:", responseText);
    } else {
      console.log("✅ IG DM →", recipientId);
    }
  } catch (e) {
    console.error("❌ IG DM exception:", e);
  }
}

// Send a private reply linked to a specific comment
// This is the ONLY way to DM someone who commented on your post
// Uses the Instagram Private Replies API
async function sendIGPrivateReply(commentId: string, message: string) {
  if (!IG_TOKEN || !message.trim()) return;
  try {
    const res = await fetch(
      `${GRAPH_API}/${OUR_PAGE_ID}/messages?access_token=${IG_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text: message },
          messaging_type: "RESPONSE",
        }),
      }
    );
    const responseText = await res.text();
    if (!res.ok) {
      console.error("❌ IG Private Reply failed:", responseText);
    } else {
      console.log("✅ IG Private Reply (comment:", commentId, ")");
    }
  } catch (e) {
    console.error("❌ IG Private Reply exception:", e);
  }
}

async function replyToComment(commentId: string, message: string): Promise<boolean> {
  if (!IG_TOKEN || !message.trim()) return false;
  try {
    const res = await fetch(
      `${GRAPH_API}/${commentId}/replies?access_token=${IG_TOKEN}`,
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
      `${GRAPH_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
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