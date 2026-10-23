// src/lib/webhook/graph-client.ts
export interface GraphError {
  code: number;
  subcode?: number;
  message: string;
  trace_id?: string;
}

export interface GraphResponse<T> {
  data?: T;
  error?: GraphError;
}

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PAGE_ID = process.env.INSTAGRAM_PAGE_ID!;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core Graph API request with retries and error parsing
 */
async function graphRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<GraphResponse<T>> {
  const url = `${GRAPH_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const json = await res.json();

    if (!res.ok) {
      const error: GraphError = {
        code: json.error?.code ?? res.status,
        subcode: json.error?.error_subcode,
        message: json.error?.message ?? "Unknown error",
        trace_id: json.error?.fbtrace_id,
      };

      // Retry on 5xx or rate limit (613)
      const shouldRetry = attempt < MAX_RETRIES && (res.status >= 500 || error.code === 613);
      if (shouldRetry) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        return graphRequest<T>(endpoint, options, attempt + 1);
      }

      // Don't retry these
      if ([10, 100, 190, 551].includes(error.code)) {
        return { error };
      }

      return { error };
    }

    return { data: json };
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      return graphRequest<T>(endpoint, options, attempt + 1);
    }
    return {
      error: { code: -1, message: e instanceof Error ? e.message : "Network error" },
    };
  }
}

/**
 * Send a direct message to a user (by IGSID)
 */
export async function sendDM(recipientId: string, message: string): Promise<GraphResponse<{ message_id: string }>> {
  return graphRequest<{ message_id: string }>(`/${PAGE_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      messaging_type: "RESPONSE",
    }),
  });
}

/**
 * Send a private reply to a comment
 */
export async function sendPrivateReply(
  commentId: string,
  message: string
): Promise<GraphResponse<{ message_id: string; recipient_id: string }>> {
  return graphRequest<{ message_id: string; recipient_id: string }>(`/${PAGE_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
      messaging_type: "RESPONSE",
    }),
  });
}

/**
 * Reply publicly to a comment
 */
export async function replyToComment(commentId: string, message: string): Promise<GraphResponse<{ id: string }>> {
  return graphRequest<{ id: string }>(`/${commentId}/replies`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/**
 * Resolve media permalink from media ID
 */
export async function resolveMediaPermalink(mediaId: string): Promise<string | null> {
  const res = await graphRequest<{ permalink: string }>(`/${mediaId}?fields=permalink`);
  return res.data?.permalink ?? null;
}

/**
 * Get Instagram account ID from Page
 */
export async function getInstagramAccountId(): Promise<string | null> {
  const res = await graphRequest<{ instagram_business_account: { id: string } }>(
    `/${PAGE_ID}?fields=instagram_business_account{id}`
  );
  return res.data?.instagram_business_account?.id ?? null;
}

/**
 * Check token validity (lightweight health check)
 */
export async function checkTokenHealth(): Promise<{ valid: boolean; error?: GraphError }> {
  const res = await graphRequest<{ id: string }>(`/${PAGE_ID}?fields=id`);
  return { valid: !!res.data, error: res.error };
}

/**
 * Pass thread control to Page Inbox (for handover)
 */
export async function passThreadControl(recipientId: string): Promise<GraphResponse<{ success: boolean }>> {
  return graphRequest<{ success: boolean }>(`/${PAGE_ID}/pass_thread_control`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      target_app_id: "263902037430900", // Meta Page Inbox
      metadata: "Passing control to human inbox",
    }),
  });
}

/**
 * Take thread control (Primary Receiver only)
 */
export async function takeThreadControl(recipientId: string): Promise<GraphResponse<{ success: boolean }>> {
  return graphRequest<{ success: boolean }>(`/${PAGE_ID}/take_thread_control`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientId },
      metadata: "Bot taking control to send reply",
    }),
  });
}

/**
 * Get user profile (name, username) - requires messaging permissions
 */
export async function getUserProfile(igsid: string): Promise<GraphResponse<{ name: string; username: string }>> {
  return graphRequest<{ name: string; username: string }>(`/${igsid}?fields=name,username`);
}