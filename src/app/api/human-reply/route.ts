// src/app/api/human-reply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";
import { sendHumanReply, getMessagingWindowState } from "@/lib/webhook/human-reply";

export async function POST(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  const staffUser = authResult; // StaffUser object from requireStaff

  try {
    const { conversation_id, reply_text } = await request.json();

    if (!conversation_id?.trim()) {
      return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
    }
    if (!reply_text?.trim()) {
      return NextResponse.json({ error: "reply_text cannot be empty" }, { status: 400 });
    }

    // Get conversation to find sender_id
    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("sender_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convError) throw convError;
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const senderId = conversation.sender_id;

    // Check messaging window state
    const windowState = await getMessagingWindowState(senderId);

    if (!windowState.canSend) {
      return NextResponse.json(
        { 
          error: "Messaging window closed (>7 days since last customer message). Cannot send reply.",
          window_state: windowState,
        },
        { status: 400 }
      );
    }

    // Send via Graph API with correct messaging_type
    const result = await sendHumanReply(
      senderId,
      reply_text.trim(),
      staffUser.id,
      staffUser.displayName
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message ?? "Failed to send", window_state: windowState },
        { status: 500 }
      );
    }

    // Return success with window state for UI
    return NextResponse.json({
      success: true,
      message_id: result.messageId,
      window_state: windowState,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("human-reply error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET endpoint to check window state
export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const senderId = searchParams.get("sender_id");

    if (!senderId) {
      return NextResponse.json({ error: "sender_id required" }, { status: 400 });
    }

    const windowState = await getMessagingWindowState(senderId);
    return NextResponse.json({ success: true, window_state: windowState });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}