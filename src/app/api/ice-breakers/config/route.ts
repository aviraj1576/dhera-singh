// src/app/api/ice-breakers/config/route.ts
// The saved ice-breaker wording. Saving does NOT touch Instagram; "Sync" publishes it.
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { parseIceBreakerQuestions } from "@/lib/webhook/ice-breakers";
import { loadIceBreakerQuestions, saveIceBreakerQuestions } from "@/lib/webhook/ice-breakers-store";

export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin", "agent"]);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { questions, customised } = await loadIceBreakerQuestions();
    return NextResponse.json({ success: true, questions, customised });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker config read error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseIceBreakerQuestions((body as { questions?: unknown } | null)?.questions);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await saveIceBreakerQuestions(parsed.questions);
    return NextResponse.json({ success: true, questions: parsed.questions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Ice breaker config save error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
