import { errorResponse, successResponse } from "@/lib/errors";
import { radiusQuerySchema } from "@/lib/validators";
import { neon } from "@neondatabase/serverless";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  const parsed = radiusQuerySchema.safeParse(query);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { lng, lat, radius } = parsed.data;

  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT
      id, name, province, address, category, batch, age,
      heritage_code, class_code, image_url, website, remark,
      created_at, updated_at,
      ST_X(location) as lng, ST_Y(location) as lat,
      ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::int as distance_meters
    FROM pois
    WHERE ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radius}
    )
    ORDER BY distance_meters ASC
  `;

  return successResponse(rows, { total: rows.length });
}
