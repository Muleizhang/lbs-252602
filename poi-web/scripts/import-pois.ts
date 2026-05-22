import { execSync } from "child_process";
import pg from "pg";

interface PoiRecord {
  name: string;
  province: string;
  address: string;
  category: string;
  batch: string;
  age: string;
  heritage_code: number | null;
  class_code: number | null;
  lng: number;
  lat: number;
  remark: string;
}

function readShapefile(shpPath: string): PoiRecord[] {
  const script = `
import shapefile
import json

sf = shapefile.Reader("${shpPath}")
records = []

for i, (rec, shp) in enumerate(zip(sf.iterRecords(), sf.iterShapes())):
    if shp.points:
        pt = shp.points[0]
        records.append({
            "name": rec.name or "",
            "province": rec.add or "",
            "address": rec.add or "",
            "category": rec.type or "",
            "batch": rec.batch or "",
            "age": rec.age or "",
            "heritage_code": round(rec.code) if rec.code else None,
            "class_code": int(rec.classCode) if rec.classCode and rec.classCode.isdigit() else None,
            "lng": pt[0],
            "lat": pt[1],
            "remark": rec.remark or "",
        })

print(json.dumps(records, ensure_ascii=False))
`;

  const result = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}'`, {
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(result.toString());
}

async function main() {
  const shpPath = process.argv[2] || "../requirements/全国文保单位/shp格式（arcgis、qgis软件）/全国文保单位2017";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  console.log("Reading shapefile...");
  const records = readShapefile(shpPath);
  console.log(`Read ${records.length} records`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const batchSize = 50;
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      for (const r of batch) {
        await pool.query(
          `INSERT INTO pois (name, province, address, category, batch, age, heritage_code, class_code, location, remark)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326), $11)`,
          [r.name, r.province, r.address, r.category, r.batch, r.age, r.heritage_code, r.class_code, r.lng, r.lat, r.remark]
        );
      }

      inserted += batch.length;
      process.stdout.write(`\rInserted ${inserted}/${records.length}`);
    }

    console.log("\nImport complete!");
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
