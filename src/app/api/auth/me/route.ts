import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { dbErrorResponse } from "@/lib/db-errors";

export async function GET() {
  let user;
  try {
    user = await getAuthUser();
  } catch (e) {
    // the boot probe must distinguish "not signed in" (401) from "the
    // server's database is broken" (503) — the latter needs an operator,
    // not a login form
    console.error("auth/me error", e);
    const dbErr = dbErrorResponse(e);
    if (dbErr) return NextResponse.json(dbErr.body, { status: dbErr.status });
    throw e;
  }
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
