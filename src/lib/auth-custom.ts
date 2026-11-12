// src/lib/auth-custom.ts
import { supabaseAdmin } from "@/lib/supabase";
import { SignJWT, jwtVerify } from "jose";
import * as bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-secret-change-in-production-min-32-chars"
);

const SESSION_COOKIE_NAME = "staff_session";
const SESSION_DURATION_DAYS = 30;

export interface StaffUser {
  id: string;
  email: string;
  role: "admin" | "agent";
  displayName: string;
  username: string;
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
  return bcrypt.hash(password, 10);
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
  
  await supabaseAdmin.from("staff_sessions").insert({
    staff_id: staff.id,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    user_agent: request?.headers.get("user-agent"),
    ip_address: request?.headers.get("x-forwarded-for") ?? request?.headers.get("x-real-ip"),
  });

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
export async function verifySession(): Promise<StaffUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  
  if (!token) return null;

  try {
    // Verify JWT signature and expiration
    const { payload } = await jwtVerify(token, SESSION_SECRET);
    const staffId = payload.sub as string;

    // Verify token exists in DB and not expired
    const tokenHash = await hashToken(token);
    const { data: sessionData } = await supabaseAdmin
      .from("staff_sessions")
      .select(`
        staff_id, 
        expires_at, 
        staff_profiles!inner(id, username, email, role, display_name, active)
      `)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!sessionData || !sessionData.staff_profiles || sessionData.staff_profiles.length === 0 || !sessionData.staff_profiles[0].active) {
      return null;
    }

    const profile = sessionData.staff_profiles[0];

    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      displayName: profile.display_name,
      username: profile.username,
    };
  } catch {
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

/**
 * Login with username/password
 */
export async function login(
  username: string, 
  password: string,
  request?: NextRequest
): Promise<{ success: boolean; token?: string; error?: string }> {
  // Get staff by username
  const { data: staff, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, username, password_hash, email, role, display_name, active")
    .eq("username", username)
    .single();

  if (error || !staff || !staff.active) {
    return { success: false, error: "Invalid credentials" };
  }

  // Verify password
  const valid = await verifyPassword(password, staff.password_hash);
  if (!valid) {
    return { success: false, error: "Invalid credentials" };
  }

  // Update last login
  await supabaseAdmin
    .from("staff_profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("id", staff.id);

  // Create session
  const staffUser: StaffUser = {
    id: staff.id,
    username: staff.username,
    email: staff.email,
    role: staff.role,
    displayName: staff.display_name,
  };

  const token = await createSession(staffUser, request);
  return { success: true, token };
}