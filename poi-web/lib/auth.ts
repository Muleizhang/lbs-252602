import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";
import { ERROR_CODES, errorResponse, type ErrorCode } from "./errors";
import { db } from "./db";
import { apiKeys, users } from "./db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
const COOKIE_NAME = "token";

export async function signJWT(payload: { userId: number; username: string; role: string }) {
  const expires = process.env.JWT_EXPIRES_IN || "2h";
  const seconds = expires.endsWith("h")
    ? parseInt(expires) * 3600
    : parseInt(expires) * 60;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: number; username: string; role: string };
  } catch {
    return null;
  }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function getAuthUser(request: Request): Promise<{
  type: "jwt" | "apikey";
  userId: number;
  username: string;
  role: string;
} | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyJWT(token);
    if (payload) {
      return { type: "jwt", ...payload };
    }
  }

  if (authHeader?.startsWith("ApiKey ")) {
    const rawKey = authHeader.slice(7);
    const keyHash = hashApiKey(rawKey);
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT ak.id as key_id, ak.user_id, u.username, u.role
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      WHERE ak.key_hash = ${keyHash}
    `;
    if (rows.length > 0) {
      await sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${rows[0].key_id}`;
      return {
        type: "apikey",
        userId: rows[0].user_id as number,
        username: rows[0].username as string,
        role: rows[0].role as string,
      };
    }
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    const payload = await verifyJWT(cookieToken);
    if (payload) {
      return { type: "jwt", ...payload };
    }
  }

  return null;
}

type AuthOptions = {
  allow?: Array<"jwt" | "apikey">;
  roles?: string[];
};

export async function requireAuth(
  request: Request,
  options?: AuthOptions
): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> }
  | { ok: false; response: Response }
> {
  const user = await getAuthUser(request);
  if (!user) {
    return { ok: false, response: errorResponse("AUTH_001") };
  }

  if (options?.allow && !options.allow.includes(user.type)) {
    return { ok: false, response: errorResponse("AUTH_002") };
  }

  if (options?.roles && !options.roles.includes(user.role)) {
    return { ok: false, response: errorResponse("AUTH_003") };
  }

  return { ok: true, user };
}
