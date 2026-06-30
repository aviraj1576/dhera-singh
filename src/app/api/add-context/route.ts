// src/app/api/add-context/route.ts
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