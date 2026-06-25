// src/app/api/dashboard-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_request: NextRequest) {
  try {
    // ── Total AI-answered conversations ──────────────────────────────────────
    const { count: aiAnswered } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "ai_answered");

    // ── Conversations awaiting human reply ───────────────────────────────────
    const { count: humanPending } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "human_needed");

    // ── Average latency (last 200 conversations) ─────────────────────────────
    const { data: latencyRows } = await supabaseAdmin
      .from("conversations")
      .select("response_latency_ms")
      .not("response_latency_ms", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const avgLatencyMs =
      latencyRows && latencyRows.length > 0
        ? latencyRows.reduce((sum, r) => sum + (r.response_latency_ms ?? 0), 0) /
          latencyRows.length
        : 0;

    const avgLatency =
      avgLatencyMs > 0 ? `${(avgLatencyMs / 1000).toFixed(1)}s` : "—";

    // ── Recent conversations (last 20) ───────────────────────────────────────
    const { data: recent } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    // ── Query volume — last 7 days by day of week ────────────────────────────
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: volumeRaw } = await supabaseAdmin
      .from("conversations")
      .select("created_at")
      .gte("created_at", sevenDaysAgo);

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayMap: Record<string, number> = {};
    (volumeRaw ?? []).forEach((row) => {
      const day = dayNames[new Date(row.created_at).getDay()];
      dayMap[day] = (dayMap[day] ?? 0) + 1;
    });

    // Return all 7 days in order, starting from today going back
    const today = new Date().getDay();
    const orderedDays = Array.from({ length: 7 }, (_, i) => {
      const dayIndex = (today - 6 + i + 7) % 7;
      return dayNames[dayIndex];
    });

    const volumeData = orderedDays.map((d) => ({
      day: d,
      queries: dayMap[d] ?? 0,
    }));

    // ── Current metal prices ─────────────────────────────────────────────────
    const { data: metalPrices } = await supabaseAdmin
      .from("metal_prices")
      .select("karat_label, price_per_gram, updated_at");

    return NextResponse.json({
      aiAnswered:  aiAnswered  ?? 0,
      humanPending: humanPending ?? 0,
      avgLatency,
      recent:      recent      ?? [],
      volumeData,
      metalPrices: metalPrices ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("dashboard-stats error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}