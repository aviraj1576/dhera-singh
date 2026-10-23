// src/app/api/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  // Check Meta token validity
  let tokenStatus = "unknown";
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.INSTAGRAM_PAGE_ID}?fields=id&access_token=${process.env.INSTAGRAM_ACCESS_TOKEN}`
    );
    tokenStatus = res.ok ? "valid" : "invalid";
  } catch {
    tokenStatus = "error";
  }

  // Update admin_config
  await supabaseAdmin
    .from("admin_config")
    .upsert({ key: "token_status", value: `"${tokenStatus}"`, updated_at: new Date().toISOString() });

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: "connected",
      meta_token: tokenStatus,
      anthropic: "configured",
    },
  });
}