from pydantic import BaseModel


class PoiCreateReq(BaseModel):
    code: str | None = None
    name: str
    category: str
    era: str | None = None
    batch: int | None = None
    province: str | None = None
    city: str | None = None
    address: str | None = None
    lng: float
    lat: float
    description: str | None = None
    image_urls: list[str] | None = None
    website: str | None = None
    baike_url: str | None = None


class PoiUpdateReq(BaseModel):
    code: str | None = None
    name: str | None = None
    category: str | None = None
    era: str | None = None
    batch: int | None = None
    province: str | None = None
    city: str | None = None
    address: str | None = None
    lng: float | None = None
    lat: float | None = None
    description: str | None = None
    image_urls: list[str] | None = None
    website: str | None = None
    baike_url: str | None = None


class LocationOut(BaseModel):
    wgs84: dict
    gcj02: dict


class PoiOut(BaseModel):
    id: str
    code: str | None
    name: str
    category: str
    era: str | None
    batch: int | None
    province: str | None
    city: str | None
    address: str | None
    location: LocationOut
    description: str | None
    image_urls: list[str]
    website: str | None
    baike_url: str | None
    has_extended: bool
    created_at: str
    updated_at: str
