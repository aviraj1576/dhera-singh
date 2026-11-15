// src/app/api/staff/route.ts
//
// Admin-only staff management.
//   GET  -> list staff (never returns password hashes)
//   POST -> add a staff member who can immediately log in at /login
//
// Why two steps in POST: staff_profiles.user_id has a FOREIGN KEY to Supabase's
// auth.users(id), so a Supabase Auth user must exist first. That Auth user is
// created with a random throw-away password — login uses
// staff_profiles.password_hash only, so the real password is stored just once.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireStaff } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-custom";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt silently ignores anything past 72 bytes
const PUBLIC_COLUMNS = "user_id, username, display_name, role, active, last_login, created_at";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("GET /api/staff failed:", error.message);
    return fail("Could not load staff", 500);
  }
  return NextResponse.json({ staff: data });
}

/** Look up an existing Supabase Auth user by email (small user base: scan pages). */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireStaff(request, ["admin"]);
  if (authResult instanceof NextResponse) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body", 400);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = body.role;
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return fail("Enter a valid email address", 400);
  if (!displayName || displayName.length > 80) return fail("Enter a name (up to 80 characters)", 400);
  if (role !== "admin" && role !== "agent") return fail("Role must be admin or agent", 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return fail(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`, 400);
  }

  // ── Already a staff member? ───────────────────────────────────────────────
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("username", email)
    .maybeSingle();
  if (existingError) {
    console.error("POST /api/staff lookup failed:", existingError.message);
    return fail("Could not add staff member", 500);
  }
  if (existing) return fail("A staff member with this email already exists", 409);

  // ── Step 1: the Supabase Auth user (required by the foreign key) ──────────
  let userId: string | undefined;
  let createdAuthUser = false;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"), // unused; see header comment
    email_confirm: true,
  });

  if (!createError && created.user) {
    userId = created.user.id;
    createdAuthUser = true;
  } else if (createError && (createError.code === "email_exists" || /already.*registered/i.test(createError.message))) {
    // An Auth user with this email already exists but has no staff profile
    // (e.g. made by hand in the Supabase dashboard). Adopt it.
    userId = (await findAuthUserIdByEmail(email)) ?? undefined;
    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from("staff_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile) return fail("A staff member with this email already exists", 409);
    }
  }

  if (!userId) {
    console.error("POST /api/staff: could not create Auth user:", createError?.message ?? "unknown");
    return fail("Could not create the account", 500);
  }

  // ── Step 2: the staff profile with the hashed login password ──────────────
  const { data: staff, error: insertError } = await supabaseAdmin
    .from("staff_profiles")
    .insert({
      user_id: userId,
      username: email,
      display_name: displayName,
      role,
      active: true,
      password_hash: await hashPassword(password),
    })
    .select(PUBLIC_COLUMNS)
    .single();

  if (insertError || !staff) {
    console.error("POST /api/staff insert failed:", insertError?.message);

    // Undo the Auth user we just made so a retry doesn't trip over it — but
    // never if a profile now points at it (e.g. a concurrent request won).
    if (createdAuthUser) {
      const { data: profile } = await supabaseAdmin
        .from("staff_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!profile) await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    if (insertError?.code === "23505") return fail("A staff member with this email already exists", 409);
    return fail("Could not add staff member", 500);
  }

  return NextResponse.json({ success: true, staff }, { status: 201 });
}
