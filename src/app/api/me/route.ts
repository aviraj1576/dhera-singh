// src/app/api/me/route.ts
// Who is signed in? Lets the dashboard show/hide admin-only UI.
// (Real enforcement is always server-side, in each route's requireStaff call.)
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await requireStaff(request);
  if (user instanceof NextResponse) return user;

  return NextResponse.json({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });
}
