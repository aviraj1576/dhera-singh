// src/lib/webhook/language.ts

/**
 * Detect language and script from text
 * Returns: { language, script, locale }
 */
export function detectLanguage(text: string): {
  language: "punjabi" | "hindi" | "english" | "mixed";
  script: "gurmukhi" | "devanagari" | "roman" | "mixed";
  locale: string;
} {
  if (!text?.trim()) {
    return { language: "english", script: "roman", locale: "en" };
  }

  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(text);
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  const hasDigits = /[\u0660-\u0669\u0966-\u096F\u0A66-\u0A6F]/.test(text);

  // Punjabi keywords (Roman and Gurmukhi)
  const punjabiWords = [
    "sat sri akal", "waheguru", "ji", "hanji", "hnji", "shukriya",
    "mera", "naam", "hai", "ki", "kitna", "price", "rate", "wajan",
    "vajan", "purity", "karat", "sona", "chandi", "necklace", "earrings",
    "set", "bridal", "polki", "diamond", "stone", "making",
    "ਕੀ", "ਕਿੰਨਾ", "ਵਜਨ", "ਸੋਨਾ", "ਚਾਂਦੀ", "ਨੈਕਲੇਸ", "ਇਅਰਰਿੰਗਸ",
    "ਸੈੱਟ", "ਬ੍ਰਾਈਡਲ", "ਪੌਲਕੀ", "ਡਾਇਮੰਡ", "ਸਟੋਨ", "ਮੇਕਿੰਗ",
    "ਮੇਰਾ", "ਨਾਮ", "ਜੀ", "ਹਾਂਜੀ", "ਸਤ", "ਸ੍ਰੀ", "ਅਕਾਲ"
  ];

  // Hindi keywords (Roman and Devanagari)
  const hindiWords = [
    "namaste", "dhanyawad", "shukriya", "mera", "naam", "hai", "kya",
    "kitna", "price", "rate", "wajan", "vajan", "purity", "karat",
    "sona", "chandi", "necklace", "earrings", "set", "bridal",
    "polki", "diamond", "stone", "making",
    "क्या", "कितना", "वजन", "सोना", "चांदी", "नेकलेस", "इयररिंग्स",
    "सेट", "ब्राइडल", "पोल्की", "डायमंड", "स्टोन", "मेकिंग",
    "मेरा", "नाम", "है", "धन्यवाद", "नमस्ते"
  ];

  const lower = text.toLowerCase();
  let punjabiScore = 0;
  let hindiScore = 0;

  for (const w of punjabiWords) if (lower.includes(w)) punjabiScore++;
  for (const w of hindiWords) if (lower.includes(w)) hindiScore++;

  let language: "punjabi" | "hindi" | "english" | "mixed" = "english";
  if (punjabiScore > hindiScore && punjabiScore > 0) language = "punjabi";
  else if (hindiScore > punjabiScore && hindiScore > 0) language = "hindi";
  else if (punjabiScore > 0 && hindiScore > 0) language = "mixed";

  let script: "gurmukhi" | "devanagari" | "roman" | "mixed" = "roman";
  if (hasGurmukhi && hasDevanagari) script = "mixed";
  else if (hasGurmukhi) script = "gurmukhi";
  else if (hasDevanagari) script = "devanagari";

  // Locale for Meta API
  let locale = "en";
  if (language === "punjabi") locale = script === "gurmukhi" ? "pa_IN" : "pa_Latn";
  else if (language === "hindi") locale = script === "devanagari" ? "hi_IN" : "hi_Latn";

  return { language, script, locale };
}

/**
 * Get system prompt for detected language
 */
export function getLanguagePrompt(language: string, script: string): string {
  const base = `You are the customer service AI for Dhera Singh Jewellers, Punjab, India.`;

  if (language === "punjabi") {
    if (script === "gurmukhi") {
      return `${base} Reply in Punjabi (Gurmukhi script) mixed with English. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities — say "ਜੀ, ਸਾਡੀ ਟੀਮ ਤੁਹਾਨੂੰ ਸ਼ੀਘਰ ਹੀ ਸਹਾਇਤਾ ਕਰੇਗੀ 🙏"`;
    }
    return `${base} Reply in Punjabi (Roman script) mixed with English. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities — say "Ji, sadi team tuhanu shighar hi sahayta karegi 🙏"`;
  }

  if (language === "hindi") {
    if (script === "devanagari") {
      return `${base} Reply in Hindi (Devanagari script) mixed with English. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities — say "जी, हमारी टीम आपकी शीघ्र सहायता करेगी 🙏"`;
    }
    return `${base} Reply in Hindi (Roman script) mixed with English. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities — say "Ji, hamari team aapki shighar sahayta karegi 🙏"`;
  }

  if (language === "mixed") {
    return `${base} Reply in a mix of Punjabi, Hindi, and English matching the customer's language. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities.`;
  }

  return `${base} Reply in warm Punjabi-English. Maximum 2 short lines. ONLY answer about: shop location, hours, services, return policy, contact info. NEVER mention prices, weights, or purities — say "Ji, our team will assist you shortly 🙏"`;
}