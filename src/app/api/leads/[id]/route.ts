// src/app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;

    // Get lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get interests with product details
    const { data: interests, error: interestsError } = await supabaseAdmin
      .from("lead_interests")
      .select(`
        *,
        product:products (
          id, name, label, purity, weight_grams, calculated_price,
          making_charges_percent, stone_value, diamond_value, polki_value,
          description, is_combo
        )
      `)
      .eq("lead_id", id)
      .order("shown_at", { ascending: false });

    if (interestsError) throw interestsError;

    // Get conversations
    const { data: conversations, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, platform, human_message, ai_response, status, created_at")
      .eq("sender_id", lead.platform_user_id)
      .eq("platform", "instagram_dm")
      .order("created_at", { ascending: false })
      .limit(50);

    if (convError) throw convError;

    return NextResponse.json({
      lead,
      interests: interests ?? [],
      conversations: conversations ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Lead detail API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ["contact_status", "assigned_to", "notes", "city", "occasion", "budget"];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Lead update error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}