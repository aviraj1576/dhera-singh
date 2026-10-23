// src/lib/webhook/signature.ts
import { createHmac, timingSafeEqual } from "crypto";

export type SignatureSource = "instagram" | "meta" | "none";

export interface SignatureResult {
  valid: boolean;
  source: SignatureSource;
  expected?: string;
}

/**
 * Verify Meta webhook signature against allow-listed secrets.
 * Returns which secret matched (for logging) and whether valid.
 */
export function verifyMetaSignature(
  signature: string | null,
  rawBody: string
): SignatureResult {
  const secrets = [
    { name: "instagram" as const, secret: process.env.INSTAGRAM_APP_SECRET },
    { name: "meta" as const, secret: process.env.META_APP_SECRET },
  ].filter((s) => s.secret);

  if (!signature) {
    return { valid: false, source: "none" };
  }

  if (secrets.length === 0) {
    console.warn("⚠️ No webhook secrets configured — skipping verification");
    return { valid: true, source: "none" }; // observe mode: allow but warn
  }

  for (const { name, secret } of secrets) {
    const expected = "sha256=" + createHmac("sha256", secret!).update(rawBody, "utf8").digest("hex");
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: true, source: name, expected };
    }
  }

  return { valid: false, source: "none", expected: secrets[0].secret ? `sha256=${createHmac("sha256", secrets[0].secret!).update(rawBody, "utf8").digest("hex")}` : undefined };
}

/**
 * Check if we're in observe mode (log but don't reject)
 */
export function isObserveMode(): boolean {
  return process.env.WEBHOOK_SIGNATURE_MODE === "observe";
}