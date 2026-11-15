// src/lib/login-rate-limit.ts
//
// Brute-force protection for /api/auth/login, backed by the `login_attempts`
// table (see src/sql/login-attempts.sql). Only FAILED attempts are stored.
//
//   - 5 failures for one email  within 15 min  -> that email is locked
//   - 20 failures from one IP   within 15 min  -> that IP is locked
//
// Fails OPEN: if the table is missing or the DB errors, logins are still
// allowed (and an error is logged) so a misconfiguration can't lock every
// admin out of the dashboard. Run the SQL file to actually enable protection.
import { supabaseAdmin } from "@/lib/supabase";

export const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 20;
const KEEP_ROWS_HOURS = 24;

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export function getClientIp(request?: Request): string | null {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request?.headers.get("x-real-ip") || null;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

async function countFailures(
  column: "identifier" | "ip",
  value: string
): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("attempted_at", new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString());

  if (error) {
    console.error(
      `⚠️ login rate limiting is NOT active (${error.message}). ` +
        "Run src/sql/login-attempts.sql in the Supabase SQL editor."
    );
    return null;
  }
  return count ?? 0;
}

/** True if this email or IP has too many recent failed attempts. */
export async function isLoginBlocked(identifier: string, ip: string | null): Promise<boolean> {
  const [byAccount, byIp] = await Promise.all([
    countFailures("identifier", identifier),
    ip ? countFailures("ip", ip) : Promise.resolve(null),
  ]);

  return (
    (byAccount !== null && byAccount >= MAX_FAILURES_PER_ACCOUNT) ||
    (byIp !== null && byIp >= MAX_FAILURES_PER_IP)
  );
}

export async function recordFailedLogin(identifier: string, ip: string | null): Promise<void> {
  const { error } = await supabaseAdmin.from("login_attempts").insert({ identifier, ip });
  if (error) {
    console.error("recordFailedLogin failed:", error.message);
    return;
  }
  // Keep the table small; only the last 15 minutes ever matter.
  await supabaseAdmin.from("login_attempts").delete().lt("attempted_at", hoursAgo(KEEP_ROWS_HOURS));
}

/** A successful login resets that email's counter. */
export async function clearFailedLogins(identifier: string): Promise<void> {
  const { error } = await supabaseAdmin.from("login_attempts").delete().eq("identifier", identifier);
  if (error) console.error("clearFailedLogins failed:", error.message);
}
