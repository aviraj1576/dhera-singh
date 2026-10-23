// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifyMetaSignature, isObserveMode } from "@/lib/webhook/signature";
import { normaliseEntry, NormalisedEvent, shouldIgnoreEvent } from "@/lib/webhook/event-normaliser";
import { checkAndMarkProcessed, cleanupOldProcessedEvents, checkRateLimit } from "@/lib/webhook/dedupe";
import { processNormalisedEvent } from "@/lib/webhook/bot-logic";

// Rate limit constants
const COMMENT_RATE_LIMIT = 8;
const DM_RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const validTokens = [
      process.env.INSTAGRAM_VERIFY_TOKEN,
      process.env.WHATSAPP_VERIFY_TOKEN,
    ].filter(Boolean);

    // Constant-time comparison
    const match = validTokens.some((t) => {
      const expected = Buffer.from(t!);
      const actual = Buffer.from(token);
      return expected.length === actual.length && expected.equals(actual);
    });

    if (match) {
      console.log("✅ Webhook verified");
      return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // 1. Signature verification
  const sigResult = verifyMetaSignature(signature, rawBody);
  
  // Log which secret matched (for debugging)
  console.log(`🔐 Signature: ${sigResult.valid ? "valid" : "INVALID"} (source: ${sigResult.source})`);

  const observeMode = isObserveMode();
  if (!sigResult.valid && !observeMode) {
    console.error("❌ Invalid signature — rejecting");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!sigResult.valid && observeMode) {
    console.warn("⚠️ Observe mode: processing despite invalid signature");
  }

  // 2. Parse JSON
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: "ok" });
  }

  // 3. Opportunistic cleanup (2% chance)
  if (Math.random() < 0.02) {
    after(() => cleanupOldProcessedEvents());
  }

  // 4. Respond 200 immediately, process in background
  const response = NextResponse.json({ status: "ok" });

  after(async () => {
    try {
      await processWebhookBody(body);
    } catch (err) {
      console.error("❌ Webhook background processing error:", err);
    }
  });

  return response;
}

async function processWebhookBody(body: Record<string, unknown>): Promise<void> {
  if (!body || typeof body !== "object") return;

  // Handle Instagram events
  if (body.object === "instagram") {
    const entries = (body.entry as Record<string, unknown>[]) ?? [];
    
    for (const entry of entries) {
      // Normalise all events in this entry
      const events = normaliseEntry(entry);
      
      // Process each event with concurrency control
      const concurrencyLimit = 5;
      for (let i = 0; i < events.length; i += concurrencyLimit) {
        const batch = events.slice(i, i + concurrencyLimit);
        await Promise.allSettled(batch.map((event) => processNormalisedEvent(event)));
      }
    }
  }
  // Handle WhatsApp events (placeholder)
  else if (body.object === "whatsapp_business_account") {
    console.log("📱 WhatsApp event received (not implemented)");
  }
}