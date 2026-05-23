from fastapi import APIRouter, Query, Request
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload

from app.deps import DbSession, AdminUser, ApiKeyUser
from app.errors import BizError, ErrorCode
from app.models import Poi, POI_CATEGORIES
from app.schemas.poi import PoiCreateReq, PoiUpdateReq, PoiOut, LocationOut
from app.schemas.response import ok, PaginationMeta
from app.utils.coord import wgs84_to_gcj02
from app.utils.ratelimit import limiter

router = APIRouter(prefix="/api/v1/pois", tags=["pois"])

VALID_CATEGORIES = set(POI_CATEGORIES)


def _poi_out(p: Poi) -> dict:
    geom = p.location
    from geoalchemy2.shape import to_shape
    pt = to_shape(geom)
    lng, lat = pt.x, pt.y
    gcj_lng, gcj_lat = wgs84_to_gcj02(lng, lat)
    return PoiOut(
        id=str(p.id),
        code=p.code,
        name=p.name,
        category=p.category,
        era=p.era,
        batch=p.batch,
        province=p.province,
        city=p.city,
        address=p.address,
        location=LocationOut(
            wgs84={"lng": round(lng, 6), "lat": round(lat, 6)},
            gcj02={"lng": round(gcj_lng, 6), "lat": round(gcj_lat, 6)},
        ),
        description=p.description,
        image_urls=p.image_urls or [],
        website=p.website,
        has_extended=p.has_extended,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    ).model_dump()


# ---------- T05: CRUD (admin) ----------

@router.post("")
async def create_poi(body: PoiCreateReq, _admin: AdminUser, db: DbSession):
    if body.category not in VALID_CATEGORIES:
        raise BizError(ErrorCode.PARAM_INVALID, f"category 必须是: {VALID_CATEGORIES}")
    poi = Poi(
        code=body.code,
        name=body.name,
        category=body.category,
        era=body.era,
        batch=body.batch,
        province=body.province,
        city=body.city,
        address=body.address,
        location=f"SRID=4326;POINT({body.lng} {body.lat})",
        description=body.description,
        image_urls=body.image_urls or [],
        website=body.website,
    )
    db.add(poi)
    await db.commit()
    await db.refresh(poi)
    return ok(_poi_out(poi))


@router.patch("/{poi_id}")
async def update_poi(poi_id: str, body: PoiUpdateReq, _admin: AdminUser, db: DbSession):
    result = await db.execute(select(Poi).where(Poi.id == poi_id))
    poi = result.scalar_one_or_none()
    if not poi:
        raise BizError(ErrorCode.POI_NOT_FOUND)
    updates = body.model_dump(exclude_unset=True)
    lng = updates.pop("lng", None)
    lat = updates.pop("lat", None)
    if lng is not None and lat is not None:
        poi.location = f"SRID=4326;POINT({lng} {lat})"
    elif lng is not None or lat is not None:
        raise BizError(ErrorCode.PARAM_INVALID, "lng 和 lat 必须同时提供")
    if "category" in updates and updates["category"] not in VALID_CATEGORIES:
        raise BizError(ErrorCode.PARAM_INVALID, f"category 必须是: {VALID_CATEGORIES}")
    for k, v in updates.items():
        setattr(poi, k, v)
    await db.commit()
    await db.refresh(poi)
    return ok(_poi_out(poi))


@router.delete("/{poi_id}")
async def delete_poi(poi_id: str, _admin: AdminUser, db: DbSession):
    result = await db.execute(select(Poi).where(Poi.id == poi_id))
    poi = result.scalar_one_or_none()
    if not poi:
        raise BizError(ErrorCode.POI_NOT_FOUND)
    await db.delete(poi)
    await db.commit()
    return ok(None)


# ---------- T06: 查询 ----------

@router.get("")
@limiter.limit("60/minute")
async def list_pois(
    request: Request,
    _user: ApiKeyUser,
    db: DbSession,
    name: str | None = Query(None),
    province: str | None = Query(None),
    category: str | None = Query(None),
    batch: int | None = Query(None),
    has_extended: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    stmt = select(Poi)
    count_stmt = select(func.count()).select_from(Poi)

    if name:
        stmt = stmt.where(Poi.name.ilike(f"%{name}%"))
        count_stmt = count_stmt.where(Poi.name.ilike(f"%{name}%"))
    if province:
        stmt = stmt.where(Poi.province == province)
        count_stmt = count_stmt.where(Poi.province == province)
    if category:
        stmt = stmt.where(Poi.category == category)
        count_stmt = count_stmt.where(Poi.category == category)
    if batch is not None:
        stmt = stmt.where(Poi.batch == batch)
        count_stmt = count_stmt.where(Poi.batch == batch)
    if has_extended is not None:
        stmt = stmt.where(Poi.has_extended == has_extended)
        count_stmt = count_stmt.where(Poi.has_extended == has_extended)

    total = (await db.execute(count_stmt)).scalar()
    offset = (page - 1) * size
    stmt = stmt.order_by(Poi.name).offset(offset).limit(size)
    result = await db.execute(stmt)
    pois = result.scalars().all()
    return ok(
        [_poi_out(p) for p in pois],
        meta=PaginationMeta(page=page, size=size, total=total),
    )


@router.get("/search/bbox")
@limiter.limit("60/minute")
async def search_bbox(
    request: Request,
    _user: ApiKeyUser,
    db: DbSession,
    minLng: float = Query(...),
    minLat: float = Query(...),
    maxLng: float = Query(...),
    maxLat: float = Query(...),
    has_extended: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    filter_cond = func.ST_Intersects(
        Poi.location, func.ST_MakeEnvelope(minLng, minLat, maxLng, maxLat, 4326)
    )
    count_stmt = select(func.count()).select_from(Poi).where(filter_cond)
    stmt = select(Poi).where(filter_cond)

    if has_extended is not None:
        count_stmt = count_stmt.where(Poi.has_extended == has_extended)
        stmt = stmt.where(Poi.has_extended == has_extended)

    total = (await db.execute(count_stmt)).scalar()

    stmt = (
        stmt.order_by(Poi.name)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    pois = result.scalars().all()
    return ok(
        [_poi_out(p) for p in pois],
        meta=PaginationMeta(page=page, size=size, total=total),
    )


@router.get("/search/radius")
@limiter.limit("60/minute")
async def search_radius(
    request: Request,
    _user: ApiKeyUser,
    db: DbSession,
    lng: float = Query(...),
    lat: float = Query(...),
    radius: float = Query(..., description="meters"),
    has_extended: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    center = func.ST_GeogFromText(f"SRID=4326;POINT({lng} {lat})")
    filter_cond = func.ST_DWithin(Poi.location, center, radius)
    count_stmt = select(func.count()).select_from(Poi).where(filter_cond)
    stmt = select(Poi).where(filter_cond)

    if has_extended is not None:
        count_stmt = count_stmt.where(Poi.has_extended == has_extended)
        stmt = stmt.where(Poi.has_extended == has_extended)

    total = (await db.execute(count_stmt)).scalar()

    stmt = (
        stmt.order_by(func.ST_Distance(Poi.location, center))
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    pois = result.scalars().all()
    return ok(
        [_poi_out(p) for p in pois],
        meta=PaginationMeta(page=page, size=size, total=total),
    )


@router.get("/{poi_id}")
@limiter.limit("60/minute")
async def get_poi(request: Request, poi_id: str, _user: ApiKeyUser, db: DbSession):
    result = await db.execute(select(Poi).where(Poi.id == poi_id))
    poi = result.scalar_one_or_none()
    if not poi:
        raise BizError(ErrorCode.POI_NOT_FOUND)
    return ok(_poi_out(poi))


meta_router = APIRouter(prefix="/api/v1/meta", tags=["meta"])


@meta_router.get("/categories")
async def meta_categories():
    return ok(list(VALID_CATEGORIES))


@meta_router.get("/provinces")
async def meta_provinces(db: DbSession):
    result = await db.execute(
        select(Poi.province).distinct().where(Poi.province.isnot(None)).order_by(Poi.province)
    )
    return ok([r[0] for r in result.all()])
