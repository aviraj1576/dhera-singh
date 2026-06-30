// src/app/api/cleanup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdminKey } from "@/lib/auth";

export async function POST(request: NextRequest) {
    const authError = requireAdminKey(request);
    if (authError) return authError;

    try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { error: eventsError } = await supabaseAdmin
            .from("processed_events")
            .delete()
            .lt("created_at", cutoff);

        const windowCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { error: rateLimitError } = await supabaseAdmin
            .from("sender_rate_limits")
            .delete()
            .lt("updated_at", windowCutoff);

        if (eventsError) throw eventsError;
        if (rateLimitError) throw rateLimitError;

        return NextResponse.json({ success: true, message: "Cleanup complete" });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
