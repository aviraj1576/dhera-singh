// src/app/api/add-product/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { calculateSingleProductPrice } from "@/lib/price-calculator";
import { requireStaff } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

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

    // Normalise purity: trim, validate against metal_prices.karat_label
    const validPurities = ["24K", "22K", "18K", "16K", "14K", "Silver"];
    let normPurity: string | null = null;
    if (purity?.trim()) {
      const trimmed = purity.trim();
      const matched = validPurities.find(p => p.toLowerCase() === trimmed.toLowerCase());
      if (!matched) {
        return NextResponse.json(
          { error: `Invalid purity '${trimmed}'. Must be one of: ${validPurities.join(", ")}` },
          { status: 400 }
        );
      }
      normPurity = matched;
    }

    const record = {
      product_id: product_id.trim(),
      name: name.trim(),
      instagram_link: cleanLink,
      weight_grams: weight_grams ? Number(weight_grams) : null,
      purity: normPurity,
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

    // Calculate price for this specific product (no lock, no global recalc)
    if (!fixed_price) {
      await calculateSingleProductPrice(data.id);
    }

    return NextResponse.json({ success: true, product: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("add-product error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}