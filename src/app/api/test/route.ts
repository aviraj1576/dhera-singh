// src/app/api/test/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
    // Check env vars
    const envCheck = {
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ SET" : "❌ MISSING",
        supabase_anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "✅ SET" : "❌ MISSING",
        supabase_service: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ SET" : "❌ MISSING",
        anthropic: process.env.ANTHROPIC_API_KEY ? "✅ SET" : "❌ MISSING",
        ig_verify: process.env.INSTAGRAM_VERIFY_TOKEN ? "✅ SET" : "❌ MISSING",
    };

    // Try a direct Supabase insert
    let dbResult = "";
    try {
        const { data, error } = await supabaseAdmin
            .from("conversations")
            .insert({
                platform: "test",
                sender_id: "test_diagnostic",
                human_message: "diagnostic test insert",
                ai_response: "test response",
                status: "ai_answered",
            })
            .select()
            .single();

        if (error) {
            dbResult = "❌ INSERT FAILED: " + JSON.stringify(error);
        } else {
            dbResult = "✅ INSERT SUCCESS — id: " + data.id;
        }
    } catch (e: unknown) {
        dbResult = "❌ EXCEPTION: " + (e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({ envCheck, dbResult });
}