import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "nexnotes-local-secret-9c41f2e7a8b3d6510f2e"
);
const COOKIE = "nex_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  const jar = await cookies();
  // Secure cookies require https — the preview URL is https, plain http
  // deployments (localhost / http proxies) must still receive the session.
  let isHttps = true;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "";
    if (proto && !proto.split(",")[0].trim().includes("https")) isHttps = false;
  } catch { /* default to secure */ }
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.uid as string) || null;
  } catch {
    return null;
  }
}

export async function getAuthUser() {
  const uid = await getSessionUserId();
  if (!uid) return null;
  const user = await db.user.findUnique({
    where: { id: uid },
    select: { id: true, email: true, encryptionEnabled: true, createdAt: true, twofaEnabled: true },
  });
  return user;
}
