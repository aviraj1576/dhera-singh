// src/lib/webhook/lead-capture.ts
import { supabaseAdmin } from "@/lib/supabase";
import { sendDM } from "./graph-client";
import { saveConversation } from "./conversation-helpers";

const LEAD_RETENTION_MONTHS = 12;

/**
 * Create or update lead on first contact
 */
export async function upsertLead(
  platform: string,
  platformUserId: string,
  data: {
    username?: string;
    instagramName?: string;
    entryPoint: string;
    sourceReelCode?: string;
    lastUserMessageAt?: Date;
  }
): Promise<string> {
  try {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .upsert({
        platform,
        platform_user_id: platformUserId,
        username: data.username,
        instagram_name: data.instagramName,
        entry_point: data.entryPoint,
        source_reel_code: data.sourceReelCode,
        last_user_message_at: data.lastUserMessageAt?.toISOString() ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "platform,platform_user_id" })
      .select("id")
      .single();

    if (error) throw error;
    return lead.id;
  } catch (e) {
    console.error("Upsert lead error:", e);
    return "";
  }
}

/**
 * Update lead with Instagram display name (after first message/ice breaker)
 */
export async function updateLeadInstagramName(
  platform: string,
  platformUserId: string,
  instagramName: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("leads")
      .update({ instagram_name: instagramName })
      .eq("platform", platform)
      .eq("platform_user_id", platformUserId);
  } catch (e) {
    console.error("Update IG name error:", e);
  }
}

/**
 * Handle name capture (stage: asked_name)
 */
export async function handleNameCapture(
  senderId: string,
  text: string
): Promise<{ handled: boolean; reply?: string }> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("platform", "instagram")
    .eq("platform_user_id", senderId)
    .maybeSingle();

  if (!lead || lead.capture_stage !== "asked_name") return { handled: false };

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Validate name: 2-40 chars, letters/spaces in Latin/Devanagari/Gurmukhi, not a question, not an intent
  const nameRegex = /^[\p{L}\s]{2,40}$/u;
  const isIntent = ["price", "weight", "purity", "details"].some(w => lower.includes(w));
  
  if (nameRegex.test(trimmed) && !lower.includes("?") && !isIntent) {
    await supabaseAdmin
      .from("leads")
      .update({
        name: trimmed,
        capture_stage: "asked_phone",
        last_ask_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    return { handled: true, reply: "And your mobile number so our team can call you? We use it only for this enquiry. 🙏" };
  }

  // Check for "my name is..." patterns
  const nameMatch = trimmed.match(/(?:my name is|mera naam|ਮੇਰਾ ਨਾਮ)\s+(.+)/i);
  if (nameMatch) {
    const extractedName = nameMatch[1].trim();
    if (nameRegex.test(extractedName) && !isIntent) {
      await supabaseAdmin
        .from("leads")
        .update({
          name: extractedName,
          capture_stage: "asked_phone",
          last_ask_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      return { handled: true, reply: "And your mobile number so our team can call you? We use it only for this enquiry. 🙏" };
    }
  }

  // Not a valid name - treat as normal message, will re-ask later
  return { handled: false };
}

/**
 * Handle phone capture (stage: asked_phone)
 */
export async function handlePhoneCapture(
  senderId: string,
  text: string
): Promise<{ handled: boolean; reply?: string }> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("platform", "instagram")
    .eq("platform_user_id", senderId)
    .maybeSingle();

  if (!lead || lead.capture_stage !== "asked_phone") return { handled: false };

  const lower = text.toLowerCase().trim();

  // Check for refusal
  const refusalWords = ["no", "nahi", "nah", "later", "बाद में", "नहीं", "ਨਹੀਂ", "ਨਹੀਂ ਜੀ"];
  if (refusalWords.some(w => lower.includes(w))) {
    await supabaseAdmin
      .from("leads")
      .update({
        capture_stage: "declined",
        last_ask_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    return { handled: true, reply: "No problem! Feel free to share whenever you're ready. 🙏" };
  }

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

    const last4 = phoneMatch.e164.slice(-4);
    const reply = `Thank you ${lead.name ?? "Ji"} 🙏 We have noted your number ending ${last4}. Our team will call you. Reply DELETE any time to remove your details.`;
    
    return { handled: true, reply };
  }

  // Check ask limits (max 2 asks per 7 days)
  if (lead.asks_count >= 2 && lead.last_ask_at) {
    const lastAsk = new Date(lead.last_ask_at);
    const daysSince = (Date.now() - lastAsk.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) {
      return { handled: false }; // Will not re-ask yet
    }
  }

  // Increment ask count
  await supabaseAdmin
    .from("leads")
    .update({
      asks_count: (lead.asks_count ?? 0) + 1,
      last_ask_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  return { handled: false }; // Not a phone, will ask again later
}

/**
 * Extract phone number from text
 * Returns { e164, raw } or null
 */
export function extractPhone(text: string): { e164: string; raw: string } | null {
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
 * Redact phone numbers from text (replace with [phone shared])
 */
export function redactPhone(text: string): string {
  let result = text;
  
  // Indian mobile patterns
  result = result.replace(/(\+91|91|0)?\s*[6-9]\d{9}/g, "[phone shared]");
  
  // International patterns
  result = result.replace(/\+\d{8,15}/g, "[phone shared]");
  
  return result;
}

/**
 * Record product interest for a lead
 */
export async function recordLeadInterest(
  leadId: string,
  reelCode: string,
  productId: string,
  source: string
): Promise<void> {
  try {
    await supabaseAdmin.from("lead_interests").upsert({
      lead_id: leadId,
      reel_code: reelCode,
      product_id: productId,
      source,
      shown_at: new Date().toISOString(),
    }, { onConflict: "lead_id,reel_code,product_id,source" });
  } catch (e) {
    console.error("Record lead interest error:", e);
  }
}

/**
 * Mark product as selected by lead
 */
export async function markLeadInterestSelected(
  leadId: string,
  reelCode: string,
  productId: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("lead_interests")
      .update({ selected_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("reel_code", reelCode)
      .eq("product_id", productId);
  } catch (e) {
    console.error("Mark interest selected error:", e);
  }
}

/**
 * Handle DELETE keyword - remove all lead data
 */
export async function handleDeleteKeyword(
  senderId: string,
  platform: string
): Promise<{ handled: boolean; reply: string }> {
  const deleteWords = ["delete", "remove", "हटाओ", "ਹਟਾਓ", "मिटाओ", "ਮਿਟਾਓ"];
  const lower = senderId.toLowerCase();
  
  // This is called with the actual message text, not senderId
  // Will be handled in the main flow
  return { handled: false, reply: "" };
}

/**
 * Process DELETE/STOP from message text
 */
export function processControlKeywords(text: string): { isDelete: boolean; isStop: boolean } {
  const lower = text.toLowerCase().trim();
  
  const deleteWords = ["delete", "remove my data", "हटाओ मेरा डेटा", "ਮੇਰਾ ਡੇਟਾ ਹਟਾਓ", "delete my data"];
  const stopWords = ["stop", "unsubscribe", "बंद करो", "ਬੰਦ ਕਰੋ", "stop messages"];
  
  return {
    isDelete: deleteWords.some(w => lower.includes(w)),
    isStop: stopWords.some(w => lower.includes(w)),
  };
}

/**
 * Execute DELETE - remove lead and all associated data
 */
export async function executeDelete(
  senderId: string,
  platform: string
): Promise<string> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("platform", platform)
      .eq("platform_user_id", senderId)
      .maybeSingle();

    if (!lead) return "No data found to delete.";

    const leadId = lead.id;

    // Delete in order (foreign keys)
    await supabaseAdmin.from("lead_interests").delete().eq("lead_id", leadId);
    await supabaseAdmin.from("reel_context").delete().eq("platform", platform).eq("sender_id", senderId);
    await supabaseAdmin.from("message_buffer").delete().eq("platform", platform).eq("sender_id", senderId);
    await supabaseAdmin.from("conversations").delete().eq("platform", platform).eq("sender_id", senderId);
    await supabaseAdmin.from("leads").delete().eq("id", leadId);

    return "Your data has been completely removed. Thank you for reaching out to Dhera Singh Jewellers. 🙏";
  } catch (e) {
    console.error("Execute delete error:", e);
    return "Error deleting data. Please contact us directly.";
  }
}

/**
 * Execute STOP - clear marketing flags, stop asks
 */
export async function executeStop(
  senderId: string,
  platform: string
): Promise<string> {
  try {
    await supabaseAdmin
      .from("leads")
      .update({
        capture_stage: "declined",
        contact_status: "stopped",
      })
      .eq("platform", platform)
      .eq("platform_user_id", senderId);

    return "You've been unsubscribed from future messages. Reply DELETE to remove your data entirely. 🙏";
  } catch (e) {
    console.error("Execute stop error:", e);
    return "Error processing request.";
  }
}

/**
 * Retention job - delete/anonymize leads inactive for N months
 */
export async function runRetentionJob(): Promise<{ deleted: number; anonymized: number }> {
  try {
    const cutoff = new Date(Date.now() - LEAD_RETENTION_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Find leads with no activity since cutoff
    const { data: oldLeads } = await supabaseAdmin
      .from("leads")
      .select("id")
      .lt("last_seen_at", cutoff)
      .neq("contact_status", "contact_requested");

    let deleted = 0;
    let anonymized = 0;

    for (const oldLead of oldLeads ?? []) {
      // If they have contact_requested, anonymize instead of delete
      const { data: leadData } = await supabaseAdmin
        .from("leads")
        .select("contact_status")
        .eq("id", oldLead.id)
        .maybeSingle();

      if (leadData?.contact_status === "contact_requested") {
        // Anonymize: keep but remove PII
        await supabaseAdmin
          .from("leads")
          .update({
            name: null,
            phone_e164: null,
            phone_raw: null,
            instagram_name: null,
            username: null,
            platform_user_id: `anon_${oldLead.id}`,
          })
          .eq("id", oldLead.id);
        anonymized++;
      } else {
        // Full delete
        await supabaseAdmin.from("lead_interests").delete().eq("lead_id", oldLead.id);
        await supabaseAdmin.from("leads").delete().eq("id", oldLead.id);
        deleted++;
      }
    }

    return { deleted, anonymized };
  } catch (e) {
    console.error("Retention job error:", e);
    return { deleted: 0, anonymized: 0 };
  }
}