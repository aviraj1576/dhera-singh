// src/app/api/ice-breakers/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";
import { buildIceBreakersBody, getIceBreakersHash } from "@/lib/webhook/ice-breakers";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

export async function POST(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = buildIceBreakersBody();

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
    const hash = getIceBreakersHash();
    await supabaseAdmin
      .from("admin_config")
      .upsert({ key: "ice_breakers_hash", value: `"${hash}"`, updated_at: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      message: "Ice breakers synced successfully",
      synced: syncData,
      current: readData,
      hash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}