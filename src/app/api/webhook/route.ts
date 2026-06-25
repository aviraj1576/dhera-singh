// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runJewelleryAgent } from "@/lib/anthropic";

// ─────────────────────────────────────────────────────────────────────────────
// GET: Webhook verification
// Meta calls this once when you register the webhook URL.
// It checks that your verify token matches what you set in the Meta dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const igToken = process.env.INSTAGRAM_VERIFY_TOKEN;
  const waToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && (token === igToken || token === waToken)) {
    console.log("✅ Webhook verified by Meta");
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("❌ Webhook verification failed — token mismatch");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Receive events
// Meta sends all messages, comments, DMs here in real time.
// IMPORTANT: Always return HTTP 200 quickly. If you take >5s or return an error,
// Meta will retry the event repeatedly, causing duplicate processing.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    // If body can't be parsed, still return 200 to stop retries
    return NextResponse.json({ status: "ok" });
  }

  // Process asynchronously so we can return 200 immediately
  processEvent(body).catch((err) => {
    console.error("Background event processing error:", err);
  });

  return NextResponse.json({ status: "ok" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Event router
// ─────────────────────────────────────────────────────────────────────────────
async function processEvent(body: Record<string, unknown>) {
  if (body.object === "instagram") {
    await handleInstagramEvent(body);
  } else if (body.object === "whatsapp_business_account") {
    await handleWhatsAppEvent(body);
  } else {
    console.log("Unknown event object:", body.object);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram handler
// Handles: DMs (messaging) and Comments (changes)
// ─────────────────────────────────────────────────────────────────────────────
async function handleInstagramEvent(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];

  for (const entry of entries) {
    // ── Direct Messages ──────────────────────────────────────────────────────
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];
    for (const msgEvent of messaging) {
      const message = msgEvent.message as Record<string, unknown> | undefined;
      if (!message || (message.is_echo as boolean)) continue; // skip echoes

      const senderId   = (msgEvent.sender  as { id: string }).id;
      const messageText = (message.text  as string | undefined) ?? "";
      if (!messageText.trim()) continue;

      console.log(`📨 Instagram DM from ${senderId}: ${messageText}`);

      const { reply, needsHuman, latencyMs } = await runJewelleryAgent({
        userMessage: messageText,
        senderName:  senderId,
        platform:    "instagram_dm",
      });

      await supabaseAdmin.from("conversations").insert({
        platform:            "instagram_dm",
        sender_id:           senderId,
        human_message:       messageText,
        ai_response:         reply,
        status:              needsHuman ? "human_needed" : "ai_answered",
        response_latency_ms: latencyMs,
      });

      if (!needsHuman) {
        await sendInstagramDM(senderId, reply);
      }
    }

    // ── Comments ─────────────────────────────────────────────────────────────
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "comments") continue;

      const value      = change.value as Record<string, unknown>;
      const commentText = (value.text  as string | undefined) ?? "";
      const commentId   = (value.id    as string | undefined);
      const senderId    = (value.from  as { id?: string } | undefined)?.id;
      const media       = value.media as { id?: string } | undefined;

      if (!commentText.trim() || !commentId) continue;

      // Only respond to comments that appear to be questions or price inquiries
      const isQuestion =
        commentText.includes("?") ||
        /price|rate|weight|kitna|kya|kimat|rupees|how much|bhaav|daam|sona|chandi|gold|silver/i.test(
          commentText
        );

      if (!isQuestion) continue;

      const postLink = media?.id
        ? `https://www.instagram.com/p/${media.id}/`
        : undefined;

      console.log(`💬 Instagram Comment from ${senderId}: ${commentText}`);

      // Step 1: Reply publicly on the comment — redirect to DM
      await replyToInstagramComment(
        commentId,
        "Sat Shri Akal Ji 🙏 Please check your DM for the details on this piece!"
      );

      // Step 2: Run AI to generate a private DM answer
      const { reply, needsHuman, latencyMs } = await runJewelleryAgent({
        userMessage:       commentText,
        instagramPostLink: postLink,
        senderName:        senderId,
        platform:          "instagram_comment",
      });

      // Step 3: Send the detailed answer as a DM
      if (senderId && !needsHuman) {
        await sendInstagramDM(senderId, reply);
      }

      // Step 4: Log the full interaction
      await supabaseAdmin.from("conversations").insert({
        platform:            "instagram_comment",
        sender_id:           senderId ?? "unknown",
        instagram_post_link: postLink ?? null,
        human_message:       commentText,
        ai_response:         reply,
        status:              needsHuman ? "human_needed" : "ai_answered",
        response_latency_ms: latencyMs,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleWhatsAppEvent(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "messages") continue;

      const value    = change.value as Record<string, unknown>;
      const messages = (value.messages as Record<string, unknown>[]) ?? [];

      for (const msg of messages) {
        if ((msg.type as string) !== "text") continue;

        const senderId    = (msg.from as string);
        const messageText = ((msg.text as { body?: string } | undefined)?.body) ?? "";
        if (!messageText.trim()) continue;

        console.log(`📱 WhatsApp from ${senderId}: ${messageText}`);

        const { reply, needsHuman, latencyMs } = await runJewelleryAgent({
          userMessage: messageText,
          senderName:  senderId,
          platform:    "whatsapp",
        });

        await supabaseAdmin.from("conversations").insert({
          platform:            "whatsapp",
          sender_id:           senderId,
          human_message:       messageText,
          ai_response:         reply,
          status:              needsHuman ? "human_needed" : "ai_answered",
          response_latency_ms: latencyMs,
        });

        if (!needsHuman) {
          await sendWhatsAppMessage(senderId, reply);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send helpers
// ─────────────────────────────────────────────────────────────────────────────
async function sendInstagramDM(recipientId: string, message: string) {
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      recipient:      { id: recipientId },
      message:        { text: message },
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Instagram DM failed:", err);
  } else {
    console.log(`✅ Instagram DM sent to ${recipientId}`);
  }
}

async function replyToInstagramComment(commentId: string, message: string) {
  const url = `https://graph.facebook.com/v19.0/${commentId}/replies?access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Instagram comment reply failed:", err);
  } else {
    console.log(`✅ Comment reply posted on ${commentId}`);
  }
}

async function sendWhatsAppMessage(to: string, message: string) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ WhatsApp message failed:", err);
  } else {
    console.log(`✅ WhatsApp message sent to ${to}`);
  }
}