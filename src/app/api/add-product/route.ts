// src/app/api/add-product/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recalculateAllProductPrices } from "@/lib/price-calculator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      product_id,
      name,
      instagram_link,
      weight_grams,
      purity,
      making_charges_percent,
      stone_value,
      diamond_value,
      polki_value,
      fixed_price,
      description,
    } = body;

    // Validate required fields
    if (!product_id?.trim() || !name?.trim()) {
      return NextResponse.json(
        { error: "product_id and name are required" },
        { status: 400 }
      );
    }

    // Build the record — use null for optional unset numeric fields
    const record = {
      product_id:             product_id.trim(),
      name:                   name.trim(),
      instagram_link:         instagram_link?.trim() || null,
      weight_grams:           weight_grams       ? Number(weight_grams)           : null,
      purity:                 purity?.trim()     || null,
      making_charges_percent: making_charges_percent ? Number(making_charges_percent) : 0,
      stone_value:            stone_value        ? Number(stone_value)             : 0,
      diamond_value:          diamond_value      ? Number(diamond_value)           : 0,
      polki_value:            polki_value        ? Number(polki_value)             : 0,
      fixed_price:            fixed_price        ? Number(fixed_price)             : null,
      description:            description?.trim() || null,
      is_available:           true,
      updated_at:             new Date().toISOString(),
    };

    // Upsert: update if product_id exists, insert if not
    const { data, error } = await supabaseAdmin
      .from("products")
      .upsert(record, { onConflict: "product_id" })
      .select()
      .single();

    if (error) throw error;

    // If the product is dynamically priced, recalculate now
    if (!fixed_price) {
      await recalculateAllProductPrices();
    }

    return NextResponse.json({
      success: true,
      product: data,
      message: `Product "${name}" saved successfully`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("add-product error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}