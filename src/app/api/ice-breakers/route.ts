// src/app/api/ice-breakers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { ICE_BREAKERS_HASH_KEY } from "@/lib/webhook/ice-breakers-store";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!;

export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Read from Meta
    const res = await fetch(`${GRAPH_BASE}/me/messenger_profile?fields=ice_breakers&platform=instagram`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Ice breaker read failed:", data);
      return NextResponse.json(
        { error: data.error?.message ?? "Read failed", details: data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ice_breakers: data.data?.[0]?.ice_breakers ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker read error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Delete from Meta
    const res = await fetch(`${GRAPH_BASE}/me/messenger_profile`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ fields: ["ice_breakers"], platform: "instagram" }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Ice breaker delete failed:", data);
      return NextResponse.json(
        { error: data.error?.message ?? "Delete failed", details: data },
        { status: 500 }
      );
    }

    // The "last synced" hash no longer describes anything live. Best effort: the delete already succeeded.
    const { error: hashError } = await supabaseAdmin
      .from("admin_config")
      .delete()
      .eq("key", ICE_BREAKERS_HASH_KEY);
    if (hashError) console.warn("Could not clear ice_breakers_hash:", hashError.message);

    return NextResponse.json({ success: true, message: "Ice breakers deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker delete error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}