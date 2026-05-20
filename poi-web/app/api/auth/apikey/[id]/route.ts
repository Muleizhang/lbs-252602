import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const idNum = parseInt(id);
  if (isNaN(idNum)) {
    return errorResponse("VAL_001", "Invalid API key ID");
  }

  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, idNum), eq(apiKeys.userId, auth.user.userId)))
    .returning();

  if (deleted.length === 0) {
    return errorResponse("AUTH_002", "API Key not found");
  }

  return successResponse({ deleted: true });
}
