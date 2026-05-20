import { db } from "@/lib/db";
import { pois } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors";
import { updatePoiSchema } from "@/lib/validators";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idNum = parseInt(id);
  if (isNaN(idNum)) return errorResponse("VAL_001", "Invalid ID");

  const [row] = await db.select().from(pois).where(eq(pois.id, idNum)).limit(1);
  if (!row) return errorResponse("POI_001");

  const { location, ...rest } = row as any;
  let lng = 0, lat = 0;
  if (typeof location === "object" && location !== null) {
    lng = location.lng;
    lat = location.lat;
  }
  return successResponse({ ...rest, lng, lat });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const idNum = parseInt(id);
  if (isNaN(idNum)) return errorResponse("VAL_001", "Invalid ID");

  const body = await request.json();
  const parsed = updatePoiSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { lng, lat, ...rest } = parsed.data;
  const updateData: any = { ...rest, updatedAt: new Date() };
  if (lng !== undefined && lat !== undefined) {
    updateData.location = { lng, lat };
  } else if (lng !== undefined || lat !== undefined) {
    return errorResponse("VAL_001", "Both lng and lat must be provided together");
  }

  const [updated] = await db
    .update(pois)
    .set(updateData)
    .where(eq(pois.id, idNum))
    .returning();

  if (!updated) return errorResponse("POI_001");

  const { location, ...restUpdated } = updated as any;
  let finalLng = 0, finalLat = 0;
  if (typeof location === "object" && location !== null) {
    finalLng = location.lng;
    finalLat = location.lat;
  }
  return successResponse({ ...restUpdated, lng: finalLng, lat: finalLat });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const idNum = parseInt(id);
  if (isNaN(idNum)) return errorResponse("VAL_001", "Invalid ID");

  const deleted = await db.delete(pois).where(eq(pois.id, idNum)).returning();
  if (deleted.length === 0) return errorResponse("POI_001");

  return successResponse({ deleted: true });
}
