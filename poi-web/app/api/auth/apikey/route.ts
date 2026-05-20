import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors";
import { createApiKeySchema } from "@/lib/validators";
import { requireAuth, hashApiKey } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const rawKey = randomBytes(32).toString("base64url");
  const keyHash = hashApiKey(rawKey);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId: auth.user.userId,
      keyHash,
      name: parsed.data.name,
    })
    .returning();

  return successResponse({
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey,
    createdAt: apiKey.createdAt,
  });
}

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, auth.user.userId));

  return successResponse(keys);
}
