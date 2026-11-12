// src/app/api/auth/logout/route.ts
import { clearSession } from "@/lib/auth-custom";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("staff_session")?.value;
    
    if (token) {
      await clearSession(token);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete("staff_session");
    return response;
  } catch (error) {
    console.error("Logout error:", error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete("staff_session");
    return response;
  }
}