// src/app/api/leads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const needsHuman = searchParams.get("needsHuman") === "true";
    const hasPhone = searchParams.get("hasPhone") === "true";
    const status = searchParams.get("status") ?? "";
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const exportCsv = searchParams.get("export") === "true";

    let query = supabaseAdmin
      .from("leads")
      .select(`
        id,
        platform,
        platform_user_id,
        username,
        instagram_name,
        name,
        phone_e164,
        phone_raw,
        capture_stage,
        contact_status,
        needs_human,
        bot_paused_until,
        entry_point,
        source_reel_code,
        first_seen_at,
        last_seen_at,
        last_user_message_at,
        assigned_to,
        notes,
        city,
        occasion,
        budget
      `)
      .order("last_seen_at", { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,username.ilike.%${search}%,instagram_name.ilike.%${search}%,phone_e164.ilike.%${search}%,platform_user_id.ilike.%${search}%`
      );
    }
    if (needsHuman) {
      query = query.eq("needs_human", true);
    }
    if (hasPhone) {
      query = query.not("phone_e164", "is", null);
    }
    if (status) {
      query = query.eq("contact_status", status);
    }
    if (dateFrom) {
      query = query.gte("last_seen_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("last_seen_at", dateTo + "T23:59:59.999Z");
    }

    const { data, error } = await query;

    if (error) throw error;

    const leads = data ?? [];

    if (exportCsv) {
      // Generate CSV with UTF-8 BOM for Excel
      const headers = [
        "ID", "Platform", "Platform User ID", "Username", "Instagram Name",
        "Name", "Phone (E.164)", "Phone (Raw)", "Capture Stage",
        "Contact Status", "Needs Human", "Bot Paused Until",
        "Entry Point", "Source Reel Code", "First Seen", "Last Seen",
        "Last User Message", "Assigned To", "Notes", "City", "Occasion", "Budget"
      ];

      const rows = leads.map((l) => [
        l.id,
        l.platform,
        l.platform_user_id,
        l.username ?? "",
        l.instagram_name ?? "",
        l.name ?? "",
        l.phone_e164 ?? "",
        l.phone_raw ?? "",
        l.capture_stage,
        l.contact_status,
        l.needs_human ? "Yes" : "No",
        l.bot_paused_until ?? "",
        l.entry_point ?? "",
        l.source_reel_code ?? "",
        l.first_seen_at,
        l.last_seen_at,
        l.last_user_message_at ?? "",
        l.assigned_to ?? "",
        l.notes ?? "",
        l.city ?? "",
        l.occasion ?? "",
        l.budget ?? "",
      ]);

      // Escape CSV values
      const escapeCsv = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      };

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\n");

      // Add UTF-8 BOM
      const bom = "\uFEFF";
      return new NextResponse(bom + csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ leads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Leads API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}