// src/app/api/ice-breakers/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";
import { buildIceBreakersBody, getIceBreakersHash } from "@/lib/webhook/ice-breakers";
import { loadIceBreakerQuestions, ICE_BREAKERS_HASH_KEY } from "@/lib/webhook/ice-breakers-store";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

export async function POST(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Publish the saved wording (falls back to the defaults if nothing was edited).
    const { questions } = await loadIceBreakerQuestions();
    const body = buildIceBreakersBody(questions);

    // Send to Meta
    const syncRes = await fetch(`${GRAPH_BASE}/me/messenger_profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const syncData = await syncRes.json();

    if (!syncRes.ok) {
      console.error("Ice breaker sync failed:", syncData);
      return NextResponse.json(
        { error: syncData.error?.message ?? "Sync failed", details: syncData },
        { status: 500 }
      );
    }

    // Verify by reading back
    const readRes = await fetch(`${GRAPH_BASE}/me/messenger_profile?fields=ice_breakers&platform=instagram`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    const readData = await readRes.json();

    if (!readRes.ok) {
      console.warn("Ice breaker read-back failed:", readData);
      // Sync succeeded but read-back failed - still update hash
    }

    // Store hash in admin_config
    const hash = getIceBreakersHash(questions);
    // admin_config has only key / value / created_at (no updated_at column).
    const { error: hashError } = await supabaseAdmin
      .from("admin_config")
      .upsert({ key: ICE_BREAKERS_HASH_KEY, value: `"${hash}"` });
    if (hashError) console.warn("Could not store ice_breakers_hash:", hashError.message);

    return NextResponse.json({
      success: true,
      message: "Ice breakers synced successfully",
      synced: syncData,
      current: readData,
      // What Instagram reports after the sync (null if the read-back failed).
      live: readRes.ok ? (readData.data?.[0]?.ice_breakers ?? []) : null,
      hash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}