// src/lib/webhook/bot-logic.ts
import { supabaseAdmin } from "@/lib/supabase";
import {
  sendDM,
  sendPrivateReply,
  replyToComment,
  resolveMediaPermalink,
  checkTokenHealth,
  passThreadControl,
  getUserProfile,
} from "./graph-client";
import { NormalisedEvent, EventKind, shouldIgnoreEvent } from "./event-normaliser";
import { checkAndMarkProcessed, checkRateLimit } from "./dedupe";
import { runJewelleryAgent, extractLinkFromMessage, detectIntent, detectAllIntents } from "@/lib/anthropic";
import { saveConversation } from "./conversation-helpers";
import { getReelContext, setReelContext, clearReelContext } from "./reel-context";
import { insertBurstMessage, processBurstMessages } from "./burst-buffer";
import { getConversationHistory, formatHistoryForClaude } from "./conversation-history";
import { detectLanguage, getLanguagePrompt } from "./language";
import { storeOutboundMessage, isHumanReply, pauseBotForSender, isBotPaused, isBotEnabled } from "./outbound-messages";
import { 
  buildFirstCommentDM, 
  shouldReplyToComment, 
  checkCommentCooldown, 
  shouldSkipComment,
  buildProductDetailReply,
  buildCompactList,
  buildGoldRateReply,
  buildStoreInfoReply
} from "./phase4-replies";
import { 
  upsertLead, 
  handleNameCapture, 
  handlePhoneCapture, 
  redactPhone,
  recordLeadInterest,
  markLeadInterestSelected,
  processControlKeywords,
  executeDelete,
  executeStop
} from "./lead-capture";

const PAGE_ID = process.env.INSTAGRAM_PAGE_ID!;
const BOT_COMMENT_SIGNATURES = [
  "sat shri akal ji",
  "please check your dm",
  "check your dm for the details",
];

const COMMENT_RATE_LIMIT = 8;
const DM_RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Get config value from admin_config
 */
async function getConfig(key: string, defaultVal: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("admin_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return data?.value?.replace(/^"|"$/g, "") ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

/**
 * Get config boolean
 */
async function getConfigBool(key: string, defaultVal: boolean): Promise<boolean> {
  const val = await getConfig(key, String(defaultVal));
  return val === "true";
}

/**
 * Main event processor
 */
export async function processNormalisedEvent(event: NormalisedEvent): Promise<void> {
  // Global kill switch
  if (!(await isBotEnabled())) {
    console.log("🤖 Bot disabled globally — storing event only");
    await saveConversation({
      platform: event.kind.startsWith("dm_") ? "instagram_dm" : "instagram_comment",
      sender_id: event.senderId,
      post_link: null,
      human_message: event.text || `[${event.kind}]`,
      ai_response: null,
      status: "stored_bot_disabled",
      latency: 0,
    });
    return;
  }

  // Self-filter
  if (shouldIgnoreEvent(event)) {
    console.log(`⏭️ Ignoring event ${event.eventId}: self-filter`);
    return;
  }

  // Deduplication
  if (await checkAndMarkProcessed(event.eventId)) {
    console.log(`⏭️ Duplicate event: ${event.eventId}`);
    return;
  }

  // Rate limiting
  const isComment = event.kind === "comment";
  const rateLimit = isComment ? COMMENT_RATE_LIMIT : DM_RATE_LIMIT;
  if (await checkRateLimit(event.senderId, isComment ? "comment" : "dm", rateLimit, RATE_WINDOW_MS)) {
    return;
  }

  // Check if bot is paused for this sender
  if (await isBotPaused(event.senderId, "instagram")) {
    console.log(`⏸️ Bot paused for ${event.senderId} — storing only`);
    await saveConversation({
      platform: "instagram_dm",
      sender_id: event.senderId,
      post_link: null,
      human_message: event.text || `[${event.kind}]`,
      ai_response: null,
      status: "stored_bot_paused",
      latency: 0,
    });
    return;
  }

  console.log(`📥 Processing ${event.kind} from ${event.senderId} (${event.eventId})`);

  try {
    // Handle burst buffering for DMs
    if (event.kind.startsWith("dm_") && event.kind !== "dm_quick_reply") {
      const insertedId = await insertBurstMessage(
        event.senderId,
        "instagram_dm",
        event.text || `[${event.kind}]`,
        extractLinkFromMessage(event.text) ?? null
      );

      if (insertedId) {
        const burstResult = await processBurstMessages(event.senderId, "instagram_dm", insertedId);
        if (!burstResult) return; // Not first in burst or already processed
        
        // Update event with merged content
        event.text = burstResult.combinedText;
        // Note: link handling would need adjustment for burst
      }
    }

    switch (event.kind) {
      case "comment":
        await handleComment(event);
        break;
      case "dm_text":
      case "dm_story_reply":
      case "dm_story_mention":
      case "dm_share":
      case "dm_attachment":
      case "dm_quick_reply":
        await handleDM(event);
        break;
      case "postback":
        await handlePostback(event);
        break;
      case "echo":
        await handleEcho(event);
        break;
      default:
        console.log(`⏭️ Unhandled event kind: ${event.kind}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${event.kind}:`, err);
    await saveConversation({
      platform: "instagram_dm",
      sender_id: event.senderId,
      post_link: null,
      human_message: event.text || `[${event.kind}]`,
      ai_response: null,
      status: "human_needed",
      latency: 0,
      error_info: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

/**
 * Handle Instagram comment
 */
async function handleComment(event: NormalisedEvent): Promise<void> {
  // Check if our own bot comment
  const lowerText = event.text.toLowerCase();
  if (BOT_COMMENT_SIGNATURES.some((sig) => lowerText.includes(sig))) {
    console.log("⏭️ Bot's own comment — ignoring");
    return;
  }

  // Resolve post link from media ID
  let postLink: string | null = null;
  if (event.mediaId) {
    postLink = await resolveMediaPermalink(event.mediaId);
  }

  if (!postLink) {
    console.log("⏭️ Could not resolve post link");
    await saveConversation({
      platform: "instagram_comment",
      sender_id: event.senderId,
      post_link: null,
      human_message: event.text,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  // Check if product exists for this link
  const productExists = await checkProductExists(postLink);
  if (!productExists) {
    console.log("⏭️ Post not in DB — saving as human_needed");
    await saveConversation({
      platform: "instagram_comment",
      sender_id: event.senderId,
      post_link: postLink,
      human_message: event.text,
      ai_response: null,
      status: "human_needed",
      latency: 0,
    });
    return;
  }

  // Get products for this reel
  const products = await getProductsByLink(postLink);
  if (!products.length) {
    console.log("⏭️ No products found for reel");
    return;
  }

  // Upsert lead on comment
  await upsertLead("instagram", event.senderId, {
    username: event.commentUsername,
    entryPoint: "comment_reel",
    sourceReelCode: extractReelCode(postLink) ?? undefined,
    lastUserMessageAt: new Date(),
  });

  // Record lead interests for all products shown
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("platform", "instagram")
    .eq("platform_user_id", event.senderId)
    .maybeSingle();
  
  if (lead) {
    for (const product of products) {
      await recordLeadInterest(lead.id, extractReelCode(postLink) ?? "", product.id, "comment_reply");
    }
  }

  // Phase 4: Gating checks
  const commentMode = (await getConfig("comment_reply_mode", "intent")) as "all" | "intent";
  if (!shouldReplyToComment(event.text, commentMode)) {
    console.log("⏭️ Comment doesn't match intent filter — skipping");
    await saveConversation({
      platform: "instagram_comment",
      sender_id: event.senderId,
      post_link: postLink,
      human_message: event.text,
      ai_response: null,
      status: "skipped_intent",
      latency: 0,
    });
    return;
  }

  if (shouldSkipComment(event.text)) {
    console.log("⏭️ Emoji-only or short comment — skipping");
    return;
  }

  // Check 24h cooldown
  const reelCode = extractReelCode(postLink);
  if (reelCode && await checkCommentCooldown(event.senderId, reelCode)) {
    console.log("⏭️ 24h cooldown active for this sender/reel");
    return;
  }

  // Build first DM with all products (Phase 4: single message, weight + making shown)
  const dmMessage = await buildFirstCommentDM(products, event.senderId, true);

  // Send private reply FIRST
  const commentId = event.eventId.replace("ig_comment_", "");
  const privateRes = await sendPrivateReply(commentId, dmMessage);
  
  if (privateRes.error) {
    console.error("❌ Private reply failed:", privateRes.error);
    await saveConversation({
      platform: "instagram_comment",
      sender_id: event.senderId,
      post_link: postLink,
      human_message: event.text,
      ai_response: null,
      status: "send_failed",
      latency: 0,
      error_info: privateRes.error.message,
    });
    return;
  }

  // Store outbound message for human reply detection
  if (privateRes.data?.message_id) {
    await storeOutboundMessage({
      message_id: privateRes.data.message_id,
      platform: "instagram",
      recipient_id: privateRes.data.recipient_id ?? event.senderId,
      kind: "private_reply",
      created_at: new Date().toISOString(),
    });
  }

  // Store reel context for follow-up DMs
  const recipientId = privateRes.data?.recipient_id;
  if (recipientId) {
    await setReelContext({
      platform: "instagram",
      senderId: recipientId,
      commentId: commentId,
      reelCode: reelCode ?? "",
      productIds: products.map((p) => p.id),
    });
  }

  // Only send public reply if private succeeded
  await replyToComment(commentId, 
    "Sat Shri Akal Ji 🙏 Details sent to your DM. Please also check Message Requests."
  );

  // Save conversation
  await saveConversation({
    platform: "instagram_comment",
    sender_id: event.senderId,
    post_link: postLink,
    human_message: event.text,
    ai_response: `[Comment reply sent] [DM: ${dmMessage}]`,
    status: "ai_answered",
    latency: 0,
    message_id: privateRes.data?.message_id,
  });
}

/**
 * Handle DM events
 */
async function handleDM(event: NormalisedEvent): Promise<void> {
  // Upsert lead on first contact
  await upsertLead("instagram", event.senderId, {
    entryPoint: "dm",
    lastUserMessageAt: new Date(),
  });

  // Check for control keywords (DELETE/STOP)
  const { isDelete, isStop } = processControlKeywords(event.text);
  if (isDelete) {
    const reply = await executeDelete(event.senderId, "instagram");
    await sendDM(event.senderId, reply);
    return;
  }
  if (isStop) {
    const reply = await executeStop(event.senderId, "instagram");
    await sendDM(event.senderId, reply);
    return;
  }

  let link = extractLinkFromMessage(event.text);
  
  // Check for attached link
  if (!link) {
    // Would need to check event attachments for links
  }

  // Check reel context if no link
  if (!link && (event.kind === "dm_text" || event.kind === "dm_story_reply")) {
    const context = await getReelContext(event.senderId);
    if (context?.reelCode) {
      link = `https://www.instagram.com/reel/${context.reelCode}/`;
    }
  }

  // Check if this is a product selection (number, "all", "more")
  const selection = parseProductSelection(event.text);
  if (selection && event.kind === "dm_text") {
    await handleProductSelection(event.senderId, selection, event.text);
    return;
  }

  // Handle name capture (stage: asked_name)
  const nameResult = await handleNameCapture(event.senderId, event.text);
  if (nameResult.handled) {
    if (nameResult.reply) await sendDM(event.senderId, nameResult.reply);
    return;
  }

  // Handle phone capture (stage: asked_phone)
  const phoneResult = await handlePhoneCapture(event.senderId, event.text);
  if (phoneResult.handled) {
    if (phoneResult.reply) await sendDM(event.senderId, phoneResult.reply);
    return;
  }

  // Redact phone from message before saving/sending to Claude
  const redactedText = redactPhone(event.text);

  // Get conversation history for context
  const history = await getConversationHistory(event.senderId, "instagram_dm", 6);
  const historyText = formatHistoryForClaude(history);

  // Detect language for mirroring
  const { language, script, locale } = detectLanguage(event.text);
  const languagePrompt = getLanguagePrompt(language, script);

  // Run agent with language context and history
  const { reply, followUp, needsHuman, latencyMs } = await runJewelleryAgent({
    userMessage: redactedText || (event.kind === "dm_attachment" ? "attachment" : ""),
    instagramPostLink: link ?? undefined,
    senderName: event.senderId,
    platform: "instagram_dm",
    messageType: event.kind === "dm_story_reply" ? "story_reply" : 
                 event.kind === "dm_share" ? "reel" : "text",
    attachedLink: link ?? undefined,
    conversationHistory: historyText,
    languagePrompt,
    locale,
  });

  // Save conversation (with redacted human message)
  await saveConversation({
    platform: "instagram_dm",
    sender_id: event.senderId,
    post_link: link ?? null,
    human_message: redactedText || `[${event.kind}]`,
    ai_response: reply,
    status: needsHuman ? "human_needed" : "ai_answered",
    latency: latencyMs,
    context: event.kind,
  });

  // Send reply
  if (reply.trim()) {
    const dmRes = await sendDM(event.senderId, reply);
    
    if (dmRes.data?.message_id) {
      await storeOutboundMessage({
        message_id: dmRes.data.message_id,
        platform: "instagram",
        recipient_id: event.senderId,
        kind: "bot",
        created_at: new Date().toISOString(),
      });
    }

    if (!needsHuman && followUp?.trim()) {
      const intent = detectIntent(event.text);
      if (intent !== "phone_number" && intent !== "negative" && intent !== "thanks") {
        await new Promise((r) => setTimeout(r, 1500));
        const followUpRes = await sendDM(event.senderId, followUp);
        if (followUpRes.data?.message_id) {
          await storeOutboundMessage({
            message_id: followUpRes.data.message_id,
            platform: "instagram",
            recipient_id: event.senderId,
            kind: "bot",
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Escalate if needed (Option 1: no Meta handover)
  if (needsHuman) {
    await pauseBotForSender(event.senderId, "instagram", 12);
  }
}

/**
 * Handle echo (our own message coming back)
 * Detect if it's actually a human reply
 */
async function handleEcho(event: NormalisedEvent): Promise<void> {
  // Echo events have kind "echo" and we need to check if the message_id matches our outbound
  // The actual echo detection happens in the normaliser which marks kind="echo"
  // Here we check if this echo is from a human (not our bot)
  // This would need the echo message_id from the event
  console.log("🔄 Echo event received");
}

/**
 * Handle postback (ice breaker)
 */
async function handlePostback(event: NormalisedEvent): Promise<void> {
  const payload = event.postbackPayload;
  if (!payload) return;

  let reply = "";
  switch (payload) {
    case "ICE_GOLD_RATE":
      reply = await buildGoldRateReply();
      break;
    case "ICE_REEL_PRICE":
      reply = "Send the reel link or comment 'price' under the reel for a design's price!";
      break;
    case "ICE_STORE_INFO":
      reply = await buildStoreInfoReply();
      break;
    case "ICE_CALLBACK":
      reply = "May I know your name, ji? 🙏";
      break;
    default:
      reply = "Thanks for reaching out! Our team will assist you shortly.";
  }

  const dmRes = await sendDM(event.senderId, reply);
  if (dmRes.data?.message_id) {
    await storeOutboundMessage({
      message_id: dmRes.data.message_id,
      platform: "instagram",
      recipient_id: event.senderId,
      kind: "bot",
      created_at: new Date().toISOString(),
    });
  }

  await saveConversation({
    platform: "instagram_dm",
    sender_id: event.senderId,
    post_link: null,
    human_message: `[Ice breaker: ${event.postbackTitle}]`,
    ai_response: reply,
    status: payload === "ICE_CALLBACK" ? "human_needed" : "ai_answered",
    latency: 0,
    context: "icebreaker",
  });
}

/**
 * Handle lead capture (name/phone)
 */
async function handleLeadCapture(senderId: string, text: string): Promise<{ handled: boolean }> {
  // Check if we have a lead for this sender
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("platform", "instagram")
    .eq("platform_user_id", senderId)
    .maybeSingle();

  if (!lead) return { handled: false };

  // If already complete or declined
  if (lead.capture_stage === "complete" || lead.capture_stage === "declined") {
    return { handled: false };
  }

  const lower = text.toLowerCase().trim();

  // Handle name capture
  if (lead.capture_stage === "asked_name") {
    // Check if it looks like a name (2-40 chars, letters/spaces, not a question/intent)
    if (text.length >= 2 && text.length <= 40 && 
        /^[\p{L}\s]+$/u.test(text) && 
        !lower.includes("?") &&
        !["price", "weight", "purity", "details"].some(w => lower.includes(w))) {
      
      await supabaseAdmin
        .from("leads")
        .update({
          name: text.trim(),
          capture_stage: "asked_phone",
          last_ask_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      await sendDM(senderId, "And your mobile number so our team can call you? We use it only for this enquiry. 🙏");
      return { handled: true };
    }
    // If not a name, re-ask once more later
    return { handled: false };
  }

  // Handle phone capture
  if (lead.capture_stage === "asked_phone") {
    // Extract phone from anywhere in message
    const phoneMatch = extractPhone(text);
    if (phoneMatch) {
      await supabaseAdmin
        .from("leads")
        .update({
          phone_e164: phoneMatch.e164,
          phone_raw: phoneMatch.raw,
          phone_consent_at: new Date().toISOString(),
          phone_consent_version: "v1",
          phone_source: "typed_in_chat",
          capture_stage: "complete",
          needs_human: true,
          contact_status: "contact_requested",
          last_user_message_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      // Redact phone in conversation
      await sendDM(senderId, `Thank you ${lead.name ?? "Ji"} 🙏 We have noted your number ending ${phoneMatch.e164.slice(-4)}. Our team will call you. Reply DELETE any time to remove your details.`);
      return { handled: true };
    }

    // Check for refusal
    if (["no", "nahi", "nah", "later", "बाद में", "नहीं"].some(w => lower.includes(w))) {
      await supabaseAdmin
        .from("leads")
        .update({
          capture_stage: "declined",
          last_ask_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      await sendDM(senderId, "No problem! Feel free to share whenever you're ready. 🙏");
      return { handled: true };
    }
  }

  return { handled: false };
}

function extractPhone(text: string): { e164: string; raw: string } | null {
  // Indian mobile: +91/91/0 + 10 digits starting 6-9
  const indianMatch = text.match(/(\+91|91|0)?\s*([6-9]\d{9})/);
  if (indianMatch) {
    const digits = indianMatch[2];
    return { e164: `+91${digits}`, raw: indianMatch[0] };
  }
  // International: + + country code + 8-15 digits
  const intlMatch = text.match(/\+(\d{8,15})/);
  if (intlMatch) {
    return { e164: `+${intlMatch[1]}`, raw: intlMatch[0] };
  }
  return null;
}

/**
 * Parse product selection from text
 */
function parseProductSelection(text: string): { type: "number" | "all" | "more"; value?: number } | null {
  const lower = text.toLowerCase().trim();
  
  if (["all", "sab", "saare"].includes(lower)) return { type: "all" };
  if (["more", "hor", "aur"].includes(lower)) return { type: "more" };
  
  const ordinalMatch = lower.match(/\b(\d+)(?:st|nd|rd|th)?\b/);
  if (ordinalMatch) return { type: "number", value: parseInt(ordinalMatch[1]) - 1 };
  
  const hindiOrdinals: Record<string, number> = {
    "pehla": 0, "first": 0,
    "dusra": 1, "second": 1,
    "teesra": 2, "third": 2,
    "chautha": 3, "fourth": 3,
    "paanchwa": 4, "fifth": 4,
  };
  for (const [word, idx] of Object.entries(hindiOrdinals)) {
    if (lower.includes(word)) return { type: "number", value: idx };
  }
  
  return null;
}

/**
 * Handle product selection in DM
 */
async function handleProductSelection(senderId: string, selection: any, text: string): Promise<void> {
  const context = await getReelContext(senderId);
  if (!context?.productIds?.length) {
    await sendDM(senderId, "Please send the reel link or comment under a reel first.");
    return;
  }

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("*")
    .in("id", context.productIds)
    .eq("is_available", true)
    .order("display_order", { ascending: true });

  if (!products?.length) {
    await sendDM(senderId, "Products not found. Please try again.");
    return;
  }

  const showWeight = await getConfigBool("reply_show_weight", true);
  const showMaking = await getConfigBool("reply_show_making", true);

  let reply = "";
  if (selection.type === "all") {
    reply = buildCompactList(products, 1, showWeight, showMaking);
  } else if (selection.type === "more") {
    const page = (context.page ?? 0) + 1;
    await setReelContext({ ...context, page });
    const start = page * 3;
    const pageProducts = products.slice(start, start + 3);
    if (!pageProducts.length) {
      reply = "No more products. Reply 'all' to see everything.";
    } else {
      reply = buildCompactList(pageProducts, start + 1, showWeight, showMaking);
      reply += "\n\nReply 'more' for more.";
    }
  } else if (selection.type === "number") {
    const idx = selection.value;
    if (idx >= 0 && idx < products.length) {
      reply = buildProductDetailReply(products[idx], showWeight, showMaking);
      await setReelContext({ ...context, selectedProductId: products[idx].id });
      
      // Mark lead interest as selected
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("platform", "instagram")
        .eq("platform_user_id", senderId)
        .maybeSingle();
      
      if (lead && context.reelCode) {
        await markLeadInterestSelected(lead.id, context.reelCode, products[idx].id);
      }
    } else {
      reply = "Invalid selection. Please reply with a valid number.";
    }
  }

  if (reply) {
    const dmRes = await sendDM(senderId, reply);
    if (dmRes.data?.message_id) {
      await storeOutboundMessage({
        message_id: dmRes.data.message_id,
        platform: "instagram",
        recipient_id: senderId,
        kind: "bot",
        created_at: new Date().toISOString(),
      });
    }

    await saveConversation({
      platform: "instagram_dm",
      sender_id: senderId,
      post_link: null,
      human_message: text,
      ai_response: reply,
      status: "ai_answered",
      latency: 0,
    });
  }
}

/**
 * Extract reel code from Instagram URL
 */
function extractReelCode(url: string): string | null {
  const match = url.match(/\/(?:reel|p|tv)\/([^/?]+)/);
  return match?.[1] ?? null;
}

/**
 * Check if product exists for link
 */
async function checkProductExists(postLink: string): Promise<boolean> {
  const variants = [postLink, postLink.replace("www.", ""), postLink.replace("instagram.com", "www.instagram.com")];
  const { data } = await supabaseAdmin
    .from("products")
    .select("id")
    .in("instagram_link", variants)
    .eq("is_available", true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Get all products for a reel link
 */
async function getProductsByLink(postLink: string): Promise<any[]> {
  const reelCode = extractReelCode(postLink);
  if (!reelCode) return [];

  let { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("reel_code", reelCode)
    .eq("is_available", true)
    .order("display_order", { ascending: true });

  if (!data?.length) {
    const variants = [postLink, postLink.replace("www.", ""), postLink.replace("instagram.com", "www.instagram.com")];
    ({ data } = await supabaseAdmin
      .from("products")
      .select("*")
      .in("instagram_link", variants)
      .eq("is_available", true)
      .order("display_order", { ascending: true }));
  }

  return data ?? [];
}