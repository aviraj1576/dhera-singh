// ============================================================
// src/lib/auth.ts
// Simple API key authentication for all admin routes
// Fix #23-27: every admin route must use this
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export function requireAdminKey(request: NextRequest): NextResponse | null {
    const adminKey = process.env.ADMIN_SECRET_KEY;
    if (!adminKey) {
        console.error("❌ ADMIN_SECRET_KEY env var not set");
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const provided =
        request.headers.get("x-admin-key") ||
        request.nextUrl.searchParams.get("admin_key");

    if (!provided || provided !== adminKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null; // null = authenticated, proceed
}


// ============================================================
// src/app/api/update-prices/route.ts
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recalculateAllProductPrices } from "@/lib/price-calculator";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { prices } = body as { prices: Record<string, number> };

        if (!prices || typeof prices !== "object" || Object.keys(prices).length === 0) {
            return NextResponse.json(
                { error: "Request body must include a non-empty 'prices' object" },
                { status: 400 }
            );
        }

        const validKarats = ["24K", "22K", "18K", "16K", "14K", "Silver"];
        const updatePromises = Object.entries(prices)
            .filter(([karat, price]) =>
                validKarats.includes(karat) &&
                typeof price === "number" &&
                price >= 0 &&
                price < 1_000_000 // sanity cap
            )
            .map(([karat, price]) =>
                supabaseAdmin
                    .from("metal_prices")
                    .update({ price_per_gram: price, updated_at: new Date().toISOString() })
                    .eq("karat_label", karat)
            );

        await Promise.all(updatePromises);

        const result = await recalculateAllProductPrices();

        return NextResponse.json({
            success: true,
            message: `${result.updated} products updated, ${result.skipped} skipped, ${result.errors} errors`,
            updated_at: new Date().toISOString(),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("update-prices error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


// ============================================================
// src/app/api/add-product/route.ts
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recalculateAllProductPrices } from "@/lib/price-calculator";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const {
            product_id, name, instagram_link,
            weight_grams, purity, making_charges_percent,
            stone_value, diamond_value, polki_value,
            fixed_price, description,
        } = body;

        if (!product_id?.trim() || !name?.trim()) {
            return NextResponse.json(
                { error: "product_id and name are required" },
                { status: 400 }
            );
        }

        // Normalise instagram link to canonical format
        let cleanLink: string | null = null;
        if (instagram_link?.trim()) {
            const { extractLinkFromMessage } = await import("@/lib/anthropic");
            cleanLink = extractLinkFromMessage(instagram_link.trim()) ?? instagram_link.trim();
        }

        const record = {
            product_id: product_id.trim(),
            name: name.trim(),
            instagram_link: cleanLink,
            weight_grams: weight_grams ? Number(weight_grams) : null,
            purity: purity?.trim() ?? null,
            making_charges_percent: making_charges_percent ? Number(making_charges_percent) : 0,
            stone_value: stone_value ? Number(stone_value) : 0,
            diamond_value: diamond_value ? Number(diamond_value) : 0,
            polki_value: polki_value ? Number(polki_value) : 0,
            fixed_price: fixed_price ? Number(fixed_price) : null,
            description: description?.trim() ?? null,
            is_available: true,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabaseAdmin
            .from("products")
            .upsert(record, { onConflict: "product_id" })
            .select()
            .single();

        if (error) throw error;

        if (!fixed_price) {
            await recalculateAllProductPrices();
        }

        return NextResponse.json({ success: true, product: data });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("add-product error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


// ============================================================
// src/app/api/add-context/route.ts
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const { keywords, explanation } = await request.json();

        if (!keywords?.trim() || !explanation?.trim()) {
            return NextResponse.json(
                { error: "Both keywords and explanation are required" },
                { status: 400 }
            );
        }

        // Limit context entry size
        const key = `context_${Date.now()}`;
        const value = `Keywords: ${keywords.trim().slice(0, 200)}\nContext: ${explanation.trim().slice(0, 1000)}`;

        const { error } = await supabaseAdmin
            .from("company_info")
            .insert({ info_key: key, info_value: value });

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Context added to AI knowledge base" });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


// ============================================================
// src/app/api/dashboard-stats/route.ts
// ============================================================

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


// ============================================================
// src/app/api/human-reply/route.ts
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const { conversation_id, reply_text } = await request.json();

        if (!conversation_id?.trim()) {
            return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
        }
        // Fix #29: reject empty replies
        if (!reply_text?.trim()) {
            return NextResponse.json({ error: "reply_text cannot be empty" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .update({
                status: "human_replied",
                human_reply: reply_text.trim(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", conversation_id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, conversation: data });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("human-reply error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}


// ============================================================
// src/app/api/cleanup/route.ts
// NEW: Manual cleanup endpoint for processed_events table
// Call this via a Vercel cron job
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { error: eventsError } = await supabaseAdmin
            .from("processed_events")
            .delete()
            .lt("created_at", cutoff);

        const windowCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { error: rateLimitError } = await supabaseAdmin
            .from("sender_rate_limits")
            .delete()
            .lt("updated_at", windowCutoff);

        if (eventsError) throw eventsError;
        if (rateLimitError) throw rateLimitError;

        return NextResponse.json({ success: true, message: "Cleanup complete" });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}