import { NextResponse } from "next/server";
import { loginRawToken, getCachedRawToken } from "@/lib/vtracking-auth";

export async function GET() {
  let token = getCachedRawToken();
  if (!token) {
    token = await loginRawToken();
  }

  if (!token) {
    return NextResponse.json(
      { error: "Không thể lấy token Vtracking." },
      { status: 401 },
    );
  }

  return NextResponse.json({ token });
}
