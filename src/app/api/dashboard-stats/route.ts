// src/app/api/dashboard-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const [
            { count: aiAnswered },
            { count: humanPending },
            { data: latencyRows },
            { data: recent },
            { data: volumeRaw },
            { data: metalPrices },
        ] = await Promise.all([
            supabaseAdmin
                .from("conversations")
                .select("*", { count: "exact", head: true })
                .eq("status", "ai_answered"),

            supabaseAdmin
                .from("conversations")
                .select("*", { count: "exact", head: true })
                .eq("status", "human_needed"),

            supabaseAdmin
                .from("conversations")
                .select("response_latency_ms")
                .not("response_latency_ms", "is", null)
                .order("created_at", { ascending: false })
                .limit(100),

            supabaseAdmin
                .from("conversations")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(20),

            supabaseAdmin
                .from("conversations")
                .select("created_at")
                .gte(
                    "created_at",
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                ),

            supabaseAdmin
                .from("metal_prices")
                .select("karat_label, price_per_gram, updated_at"),
        ]);

        const avgLatencyMs =
            latencyRows && latencyRows.length > 0
                ? latencyRows.reduce((s, r) => s + (r.response_latency_ms ?? 0), 0) /
                latencyRows.length
                : 0;

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayMap: Record<string, number> = {};
        (volumeRaw ?? []).forEach((r) => {
            const day = dayNames[new Date(r.created_at).getDay()];
            dayMap[day] = (dayMap[day] ?? 0) + 1;
        });
        const today = new Date().getDay();
        const volumeData = Array.from({ length: 7 }, (_, i) => {
            const idx = (today - 6 + i + 7) % 7;
            const d = dayNames[idx];
            return { day: d, queries: dayMap[d] ?? 0 };
        });

        return NextResponse.json({
            aiAnswered: aiAnswered ?? 0,
            humanPending: humanPending ?? 0,
            avgLatency: avgLatencyMs > 0 ? `${(avgLatencyMs / 1000).toFixed(1)}s` : "N/A",
            recent: recent ?? [],
            volumeData,
            metalPrices: metalPrices ?? [],
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("dashboard-stats error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}