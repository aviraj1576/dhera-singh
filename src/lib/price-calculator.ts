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
    .maybeSingle();

  // Lock with timeout — if lock is older than 30s, it's stale (crashed function)
  if (existingLock?.value && existingLock.value.startsWith("locked:")) {
    const lockTime = parseInt(existingLock.value.split(":")[1], 10);
    if (!isNaN(lockTime) && Date.now() - lockTime < 30_000) {
      console.log("⏭️ Price recalculation already running — skipping");
      return { updated: 0, skipped: 0, errors: 0 };
    }
    console.log("⚠️ Stale lock detected (>30s) — overriding");
  }

  // Set lock with timestamp for timeout detection
  await supabaseAdmin
    .from("admin_config")
    .upsert({ key: lockKey, value: `locked:${Date.now()}` });

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

    // Execute parallel updates
    const promises = updates.map((u) =>
      supabaseAdmin
        .from("products")
        .update({ calculated_price: u.calculated_price, updated_at: u.updated_at })
        .eq("id", u.id)
    );

    const results = await Promise.all(promises);
    results.forEach((res) => {
      if (res.error) {
        console.error("Single product price update error:", res.error.message);
        errors++;
      } else {
        updated++;
      }
    });

    console.log(`✅ Price recalc: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    return { updated, skipped, errors };

  } finally {
    // Always release the lock
    await supabaseAdmin
      .from("admin_config")
      .upsert({ key: lockKey, value: "unlocked" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE PRODUCT PRICE — used after adding/updating a single product
// More reliable than global recalc since it doesn't use locks
// ─────────────────────────────────────────────────────────────────────────────
export async function calculateSingleProductPrice(productId: string): Promise<number | null> {
  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, purity, weight_grams, making_charges_percent, stone_value, diamond_value, polki_value, fixed_price")
      .eq("product_id", productId)
      .eq("is_available", true)
      .maybeSingle();

    if (productError || !product) {
      console.error("calculateSingleProductPrice: product not found:", productError?.message);
      return null;
    }

    // If fixed_price is set, no calculation needed
    if (product.fixed_price != null && Number(product.fixed_price) > 0) {
      return Number(product.fixed_price);
    }

    const purity = product.purity;
    const weight = Number(product.weight_grams) || 0;
    if (!purity || weight === 0) {
      console.log(`⏭️ Cannot calculate price for ${productId}: missing purity or weight`);
      return null;
    }

    // Fetch the rate for this purity
    const { data: metalPrice } = await supabaseAdmin
      .from("metal_prices")
      .select("price_per_gram")
      .eq("karat_label", purity)
      .maybeSingle();

    const ratePerGram = Number(metalPrice?.price_per_gram) || 0;
    if (ratePerGram === 0) {
      console.log(`⏭️ No metal price for ${purity} — cannot calculate`);
      return null;
    }

    const makingPct = Number(product.making_charges_percent) || 0;
    const stoneVal = Number(product.stone_value) || 0;
    const diamondVal = Number(product.diamond_value) || 0;
    const polkiVal = Number(product.polki_value) || 0;

    const base = ratePerGram * weight;
    const making = base * (makingPct / 100);
    const calculatedPrice = Math.round(base + making + stoneVal + diamondVal + polkiVal);

    // Update the product with the calculated price
    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({ calculated_price: calculatedPrice, updated_at: new Date().toISOString() })
      .eq("id", product.id);

    if (updateError) {
      console.error("calculateSingleProductPrice update error:", updateError.message);
      return null;
    }

    console.log(`✅ Price calculated for ${productId}: ₹${calculatedPrice.toLocaleString("en-IN")}`);
    return calculatedPrice;
  } catch (e) {
    console.error("calculateSingleProductPrice exception:", e);
    return null;
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