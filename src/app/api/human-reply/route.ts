// src/app/api/human-reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { conversation_id, reply_text } = await request.json();

    if (!conversation_id?.trim() || !reply_text?.trim()) {
      return NextResponse.json(
        { error: "conversation_id and reply_text are required" },
        { status: 400 }
      );
    }

    // Mark conversation as human_replied and save the reply text
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update({
        status:      "human_replied",
        human_reply: reply_text.trim(),
        updated_at:  new Date().toISOString(),
      })
      .eq("id", conversation_id)
      .select()
      .single();

    if (error) throw error;

    // NOTE: Sending the reply back to the customer via Instagram/WhatsApp
    // requires knowing the platform and sender_id.
    // Add the send logic here using data.platform and data.sender_id
    // (see Section 11 for the send helper functions).

    return NextResponse.json({
      success: true,
      conversation: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("human-reply error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}