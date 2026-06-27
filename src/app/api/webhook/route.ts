// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { runJewelleryAgent, extractLinkFromMessage } from "@/lib/anthropic";

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

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  try {
    await processEvent(body);
  } catch (err) {
    console.error("Webhook error:", err);
  }

  return NextResponse.json({ status: "ok" });
}

// ─────────────────────────────────────────────────────────────────────────────
async function processEvent(body: Record<string, unknown>) {
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

  for (const entry of entries) {

    // ── DMs ──────────────────────────────────────────────────────────────────
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];
    for (const event of messaging) {
      const msg = event.message as Record<string, unknown> | undefined;
      if (!msg || (msg.is_echo as boolean)) continue;

      const senderId = (event.sender as { id: string }).id;

      // Detect if it's an image/screenshot
      const hasImage = !!(msg.attachments as unknown[])?.length &&
        (msg.attachments as { type: string }[])?.[0]?.type === "image";

      // Detect if a reel/share was sent
      const attachments = (msg.attachments as Record<string, unknown>[] | undefined) ?? [];
      let attachedLink: string | undefined;
      for (const att of attachments) {
        const payload = att.payload as Record<string, unknown> | undefined;
        if (payload?.url) attachedLink = payload.url as string;
        if (payload?.link) attachedLink = payload.link as string;
      }

      const messageText = (msg.text as string | undefined) ?? "";

      // Extract any link the user typed in the message text
      const textLink = extractLinkFromMessage(messageText);
      const resolvedLink = attachedLink || textLink;

      console.log(`📨 DM from ${senderId}: "${messageText}" | link: ${resolvedLink ?? "none"} | image: ${hasImage}`);

      const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
        userMessage: messageText || (hasImage ? "screenshot" : ""),
        instagramPostLink: resolvedLink,
        senderName: senderId,
        platform: "instagram_dm",
        messageType: hasImage ? "image" : attachedLink ? "reel" : "text",
        attachedLink: resolvedLink,
      });

      // Save conversation
      try {
        await supabaseAdmin.from("conversations").insert({
          platform: "instagram_dm",
          sender_id: senderId,
          instagram_post_link: resolvedLink ?? null,
          human_message: messageText,
          ai_response: reply,
          status: needsHuman ? "human_needed" : "ai_answered",
          response_latency_ms: latencyMs,
        });
      } catch (e) {
        console.error("DB insert failed:", e);
      }

      // Send reply then follow-up
      if (!needsHuman) {
        await sendIGDM(senderId, reply);
        if (followUp) {
          // Small delay so messages arrive in order
          await sleep(1500);
          await sendIGDM(senderId, followUp);
        }
      }
    }

    // ── COMMENTS ─────────────────────────────────────────────────────────────
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "comments") continue;

      const value = change.value as Record<string, unknown>;
      const commentText = (value.text as string | undefined) ?? "";
      const commentId = value.id as string | undefined;
      const senderId = (value.from as { id?: string } | undefined)?.id;
      const media = value.media as { id?: string; link?: string } | undefined;

      if (!commentText.trim() || !commentId || !senderId) continue;

      // Build the post link from media id
      const postLink = media?.link ||
        (media?.id ? `https://www.instagram.com/p/${media.id}/` : undefined);

      console.log(`💬 Comment from ${senderId}: "${commentText}" | post: ${postLink}`);

      // ── Public reply: greeting + check DM only ────────────────────────────
      await replyToComment(
        commentId,
        "Sat Shri Akal Ji 🙏 Please check your DM for the details!"
      );

      // ── Look up product from the post link ────────────────────────────────
      const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
        userMessage: commentText,
        instagramPostLink: postLink,
        senderName: senderId,
        platform: "instagram_comment",
        attachedLink: postLink,
      });

      // ── Save conversation ─────────────────────────────────────────────────
      try {
        await supabaseAdmin.from("conversations").insert({
          platform: "instagram_comment",
          sender_id: senderId,
          instagram_post_link: postLink ?? null,
          human_message: commentText,
          ai_response: reply,
          status: needsHuman ? "human_needed" : "ai_answered",
          response_latency_ms: latencyMs,
        });
      } catch (e) {
        console.error("DB insert failed:", e);
      }

      // ── DM the user with price + follow-up ────────────────────────────────
      if (!needsHuman) {
        await sendIGDM(senderId, reply);
        if (followUp) {
          await sleep(1500);
          await sendIGDM(senderId, followUp);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────────────────────────────────────────
async function handleWhatsApp(body: Record<string, unknown>) {
  const entries = (body.entry as Record<string, unknown>[]) ?? [];

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      if ((change.field as string) !== "messages") continue;

      const value = change.value as Record<string, unknown>;
      const messages = (value.messages as Record<string, unknown>[]) ?? [];

      for (const msg of messages) {
        const senderId = msg.from as string;
        const msgType = msg.type as string;

        // Extract text — works for text and caption on image
        const messageText =
          (msg.text as { body?: string } | undefined)?.body ||
          (msg.image as { caption?: string } | undefined)?.caption ||
          "";

        const isImage = msgType === "image";

        // Extract any shared link from text
        const resolvedLink = extractLinkFromMessage(messageText);

        console.log(`📱 WhatsApp from ${senderId}: "${messageText}" | type: ${msgType}`);

        const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
          userMessage: messageText || (isImage ? "screenshot" : ""),
          instagramPostLink: resolvedLink,
          senderName: senderId,
          platform: "whatsapp",
          messageType: isImage ? "image" : "text",
          attachedLink: resolvedLink,
        });

        try {
          await supabaseAdmin.from("conversations").insert({
            platform: "whatsapp",
            sender_id: senderId,
            instagram_post_link: resolvedLink ?? null,
            human_message: messageText,
            ai_response: reply,
            status: needsHuman ? "human_needed" : "ai_answered",
            response_latency_ms: latencyMs,
          });
        } catch (e) {
          console.error("DB insert failed:", e);
        }

        if (!needsHuman) {
          await sendWA(senderId, reply);
          if (followUp) {
            await sleep(1500);
            await sendWA(senderId, followUp);
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function sendIGDM(recipientId: string, message: string) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    console.log("⚠️ No INSTAGRAM_ACCESS_TOKEN");
    return;
  }
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
  else console.log("✅ IG DM sent to", recipientId);
}

async function replyToComment(commentId: string, message: string) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) return;
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${commentId}/replies?access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );
  if (!res.ok) console.error("❌ Comment reply failed:", await res.text());
  else console.log("✅ Comment replied");
}

async function sendWA(to: string, message: string) {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) return;
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
  else console.log("✅ WA sent to", to);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}