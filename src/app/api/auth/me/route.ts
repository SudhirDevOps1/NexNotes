import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { dbErrorResponse } from "@/lib/db-errors";
import { ensureSchemaReady } from "@/lib/db-bootstrap";

export async function GET() {
  let user;
  try {
    user = await getAuthUser();
  } catch (e) {
    // fresh install with an empty database → create the schema and retry once
    // before the boot probe reports a broken server
    try {
      await ensureSchemaReady();
      user = await getAuthUser();
    } catch {
      // the boot probe must distinguish "not signed in" (401) from "the
      // server's database is broken" (503) — the latter needs an operator,
      // not a login form
      console.error("auth/me error", e);
      const dbErr = dbErrorResponse(e);
      if (dbErr) return NextResponse.json(dbErr.body, { status: dbErr.status });
      throw e;
    }
  }
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
