// src/app/api/human-reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const { conversation_id, reply_text } = await request.json();

        if (!conversation_id?.trim()) {
            return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
        }
        // Fix #29: reject empty replies
        if (!reply_text?.trim()) {
            return NextResponse.json({ error: "reply_text cannot be empty" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .update({
                status: "human_replied",
                human_reply: reply_text.trim(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", conversation_id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, conversation: data });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("human-reply error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}