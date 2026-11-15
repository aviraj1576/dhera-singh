// src/lib/webhook/ice-breakers.ts
// Pure module (no I/O): safe to import from both server routes and client components.
//
// `ICE_BREAKERS` holds the DEFAULT wording. The wording admins edit in the dashboard is saved in
// `admin_config` (see ice-breakers-store.ts) and is what "Sync" publishes. The `payload` values are
// fixed: bot-logic.ts `handlePostback` picks the reply from the payload, so editing the question
// text never changes what the bot answers.
export const ICE_BREAKERS = [
  {
    question: {
      default: "Aaj da gold rate? / Today's gold rate",
      // hi_IN: "आज का सोने का रेट?",
      // pa_IN: "ਅਜ ਦਾ ਸੋਣੇ ਦਾ ਰੇਟ?",
    },
    payload: "ICE_GOLD_RATE",
  },
  {
    question: {
      default: "Reel wale design da price / Price of reel design",
      // hi_IN: "रील वाले डिज़ाइन का प्राइस",
      // pa_IN: "ਰੀਲ ਵਾਲੇ ਡਿਜ਼ਾਈਨ ਦਾ ਪ੍ਰਾਈਸ",
    },
    payload: "ICE_REEL_PRICE",
  },
  {
    question: {
      default: "Shop address te timing / Shop address & timing",
      // hi_IN: "दुकान का पता और समय",
      // pa_IN: "ਦੁਕਾਨ ਦਾ ਪਤਾ ਅਤੇ ਸਮਾਂ",
    },
    payload: "ICE_STORE_INFO",
  },
  {
    question: {
      default: "Team naal gal karni hai / Call me",
      // hi_IN: "टीम से बात करनी है",
      // pa_IN: "ਟੀਮ ਨਾਲ ਗੱਲ ਕਰਨੀ ਹੈ",
    },
    payload: "ICE_CALLBACK",
  },
] as const;

export type IceBreakerPayload = typeof ICE_BREAKERS[number]["payload"];

/** One starter question as the dashboard edits and stores it. */
export interface IceBreakerQuestion {
  payload: IceBreakerPayload;
  question: string;
}

/** Instagram rejects ice-breaker questions longer than this many characters. */
export const ICE_BREAKER_MAX_QUESTION_LENGTH = 80;

export const DEFAULT_ICE_BREAKER_QUESTIONS: IceBreakerQuestion[] = ICE_BREAKERS.map((ib) => ({
  payload: ib.payload,
  question: ib.question.default,
}));

/**
 * Validate admin-supplied questions. All four payloads must be present exactly once; only the
 * wording is editable. Returns them in the canonical (default) order.
 */
export function parseIceBreakerQuestions(
  input: unknown
): { ok: true; questions: IceBreakerQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "questions must be a list" };

  const byPayload = new Map<string, string>();
  for (const item of input) {
    if (!item || typeof item !== "object") return { ok: false, error: "Each question must be an object" };
    const { payload, question } = item as { payload?: unknown; question?: unknown };
    if (typeof payload !== "string" || !DEFAULT_ICE_BREAKER_QUESTIONS.some((d) => d.payload === payload)) {
      return { ok: false, error: "Unknown ice breaker" };
    }
    if (byPayload.has(payload)) return { ok: false, error: "Duplicate ice breaker" };
    if (typeof question !== "string") return { ok: false, error: "Each question must be text" };

    const text = question.trim();
    if (!text) return { ok: false, error: "A question can't be empty" };
    if ([...text].length > ICE_BREAKER_MAX_QUESTION_LENGTH) {
      return { ok: false, error: `Questions can be at most ${ICE_BREAKER_MAX_QUESTION_LENGTH} characters` };
    }
    if (/[\u0000-\u001F\u007F]/.test(text)) return { ok: false, error: "Questions must be a single line of text" };
    byPayload.set(payload, text);
  }

  if (byPayload.size !== DEFAULT_ICE_BREAKER_QUESTIONS.length) {
    return { ok: false, error: `Expected ${DEFAULT_ICE_BREAKER_QUESTIONS.length} questions` };
  }

  return {
    ok: true,
    questions: DEFAULT_ICE_BREAKER_QUESTIONS.map((d) => ({ payload: d.payload, question: byPayload.get(d.payload)! })),
  };
}

/**
 * Hash of the questions that were synced.
 * Used to detect when the wording changes and a re-sync is needed.
 */
export function getIceBreakersHash(questions: IceBreakerQuestion[] = DEFAULT_ICE_BREAKER_QUESTIONS): string {
  const str = JSON.stringify(questions);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Build request body for Meta's ice breaker API
 */
export function buildIceBreakersBody(questions: IceBreakerQuestion[] = DEFAULT_ICE_BREAKER_QUESTIONS) {
  return {
    platform: "instagram",
    ice_breakers: [
      {
        call_to_actions: questions.map((ib) => ({
          question: ib.question,
          payload: ib.payload,
        })),
        locale: "default",
      },
    ],
  };
}
