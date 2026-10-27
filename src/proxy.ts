// src/proxy.ts
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = [
    "/api/webhook",
    "/login",
    "/privacy",
    "/terms",
    "/data-deletion",
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

  // Use getUser() for security - validates with Auth server
  const supabase = await createSupabaseRouteClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
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
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/webhook|login|privacy|terms|data-deletion).*)",
  ],
};