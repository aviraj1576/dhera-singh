// src/lib/webhook/event-normaliser.ts
import { createHash } from "crypto";

export type EventKind =
  | "dm_text"
  | "dm_story_reply"
  | "dm_story_mention"
  | "dm_share"
  | "dm_attachment"
  | "dm_quick_reply"
  | "postback"
  | "comment"
  | "echo"
  | "ignored";

export interface NormalisedEvent {
  kind: EventKind;
  eventId: string;           // dedupe key
  shopAccountId: string;     // entry.id
  senderId: string;          // customer IGSID
  text: string;
  attachments: NormalisedAttachment[];
  storyReply?: { url: string; id: string };
  timestamp: number;
  // Comment-specific
  commentUsername?: string;
  mediaId?: string;
  // Postback-specific
  postbackPayload?: string;
  postbackTitle?: string;
}

export interface NormalisedAttachment {
  type: string;
  url?: string;
  payload?: Record<string, unknown>;
}

/**
 * Generate dedupe key for postback
 */
function postbackDedupeKey(senderId: string, timestamp: number, payload: string): string {
  return createHash("sha256").update(`${senderId}:${timestamp}:${payload}`).digest("hex").slice(0, 32);
}

/**
 * Normalise Instagram comment event
 */
function normaliseComment(
  value: Record<string, unknown>,
  entryId: string
): NormalisedEvent | null {
  const commentText = ((value.text as string | undefined) ?? "").trim();
  const commentId = (value.id as string | undefined) ?? (value.comment_id as string | undefined);
  const from = value.from as { id?: string; username?: string } | undefined;
  const senderId = from?.id;
  const media = value.media as { id?: string; media_product_type?: string } | undefined;

  if (!commentId || !senderId || !commentText) return null;

  return {
    kind: "comment",
    eventId: `ig_comment_${commentId}`,
    shopAccountId: entryId,
    senderId,
    text: commentText,
    attachments: [],
    timestamp: Date.now(),
    commentUsername: from?.username,
    mediaId: media?.id,
  };
}

/**
 * Classify DM attachment type
 */
function classifyAttachment(msg: Record<string, unknown>): NormalisedAttachment[] {
  const attachments = (msg.attachments as Array<{ type?: string; payload?: Record<string, unknown> }> | undefined) ?? [];
  return attachments.map((att) => ({
    type: att.type ?? "unknown",
    url: (att.payload?.url as string | undefined) ?? (att.payload?.link as string | undefined),
    payload: att.payload,
  }));
}

/**
 * Extract link from attachment
 */
function extractLinkFromAttachment(msg: Record<string, unknown>): string | undefined {
  const attachments = (msg.attachments as Array<{ payload?: Record<string, unknown> }> | undefined) ?? [];
  for (const att of attachments) {
    const payload = att.payload;
    const url = (payload?.url as string | undefined) ?? (payload?.link as string | undefined);
    if (url) return url;
  }
  return undefined;
}

/**
 * Normalise Instagram DM/messaging event
 */
function normaliseDM(
  event: Record<string, unknown>,
  entryId: string
): NormalisedEvent | null {
  const msg = event.message as Record<string, unknown> | undefined;
  if (!msg) return null;

  // Skip echoes (our own messages coming back)
  if (msg.is_echo) return { kind: "echo", eventId: "", shopAccountId: entryId, senderId: "", text: "", attachments: [], timestamp: Date.now() };

  // Skip reactions, deleted, unsupported
  if (msg.reaction || msg.is_deleted || msg.is_unsupported) return null;

  const sender = event.sender as { id?: string } | undefined;
  const senderId = sender?.id;
  if (!senderId) return null;

  // Skip our own page
  const pageId = process.env.INSTAGRAM_PAGE_ID;
  if (pageId && senderId === pageId) return null;

  const mid = (msg.mid as string | undefined) ?? "";
  const text = ((msg.text as string | undefined) ?? "").trim();
  const attachments = classifyAttachment(msg);
  const attachedLink = extractLinkFromAttachment(msg);
  const storyReply = msg.reply_to as { story?: { url?: string; id?: string } } | undefined;
  const storyReplyData = storyReply?.story;
  const quickReplyPayload = (msg.quick_reply as { payload?: string } | undefined)?.payload;

  // Determine kind
  let kind: EventKind = "dm_text";
  const attachmentTypes = attachments.map((a) => a.type);

  if (attachmentTypes.includes("story_reply") || storyReply) {
    kind = "dm_story_reply";
  } else if (attachmentTypes.includes("story_mention")) {
    kind = "dm_story_mention";
  } else if (attachmentTypes.some((t) => ["ig_reel", "reel", "ig_post", "share", "story", "ig_story"].includes(t))) {
    kind = "dm_share";
  } else if (attachmentTypes.length > 0 && !["text", "quick_reply"].some((t) => attachmentTypes.includes(t))) {
    kind = "dm_attachment";
  } else if (quickReplyPayload) {
    kind = "dm_quick_reply";
  }

  const eventId = mid ? `ig_dm_${mid}` : `ig_dm_${senderId}_${Date.now()}`;

  return {
    kind,
    eventId,
    shopAccountId: entryId,
    senderId,
    text,
    attachments,
    storyReply: storyReplyData ? { url: storyReplyData.url ?? "", id: storyReplyData.id ?? "" } : undefined,
    timestamp: Date.now(),
    postbackPayload: quickReplyPayload,
  };
}

/**
 * Normalise postback (ice breaker tap)
 */
function normalisePostback(
  event: Record<string, unknown>,
  entryId: string
): NormalisedEvent | null {
  const postback = event.postback as { mid?: string; title?: string; payload?: string } | undefined;
  if (!postback) return null;

  const sender = event.sender as { id?: string } | undefined;
  const senderId = sender?.id;
  if (!senderId) return null;

  const mid = postback.mid;
  const eventId = mid ? `ig_postback_${mid}` : postbackDedupeKey(senderId, Date.now(), postback.payload ?? "");

  return {
    kind: "postback",
    eventId,
    shopAccountId: entryId,
    senderId,
    text: postback.title ?? "",
    attachments: [],
    timestamp: Date.now(),
    postbackPayload: postback.payload,
    postbackTitle: postback.title,
  };
}

/**
 * Main normaliser — converts raw webhook entry to normalised events
 */
export function normaliseEntry(entry: Record<string, unknown>): NormalisedEvent[] {
  const entryId = (entry.id as string) ?? "";
  const events: NormalisedEvent[] = [];

  // Handle messaging (DMs) and standby
  const messaging = [
    ...((entry.messaging as Record<string, unknown>[]) ?? []),
    ...((entry.standby as Record<string, unknown>[]) ?? []),
  ];

  for (const event of messaging) {
    const postback = event.postback;
    if (postback) {
      const norm = normalisePostback(event, entryId);
      if (norm) events.push(norm);
    } else {
      const norm = normaliseDM(event, entryId);
      if (norm && norm.kind !== "echo") events.push(norm);
    }
  }

  // Handle comments
  const changes = (entry.changes as Record<string, unknown>[]) ?? [];
  for (const change of changes) {
    if ((change.field as string) === "comments") {
      const norm = normaliseComment(change.value as Record<string, unknown>, entryId);
      if (norm) events.push(norm);
    }
  }

  return events;
}

/**
 * Check if event should be ignored (self-filter)
 */
export function shouldIgnoreEvent(event: NormalisedEvent): boolean {
  const pageId = process.env.INSTAGRAM_PAGE_ID;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;

  // Ignore our own messages
  if (pageId && event.senderId === pageId) return true;
  if (igAccountId && event.senderId === igAccountId) return true;

  // Ignore echoes
  if (event.kind === "echo") return true;

  return false;
}