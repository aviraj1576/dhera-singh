// src/lib/auth.ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession, type StaffUser } from "@/lib/auth-custom";

export type StaffRole = "admin" | "agent";
export type { StaffUser };

/**
 * Verify the staff session cookie (set by /api/auth/login) for API routes.
 * Returns the staff user on success, or a NextResponse with 401/403 on failure.
 *
 * NOTE: this used to validate Supabase Auth cookies. Login now issues our own
 * `staff_session` cookie, so it must be verified the same way here.
 */
export async function requireStaff(
  request: NextRequest,
  allowedRoles?: StaffRole[]
): Promise<StaffUser | NextResponse> {
  const user = await verifySession(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  return user;
}

/**
 * Legacy admin key check — kept ONLY for scheduled cron jobs
 * Uses constant-time comparison, header only (no query param)
 */
export function requireAdminKey(request: NextRequest): NextResponse | null {
  const adminKey = process.env.ADMIN_SECRET_KEY;
  if (!adminKey) {
    console.error("❌ ADMIN_SECRET_KEY env var not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const provided = request.headers.get("x-admin-key");

  if (!provided) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Constant-time comparison
  const expected = Buffer.from(adminKey);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !expected.equals(actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // authenticated
}

/**
 * Check if request is from a valid cron job (Vercel Cron or admin key)
 */
export async function requireCronOrAdmin(request: NextRequest): Promise<NextResponse | void> {
  // Check Vercel Cron header first
  const cronSecret = request.headers.get("x-vercel-cron-secret");
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    return;
  }

  // Fall back to admin key
  const adminResponse = requireAdminKey(request);
  if (adminResponse) {
    return adminResponse;
  }
}
