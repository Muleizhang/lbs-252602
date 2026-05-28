import argparse
import os
import re
import sys

import geopandas as gpd
import pandas as pd
from shapely import wkt
from sqlalchemy import create_engine, text

BATCH_MAP = {
    "第一批": 1,
    "第二批": 2,
    "第三批": 3,
    "第四批": 4,
    "第五批": 5,
    "第六批": 6,
    "第七批": 7,
    "第八批": 8,
}

FIELD_MAP = {
    "code": "code",
    "name": "name",
    "type": "category",
    "age": "era",
    "batch": "batch",
    "add": "address",
}

PROVINCE_PATTERNS = [
    "北京市", "天津市", "上海市", "重庆市",
    "黑龙江省", "吉林省", "辽宁省",
    "内蒙古自治区", "新疆维吾尔自治区", "西藏自治区", "宁夏回族自治区", "广西壮族自治区",
    "河北省", "山西省", "陕西省", "山东省", "河南省",
    "江苏省", "浙江省", "安徽省", "福建省", "江西省", "湖南省", "湖北省", "广东省",
    "海南省", "四川省", "贵州省", "云南省", "青海省", "甘肃省", "台湾省",
    "香港特别行政区", "澳门特别行政区",
]

SHORT_PROVINCE = {p.replace("省", "").replace("市", "").replace("壮族自治区", "").replace("回族自治区", "").replace("维吾尔自治区", "").replace("自治区", "").replace("特别行政区", ""): p for p in PROVINCE_PATTERNS}


def parse_province_city(addr: str):
    if not addr or pd.isna(addr):
        return None, None
    for prov in PROVINCE_PATTERNS:
        if addr.startswith(prov):
            rest = addr[len(prov):]
            return prov, rest if rest else None
    for short, full in SHORT_PROVINCE.items():
        if addr.startswith(short):
            rest = addr[len(short):]
            return full, rest if rest else None
    return None, addr


def parse_batch(val: str):
    if pd.isna(val):
        return None
    if isinstance(val, int):
        return val
    val = str(val).strip()
    if val in BATCH_MAP:
        return BATCH_MAP[val]
    m = re.search(r"第([一二三四五六七八])批", val)
    if m:
        cn = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8}
        return cn.get(m.group(1))
    try:
        return int(val)
    except ValueError:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to .shp file")
    parser.add_argument("--truncate", action="store_true", help="TRUNCATE pois before import")
    parser.add_argument("--db-url", default=None, help="Database URL (default: from DATABASE_URL_SYNC env var)")
    args = parser.parse_args()

    db_url = args.db_url or os.environ.get("DATABASE_URL_SYNC")
    if not db_url:
        print("Error: --db-url or DATABASE_URL_SYNC env var required", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {args.input} ...")
    gdf = gpd.read_file(args.input)
    print(f"  CRS: {gdf.crs}, rows: {len(gdf)}")

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print(f"  Reprojecting from {gdf.crs} to EPSG:4326 ...")
        gdf = gdf.to_crs(epsg=4326)

    df = pd.DataFrame()
    df["code"] = gdf["code"].apply(lambda x: str(int(x)) if pd.notna(x) else None)
    df["name"] = gdf["name"]
    df["category"] = gdf["type"]
    df["era"] = gdf["age"]
    df["batch"] = gdf["batch"].apply(parse_batch)
    df["address"] = gdf["add"]

    prov_city = gdf["add"].apply(parse_province_city)
    df["province"] = prov_city.apply(lambda x: x[0])
    df["city"] = prov_city.apply(lambda x: x[1])

    gdf_wgs84 = gdf.to_crs(epsg=4326)
    df["lng"] = gdf_wgs84.geometry.x
    df["lat"] = gdf_wgs84.geometry.y

    df = df.dropna(subset=["name", "lng", "lat"])

    print(f"  After cleaning: {len(df)} rows")
    print(f"  Categories: {df['category'].value_counts().to_dict()}")
    print(f"  Batches: {df['batch'].value_counts().to_dict()}")
    print(f"  Provinces: {df['province'].nunique()} unique")

    engine = create_engine(db_url)

    if args.truncate:
        with engine.connect() as conn:
            conn.execute(text("TRUNCATE pois CASCADE"))
            conn.commit()
            print("  TRUNCATED pois table")

    rows = []
    seen_codes = {}
    for _, r in df.iterrows():
        raw_code = r["code"]
        if raw_code and r["batch"]:
            candidate = f"{r['batch']}-{raw_code}"
        else:
            candidate = raw_code
        if candidate in seen_codes:
            seen_codes[candidate] += 1
            candidate = f"{candidate}-{seen_codes[candidate]}"
        else:
            seen_codes[candidate] = 0
        rows.append({
            "code": candidate,
            "name": r["name"],
            "category": r["category"],
            "era": r["era"],
            "batch": r["batch"],
            "province": r["province"],
            "city": r["city"],
            "address": r["address"],
            "location": f"SRID=4326;POINT({r['lng']} {r['lat']})",
        })

    if rows:
        conn = engine.connect()
        conn.execute(text(
            "INSERT INTO pois (id, code, name, category, era, batch, province, city, address, location, image_urls) "
            "VALUES (gen_random_uuid(), :code, :name, :category, :era, :batch, :province, :city, :address, ST_GeogFromText(:location), '{}')"
        ), rows)
        conn.commit()
        conn.close()
        print(f"  Inserted {len(rows)} rows into pois")

    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM pois")).scalar()
        print(f"  Total rows in pois: {count}")


if __name__ == "__main__":
    main()
