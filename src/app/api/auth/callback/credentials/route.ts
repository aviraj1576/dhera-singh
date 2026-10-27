// src/app/api/auth/callback/credentials/route.ts
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const supabase = await createSupabaseRouteClient(cookieHeader);

  // Try sign in first
  const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!signInError) {
    return NextResponse.json({ success: true, user: signInData.user });
  }

  // If sign in fails, try sign up (for initial setup)
  const { error: signUpError, data: signUpData } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
    },
  });

  if (signUpError) {
    // Return detailed error for debugging
    return NextResponse.json(
      { error: signUpError.message, hint: "Check Supabase connectivity and project status" },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true, user: signUpData.user, message: "User created" });
}