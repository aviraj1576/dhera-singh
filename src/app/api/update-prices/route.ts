// src/app/api/update-prices/route.ts
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