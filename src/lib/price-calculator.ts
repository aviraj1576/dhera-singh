// src/lib/price-calculator.ts
import { supabaseAdmin } from "./supabase";

export async function recalculateAllProductPrices(): Promise<{
  updated: number;
  skipped: number;
  errors: number;
}> {
  // Fix #22: Simple lock using DB to prevent concurrent recalculations
  const lockKey = "price_recalc_lock";
  const { data: existingLock } = await supabaseAdmin
    .from("admin_config")
    .select("value")
    .eq("key", lockKey)
    .single()
    .catch(() => ({ data: null }));

  if (existingLock?.value === "locked") {
    console.log("⏭️ Price recalculation already running — skipping");
    return { updated: 0, skipped: 0, errors: 0 };
  }

  // Set lock
  await supabaseAdmin
    .from("admin_config")
    .upsert({ key: lockKey, value: "locked" })
    .catch(() => null);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch metal prices
    const { data: metalPrices, error: metalError } = await supabaseAdmin
      .from("metal_prices")
      .select("karat_label, price_per_gram");

    if (metalError) throw new Error("Failed to fetch metal prices: " + metalError.message);

    const rateMap: Record<string, number> = {};
    (metalPrices ?? []).forEach((row) => {
      rateMap[row.karat_label] = Number(row.price_per_gram) || 0;
    });

    // Fetch all dynamic products
    const { data: products, error: productError } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, purity, weight_grams, making_charges_percent, stone_value, diamond_value, polki_value"
      )
      .is("fixed_price", null)
      .eq("is_available", true);

    if (productError) throw new Error("Failed to fetch products: " + productError.message);
    if (!products?.length) return { updated: 0, skipped: 0, errors: 0 };

    // Fix #21: Batch all updates into a single upsert instead of N sequential calls
    const updates: { id: string; calculated_price: number; updated_at: string }[] = [];
    const now = new Date().toISOString();

    for (const product of products) {
      const ratePerGram = rateMap[product.purity] ?? 0;
      const weight = Number(product.weight_grams) || 0;
      const makingPct = Number(product.making_charges_percent) || 0;
      const stoneVal = Number(product.stone_value) || 0;
      const diamondVal = Number(product.diamond_value) || 0;
      const polkiVal = Number(product.polki_value) || 0;

      if (ratePerGram === 0 || weight === 0) {
        skipped++;
        continue;
      }

      const base = ratePerGram * weight;
      const making = base * (makingPct / 100);
      const finalPrice = Math.round(base + making + stoneVal + diamondVal + polkiVal);

      updates.push({ id: product.id, calculated_price: finalPrice, updated_at: now });
    }

    // Execute in batches of 50 to stay within Supabase limits
    const BATCH = 50;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const { error } = await supabaseAdmin
        .from("products")
        .upsert(batch, { onConflict: "id" });
      if (error) {
        console.error("Batch update error:", error.message);
        errors += batch.length;
      } else {
        updated += batch.length;
      }
    }

    console.log(`✅ Price recalc: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    return { updated, skipped, errors };

  } finally {
    // Always release the lock
    await supabaseAdmin
      .from("admin_config")
      .upsert({ key: lockKey, value: "unlocked" })
      .catch(() => null);
  }
}

export function formatPrice(product: {
  fixed_price: number | null;
  calculated_price: number | null;
}): string {
  const price = product.fixed_price ?? product.calculated_price;
  if (!price || Number(price) <= 0) return "Price on request";
  return `₹${Number(price).toLocaleString("en-IN")}`;
}