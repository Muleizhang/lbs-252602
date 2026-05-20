import { db } from "@/lib/db";
import { successResponse } from "@/lib/errors";

export async function GET() {
  const start = Date.now();
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`SELECT 1`;
    return successResponse({
      status: "ok",
      database: "connected",
      latency_ms: Date.now() - start,
    });
  } catch {
    return successResponse({
      status: "degraded",
      database: "disconnected",
      latency_ms: Date.now() - start,
    });
  }
}
