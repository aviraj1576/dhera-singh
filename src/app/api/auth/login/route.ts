// src/app/api/auth/login/route.ts
import { login } from "@/lib/auth-custom";
import { LOGIN_WINDOW_MINUTES } from "@/lib/login-rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (
      typeof username !== "string" || typeof password !== "string" ||
      !username.trim() || !password
    ) {
      return NextResponse.json(
        { success: false, error: "Username and password required" },
        { status: 400 }
      );
    }

    const result = await login(username, password, request);

    if (!result.success) {
      const status = result.rateLimited ? 429 : result.serverError ? 500 : 401;
      return NextResponse.json(
        { success: false, error: result.error },
        {
          status,
          headers: result.rateLimited ? { "Retry-After": String(LOGIN_WINDOW_MINUTES * 60) } : undefined,
        }
      );
    }

    const response = NextResponse.json({ success: true });
    
    // Set session cookie
    if (result.token) {
      response.cookies.set("staff_session", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}