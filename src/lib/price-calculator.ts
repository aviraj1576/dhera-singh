// src/lib/price-calculator.ts
import { supabaseAdmin } from "./supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Price Formula:
//   base_price    = metal_price_per_gram × weight_grams
//   making_amount = base_price × (making_charges_percent / 100)
//   final_price   = base_price + making_amount + stone_value + diamond_value + polki_value
//
// For fixed-price items (fixed_price column is NOT null):
//   Skip recalculation. Use fixed_price as-is.
// ─────────────────────────────────────────────────────────────────────────────

export async function recalculateAllProductPrices(): Promise<{
  updated: number;
  skipped: number;
}> {
  // Step 1: Fetch current metal rates
  const { data: metalPrices, error: metalError } = await supabaseAdmin
    .from("metal_prices")
    .select("karat_label, price_per_gram");

  if (metalError) {
    throw new Error(`Failed to fetch metal prices: ${metalError.message}`);
  }

  // Build lookup map: { '22K': 5800, 'Silver': 92, ... }
  const rateMap: Record<string, number> = {};
  metalPrices?.forEach((row) => {
    rateMap[row.karat_label] = Number(row.price_per_gram);
  });

  // Step 2: Fetch all dynamic-priced products (fixed_price IS NULL)
  const { data: products, error: productError } = await supabaseAdmin
    .from("products")
    .select(
      "id, name, purity, weight_grams, making_charges_percent, stone_value, diamond_value, polki_value"
    )
    .is("fixed_price", null)
    .eq("is_available", true);

  if (productError) {
    throw new Error(`Failed to fetch products: ${productError.message}`);
  }

  if (!products || products.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  let updated = 0;
  let skipped = 0;

  // Step 3: Calculate and update each product
  for (const product of products) {
    const ratePerGram = rateMap[product.purity] ?? 0;
    const weight      = Number(product.weight_grams) || 0;
    const makingPct   = Number(product.making_charges_percent) || 0;
    const stoneVal    = Number(product.stone_value) || 0;
    const diamondVal  = Number(product.diamond_value) || 0;
    const polkiVal    = Number(product.polki_value) || 0;

    if (ratePerGram === 0 || weight === 0) {
      // Cannot compute meaningful price — skip
      skipped++;
      continue;
    }

    const basePrice    = ratePerGram * weight;
    const makingAmount = basePrice * (makingPct / 100);
    const finalPrice   = Math.round(basePrice + makingAmount + stoneVal + diamondVal + polkiVal);

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({
        calculated_price: finalPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id);

    if (updateError) {
      console.error(`Failed to update product ${product.id}:`, updateError.message);
      skipped++;
    } else {
      updated++;
    }
  }

  console.log(
    `✅ Price recalculation done: ${updated} updated, ${skipped} skipped`
  );
  return { updated, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get display-ready price string for a product
// ─────────────────────────────────────────────────────────────────────────────
export function formatPrice(product: {
  fixed_price: number | null;
  calculated_price: number | null;
}): string {
  const price = product.fixed_price ?? product.calculated_price;
  if (!price || price === 0) return "Price on request";
  return `₹${Number(price).toLocaleString("en-IN")}`;
}