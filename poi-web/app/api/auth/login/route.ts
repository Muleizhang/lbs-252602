import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors";
import { loginSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { signJWT } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { username, password } = parsed.data;

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (rows.length === 0) {
    return errorResponse("AUTH_005");
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return errorResponse("AUTH_005");
  }

  const token = await signJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const expires = process.env.JWT_EXPIRES_IN || "2h";
  const maxAge = expires.endsWith("h")
    ? parseInt(expires) * 3600
    : parseInt(expires) * 60;

  const response = successResponse({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  response.headers.append(
    "Set-Cookie",
    `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );

  return response;
}
