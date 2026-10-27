// src/lib/auth.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export type StaffRole = "admin" | "agent";

export interface StaffUser {
  id: string;
  email: string;
  role: StaffRole;
  displayName: string;
}

/**
 * Verify staff session from cookies (for dashboard pages and API routes)
 * Returns staff user object on success, or NextResponse with 401/403 on failure
 * Uses getUser() for security - validates with Auth server
 */
export async function requireStaff(
  request: NextRequest,
  allowedRoles?: StaffRole[]
): Promise<StaffUser | NextResponse> {
  const supabase = await createSupabaseRouteClient(request);

  // Use getUser() for security - validates with Auth server
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff, error } = await supabase
    .from("staff_profiles")
    .select("role, active, display_name")
    .eq("user_id", user.id)
    .single();

  if (error || !staff || !staff.active) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  return {
    id: user.id,
    email: user.email!,
    role: staff.role,
    displayName: staff.display_name,
  };
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