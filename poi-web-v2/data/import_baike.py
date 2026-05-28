import argparse
import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text


def main():
    parser = argparse.ArgumentParser(description="Import baike_url into pois table")
    parser.add_argument("--input", default=None, help="Path to baike_results.json (default: ../baike_results.json)")
    parser.add_argument("--db-url", default=None, help="Database URL (default: from DATABASE_URL_SYNC env var)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without executing")
    args = parser.parse_args()

    db_url = args.db_url or os.environ.get("DATABASE_URL_SYNC")
    if not db_url:
        print("Error: --db-url or DATABASE_URL_SYNC env var required", file=sys.stderr)
        sys.exit(1)

    input_path = args.input or str(Path(__file__).parent.parent / "baike_results.json")
    print(f"Reading {input_path} ...")
    with open(input_path) as f:
        data = json.load(f)
    print(f"  Entries: {len(data)}")

    if args.dry_run:
        print("DRY RUN - would update the following entries:")
        for d in data:
            print(f"  {d['id']} | {d['name']} | {d['baike_url']}")
        return

    conn_url = db_url.replace("+asyncpg", "")
    engine = create_engine(conn_url)

    with engine.connect() as conn:
        existing = set()
        rows = conn.execute(text("SELECT id FROM pois")).fetchall()
        for r in rows:
            existing.add(str(r[0]))
        print(f"  Existing POIs in DB: {len(existing)}")

    matched = [d for d in data if d["id"] in existing]
    unmatched = len(data) - len(matched)
    print(f"  Matched: {len(matched)}, Unmatched (not in DB): {unmatched}")

    if not matched:
        print("No entries to update. Exiting.")
        return

    batch_size = 500
    total_updated = 0
    conn = engine.connect()

    for i in range(0, len(matched), batch_size):
        batch = matched[i:i + batch_size]
        values_list = []
        params = {}
        for j, d in enumerate(batch):
            id_param = f"id_{j}"
            url_param = f"url_{j}"
            values_list.append(f"(:{id_param}::uuid, :{url_param})")
            params[id_param] = d["id"]
            params[url_param] = d["baike_url"]

        sql = text(
            f"UPDATE pois SET baike_url = v.baike_url "
            f"FROM (VALUES {', '.join(values_list)}) AS v(id, baike_url) "
            f"WHERE pois.id = v.id"
        )
        result = conn.execute(sql, params)
        total_updated += result.rowcount
        print(f"  Batch {i // batch_size + 1}: updated {result.rowcount} rows")

    conn.commit()
    conn.close()
    print(f"Done. Total updated: {total_updated}")


if __name__ == "__main__":
    main()
