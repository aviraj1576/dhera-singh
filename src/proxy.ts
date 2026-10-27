// src/proxy.ts
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

async function verifyUserWithRetry(supabase: any, maxRetries = 3): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) return user;
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 100 * (i + 1)));
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = [
    "/api/webhook",
    "/login",
    "/privacy",
    "/terms",
    "/data-deletion",
    "/auth/callback",
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
  ];

  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (isPublic) {
    return NextResponse.next();
  }

  if (pathname.includes(".") && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Create Supabase client with request cookies
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const supabase = await createSupabaseRouteClient(cookieHeader);
  
  // Retry logic for cookie propagation
  const user = await verifyUserWithRetry(supabase);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  // Verify staff profile exists and is active
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role, active")
    .eq("user_id", user.id)
    .single();

  if (!staff || !staff.active) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/webhook|login|privacy|terms|data-deletion|auth/callback).*)",
  ],
};