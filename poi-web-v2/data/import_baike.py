import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras


def parse_db_url(db_url):
    parsed = urlparse(db_url)
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "dbname": parsed.path.lstrip("/") or "lbs",
        "user": parsed.username or "lbs",
        "password": parsed.password or "",
    }


def load_env_file(path):
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def main():
    parser = argparse.ArgumentParser(description="Import baike_url into pois table")
    parser.add_argument("--input", default=None, help="Path to baike_results.json (default: ../baike_results.json)")
    parser.add_argument("--db-url", default=None, help="Database URL (default: from DATABASE_URL_SYNC env var)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without executing")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    load_env_file(script_dir.parent / ".env.local")

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

    conn_info = parse_db_url(db_url)
    conn = psycopg2.connect(**conn_info)
    conn.autocommit = False

    cur = conn.cursor()
    cur.execute("SELECT id FROM pois")
    existing = {str(r[0]) for r in cur.fetchall()}
    cur.close()
    print(f"  Existing POIs in DB: {len(existing)}")

    matched = [d for d in data if d["id"] in existing]
    unmatched = len(data) - len(matched)
    print(f"  Matched: {len(matched)}, Unmatched (not in DB): {unmatched}")

    if not matched:
        print("No entries to update. Exiting.")
        conn.close()
        return

    batch_size = 500
    total_updated = 0
    cur = conn.cursor()

    for i in range(0, len(matched), batch_size):
        batch = matched[i : i + batch_size]
        values_list = []
        params = []
        for d in batch:
            values_list.append("(%s::uuid, %s)")
            params.extend([d["id"], d["baike_url"]])

        sql = (
            f"UPDATE pois SET baike_url = v.baike_url "
            f"FROM (VALUES {', '.join(values_list)}) AS v(id, baike_url) "
            f"WHERE pois.id = v.id"
        )
        cur.execute(sql, params)
        total_updated += cur.rowcount
        print(f"  Batch {i // batch_size + 1}: updated {cur.rowcount} rows")

    conn.commit()
    cur.close()
    conn.close()
    print(f"Done. Total updated: {total_updated}")


if __name__ == "__main__":
    main()
