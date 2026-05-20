import { errorResponse, successResponse } from "@/lib/errors";
import { bboxQuerySchema } from "@/lib/validators";
import { neon } from "@neondatabase/serverless";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  const parsed = bboxQuerySchema.safeParse(query);
  if (!parsed.success) {
    return errorResponse("VAL_001", parsed.error.issues.map((i) => i.message).join("; "));
  }

  const { minLng, minLat, maxLng, maxLat } = parsed.data;

  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT
      id, name, province, address, category, batch, age,
      heritage_code, class_code, image_url, website, remark,
      created_at, updated_at,
      ST_X(location) as lng, ST_Y(location) as lat
    FROM pois
    WHERE ST_Within(
      location,
      ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
    )
    ORDER BY id
  `;

  return successResponse(rows, { total: rows.length });
}
