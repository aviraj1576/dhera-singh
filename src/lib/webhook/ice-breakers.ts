// src/lib/webhook/ice-breakers.ts
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

/**
 * Generate hash of current ice breaker definitions
 * Used to detect when code changes and re-sync is needed
 */
export function getIceBreakersHash(): string {
  const str = JSON.stringify(ICE_BREAKERS);
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
export function buildIceBreakersBody() {
  return {
    platform: "instagram",
    ice_breakers: [
      {
        call_to_actions: ICE_BREAKERS.map((ib) => ({
          question: ib.question.default,
          payload: ib.payload,
        })),
        locale: "default",
      },
    ],
  };
}