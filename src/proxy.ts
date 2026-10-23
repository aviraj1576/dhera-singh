// src/proxy.ts
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
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

  // Check if path is public
  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // Check for static files (images, fonts, etc.)
  if (pathname.includes(".") && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // For page routes, check authentication
  const supabase = await createSupabaseRouteClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify staff profile exists and is active
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role, active")
    .eq("user_id", session.user.id)
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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - api/ (all API routes handle their own auth)
     * - login, privacy, terms, data-deletion (public pages)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/|login|privacy|terms|data-deletion).*)",
  ],
};