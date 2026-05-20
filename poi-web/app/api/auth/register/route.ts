import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors";
import { registerSchema } from "@/lib/validators";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { username, password, email, role } = parsed.data;

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length > 0) {
    return errorResponse("AUTH_004");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, email, role: role || "public" })
    .returning();

  return successResponse(
    { id: user.id, username: user.username, role: user.role },
    undefined
  );
}
