// src/app/api/add-context/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { keywords, explanation } = await request.json();

    if (!keywords?.trim() || !explanation?.trim()) {
      return NextResponse.json(
        { error: "Both 'keywords' and 'explanation' are required" },
        { status: 400 }
      );
    }

    // Store as a timestamped context entry
    const key   = `context_${Date.now()}`;
    const value = `Keywords: ${keywords.trim()}\nContext/Instructions: ${explanation.trim()}`;

    const { error } = await supabaseAdmin
      .from("company_info")
      .insert({ info_key: key, info_value: value });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Context successfully added to AI knowledge base",
      key,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("add-context error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}