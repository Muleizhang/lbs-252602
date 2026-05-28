import uuid

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        CheckConstraint("role IN ('admin','user')", name="users_role_check"),
    )

    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    key_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    last_used_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("api_keys_user_id_idx", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="api_keys")


POI_CATEGORIES = (
    "古遗址",
    "古墓葬",
    "古建筑",
    "石窟寺及石刻",
    "近现代重要史迹及代表性建筑",
    "其他",
)


class Poi(Base):
    __tablename__ = "pois"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str | None] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    era: Mapped[str | None] = mapped_column(Text)
    batch: Mapped[int | None] = mapped_column(Integer)
    province: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    location = Column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_urls: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    website: Mapped[str | None] = mapped_column(Text)
    baike_url: Mapped[str | None] = mapped_column(Text)
    has_extended: Mapped[bool] = mapped_column(
        Boolean,
        Computed(
            "COALESCE(array_length(image_urls,1),0) > 0 OR website IS NOT NULL OR baike_url IS NOT NULL",
            persisted=True,
        ),
        nullable=False,
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        CheckConstraint(
            f"category IN {POI_CATEGORIES}",
            name="pois_category_check",
        ),
        CheckConstraint("batch BETWEEN 1 AND 8", name="pois_batch_check"),
        Index("pois_geom_gix", "location", postgresql_using="gist"),
        Index("pois_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("pois_province_idx", "province"),
        Index("pois_category_idx", "category"),
        Index("pois_batch_idx", "batch"),
    )
