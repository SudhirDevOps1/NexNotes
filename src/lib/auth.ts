import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Signing secret. AUTH_SECRET wins when set (multi-instance / multi-replica
 * deployments MUST set it so every node verifies identically). Otherwise a
 * random secret is generated once and persisted next to the database — the
 * old hardcoded fallback string meant ANY deployment without the env var
 * accepted session cookies forged by anyone who read the source.
 */
function loadSecret(): Uint8Array {
  const env = process.env.AUTH_SECRET;
  if (env && env.length >= 32) return new TextEncoder().encode(env);

  const file = path.join(process.cwd(), "db", ".auth-secret");
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing.length >= 32) return new TextEncoder().encode(existing);
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
    return new TextEncoder().encode(generated);
  } catch {
    // read-only filesystem etc. — ephemeral random beats a public constant
    return new TextEncoder().encode(crypto.randomBytes(32).toString("hex"));
  }
}

const SECRET = loadSecret();
const COOKIE = "nex_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/**
 * pwVersion travels inside the JWT and must match user.pwVersion on the
 * account. Rotating a password bumps the version, so stolen or forgotten
 * cookies from BEFORE the rotation stop working everywhere — the device
 * that made the change gets a fresh cookie re-issued in the same response.
 */
export async function createSession(userId: string, pwVersion = 0) {
  const token = await new SignJWT({ uid: userId, pv: pwVersion })
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

async function getSessionAuth(): Promise<{ uid: string; pv: number } | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    const uid = payload.uid as string;
    if (!uid) return null;
    return { uid, pv: typeof payload.pv === "number" ? payload.pv : 0 };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSessionAuth())?.uid ?? null;
}

export async function getAuthUser() {
  const auth = await getSessionAuth();
  if (!auth) return null;
  const user = await db.user.findUnique({
    where: { id: auth.uid },
    select: {
      id: true,
      email: true,
      encryptionEnabled: true,
      createdAt: true,
      twofaEnabled: true,
      pwVersion: true,
    },
  });
  if (!user) return null;
  // pre-pwVersion cookies carry pv=0 — still valid until the first rotation
  if (user.pwVersion !== auth.pv) return null;
  return user;
}
