import { db } from "@/lib/db";
import { pois } from "@/lib/db/schema";
import { errorResponse, paginatedResponse, successResponse } from "@/lib/errors";
import { createPoiSchema, poiListQuerySchema } from "@/lib/validators";
import { requireAuth } from "@/lib/auth";
import { eq, ilike, and, sql, count } from "drizzle-orm";

export async function POST(request: Request) {
  const auth = await requireAuth(request, { roles: ["admin"] });
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = createPoiSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { lng, lat, ...rest } = parsed.data;

  const [poi] = await db
    .insert(pois)
    .values({
      ...rest,
      location: { lng, lat },
    } as any)
    .returning();

  return successResponse(poi);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("all") === "true") {
    const rows = await db.select().from(pois).orderBy(pois.id);
    const formatted = rows.map(formatPoiRow);
    return successResponse(formatted, { total: formatted.length });
  }

  const query = Object.fromEntries(url.searchParams);
  const parsed = poiListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { page, pageSize, name, province, category, batch, hasImage, hasWebsite } = parsed.data;

  const conditions = [];
  if (name) conditions.push(ilike(pois.name, `%${name}%`));
  if (province) conditions.push(ilike(pois.province, `%${province}%`));
  if (category) conditions.push(ilike(pois.category, `%${category}%`));
  if (batch) conditions.push(ilike(pois.batch, `%${batch}%`));
  if (hasImage === true) conditions.push(sql`${pois.imageUrl} IS NOT NULL AND ${pois.imageUrl} != ''`);
  if (hasImage === false) conditions.push(sql`${pois.imageUrl} IS NULL OR ${pois.imageUrl} = ''`);
  if (hasWebsite === true) conditions.push(sql`${pois.website} IS NOT NULL AND ${pois.website} != ''`);
  if (hasWebsite === false) conditions.push(sql`${pois.website} IS NULL OR ${pois.website} = ''`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(pois)
    .where(where);

  const rows = await db
    .select()
    .from(pois)
    .where(where)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .orderBy(pois.id);

  const formatted = rows.map(formatPoiRow);

  return paginatedResponse(formatted, page, pageSize, total);
}

function formatPoiRow(row: any) {
  const { location, ...rest } = row;
  let lng = 0, lat = 0;
  if (typeof location === "object" && location !== null) {
    lng = location.lng;
    lat = location.lat;
  }
  return { ...rest, lng, lat };
}
