// src/lib/auth-custom.ts
import { supabaseAdmin } from "@/lib/supabase";
import { SignJWT, jwtVerify } from "jose";
import * as bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getClientIp,
  isLoginBlocked,
  recordFailedLogin,
  clearFailedLogins,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/login-rate-limit";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-secret-change-in-production-min-32-chars"
);

export const SESSION_COOKIE_NAME = "staff_session";
const SESSION_DURATION_DAYS = 30;
const BCRYPT_COST = 10;

// staff_profiles columns (see src/sql/auth-schema.sql). The primary key is
// `user_id` — there is NO `id` and NO `email` column. `username` holds the
// login email, stored lowercase.
const PROFILE_COLUMNS = "user_id, username, role, display_name, active";

export interface StaffUser {
  id: string;         // staff_profiles.user_id
  email: string;      // same as username (the login email)
  role: "admin" | "agent";
  displayName: string;
  username: string;
}

interface StaffProfileRow {
  user_id: string;
  username: string;
  role: "admin" | "agent";
  display_name: string;
  active: boolean;
}

function toStaffUser(row: StaffProfileRow): StaffUser {
  return {
    id: row.user_id,
    email: row.username,
    role: row.role,
    displayName: row.display_name,
    username: row.username,
  };
}

export interface SessionPayload {
  sub: string;        // staff_profiles user_id
  username: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Hash password using bcryptjs (matches PostgreSQL bcrypt)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify password against hash using bcryptjs (reliable, no RPC issues)
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (e) {
    console.error("verifyPassword error:", e);
    return false;
  }
}

/**
 * Create session token and store in DB
 */
export async function createSession(
  staff: StaffUser,
  request?: NextRequest
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  
  // Generate JWT token
  const token = await new SignJWT({
    sub: staff.id,
    username: staff.username,
    role: staff.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(SESSION_SECRET);

  // Store hash in DB (not the raw token)
  const tokenHash = await hashToken(token);
  
  const { error } = await supabaseAdmin.from("staff_sessions").insert({
    staff_id: staff.id,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    user_agent: request?.headers.get("user-agent"),
    ip_address: request?.headers.get("x-forwarded-for") ?? request?.headers.get("x-real-ip"),
  });

  // Never hand out a cookie for a session that isn't stored — it would fail
  // verification on the very next request and bounce the user back to /login.
  if (error) {
    throw new Error(`Failed to store session: ${error.message}`);
  }

  return token;
}

/**
 * Hash token for storage (SHA-256)
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify session token from cookie
 */
export async function verifySession(cookieToken?: string): Promise<StaffUser | null> {
  // Callers that already have the request (proxy, route handlers) pass the
  // cookie value in; otherwise fall back to the request-scoped cookie store.
  const token = cookieToken ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    // Verify JWT signature and expiration
    await jwtVerify(token, SESSION_SECRET, { algorithms: ["HS256"] });

    // Verify the token is stored (i.e. not logged out) and not expired
    const tokenHash = await hashToken(token);
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("staff_sessions")
      .select("staff_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error("verifySession: staff_sessions lookup failed:", sessionError.message);
      return null;
    }
    if (!session) return null;

    // Two plain queries instead of a PostgREST embed: the embed returns an
    // object (to-one relation) and depends on an FK being present in the schema.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("staff_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", session.staff_id)
      .maybeSingle<StaffProfileRow>();

    if (profileError) {
      console.error("verifySession: staff_profiles lookup failed:", profileError.message);
      return null;
    }
    if (!profile || !profile.active) return null;

    return toStaffUser(profile);
  } catch {
    // Bad signature, expired JWT, malformed token, etc.
    return null;
  }
}

/**
 * Set session cookie in response
 */
export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });
}

/**
 * Clear session cookie and delete from DB
 */
export async function clearSession(token?: string): Promise<void> {
  if (token) {
    const tokenHash = await hashToken(token);
    await supabaseAdmin.from("staff_sessions").delete().eq("token_hash", tokenHash);
  }
  
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Require authenticated staff (for API routes and server components)
 */
export async function requireAuth(): Promise<StaffUser | NextResponse> {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/**
 * Require specific roles
 */
export async function requireRole(allowedRoles: ("admin" | "agent")[]): Promise<StaffUser | NextResponse> {
  const user = await verifySession();
  if (!user || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  error?: string;
  /** true when the failure was our fault (DB/schema error), not bad credentials */
  serverError?: boolean;
  /** true when the email/IP has too many recent failed attempts */
  rateLimited?: boolean;
}

/**
 * Login with username (email) + password
 */
export async function login(
  username: string,
  password: string,
  request?: NextRequest
): Promise<LoginResult> {
  // Usernames are stored lowercase; phone keyboards love to capitalise the
  // first letter and people paste trailing spaces.
  const identifier = username.trim().toLowerCase().slice(0, 254);
  const ip = getClientIp(request);

  // Checked before touching the password so a locked-out client can't keep
  // guessing (and gets the same answer whether or not the email exists).
  if (await isLoginBlocked(identifier, ip)) {
    return {
      success: false,
      error: `Too many failed attempts. Please try again in ${LOGIN_WINDOW_MINUTES} minutes.`,
      rateLimited: true,
    };
  }

  // maybeSingle(): 0 rows => data null, no error. (.single() raises an error on
  // 0 rows, which made "user not found" indistinguishable from a broken query.)
  const { data: staff, error } = await supabaseAdmin
    .from("staff_profiles")
    .select(`${PROFILE_COLUMNS}, password_hash`)
    .eq("username", identifier)
    .maybeSingle<StaffProfileRow & { password_hash: string | null }>();

  if (error) {
    // A DB/schema problem must not masquerade as "wrong password".
    console.error("login: staff_profiles lookup failed:", error.message);
    return { success: false, error: "Login is temporarily unavailable", serverError: true };
  }

  if (!staff || !staff.active || !staff.password_hash) {
    await recordFailedLogin(identifier, ip);
    return { success: false, error: "Invalid credentials" };
  }

  const valid = await verifyPassword(password, staff.password_hash);
  if (!valid) {
    await recordFailedLogin(identifier, ip);
    return { success: false, error: "Invalid credentials" };
  }

  try {
    const token = await createSession(toStaffUser(staff), request);

    await clearFailedLogins(identifier);

    // Hashes created in SQL with gen_salt('bf') default to cost 6, which is
    // cheap to brute-force offline. Transparently upgrade them now that we
    // have the plaintext. Best-effort.
    if (bcrypt.getRounds(staff.password_hash) < BCRYPT_COST) {
      const { error: rehashError } = await supabaseAdmin
        .from("staff_profiles")
        .update({ password_hash: await hashPassword(password) })
        .eq("user_id", staff.user_id);
      if (rehashError) console.error("login: failed to upgrade password hash:", rehashError.message);
    }

    // Best-effort; a failure here shouldn't block a valid login.
    const { error: lastLoginError } = await supabaseAdmin
      .from("staff_profiles")
      .update({ last_login: new Date().toISOString() })
      .eq("user_id", staff.user_id);
    if (lastLoginError) {
      console.error("login: failed to update last_login:", lastLoginError.message);
    }

    return { success: true, token };
  } catch (e) {
    console.error("login: could not create session:", e instanceof Error ? e.message : e);
    return { success: false, error: "Login is temporarily unavailable", serverError: true };
  }
}