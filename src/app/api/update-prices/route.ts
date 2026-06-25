// src/app/api/update-prices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recalculateAllProductPrices } from "@/lib/price-calculator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prices } = body as {
      prices: Record<string, number>; // e.g. { '22K': 5800, 'Silver': 92 }
    };

    if (!prices || typeof prices !== "object") {
      return NextResponse.json(
        { error: "Request body must include a 'prices' object" },
        { status: 400 }
      );
    }

    // Update each provided karat price
    const updatePromises = Object.entries(prices).map(
      async ([karatLabel, pricePerGram]) => {
        if (typeof pricePerGram !== "number" || pricePerGram < 0) return;
        const { error } = await supabaseAdmin
          .from("metal_prices")
          .update({
            price_per_gram: pricePerGram,
            updated_at: new Date().toISOString(),
          })
          .eq("karat_label", karatLabel);

        if (error) {
          console.error(`Failed to update ${karatLabel}:`, error.message);
        }
      }
    );

    await Promise.all(updatePromises);

    // Recalculate all product prices immediately
    const result = await recalculateAllProductPrices();

    return NextResponse.json({
      success: true,
      message: `Metal prices updated. ${result.updated} products recalculated, ${result.skipped} skipped.`,
      updated_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("update-prices error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}