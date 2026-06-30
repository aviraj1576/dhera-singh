// src/lib/auth.ts
// Simple API key authentication for all admin routes
// Fix #23-27: every admin route must use this

import { NextRequest, NextResponse } from "next/server";

export function requireAdminKey(request: NextRequest): NextResponse | null {
    const adminKey = process.env.ADMIN_SECRET_KEY;
    if (!adminKey) {
        console.error("❌ ADMIN_SECRET_KEY env var not set");
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const provided =
        request.headers.get("x-admin-key") ||
        request.nextUrl.searchParams.get("admin_key");

    if (!provided || provided !== adminKey) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null; // null = authenticated, proceed
}