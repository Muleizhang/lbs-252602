from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://lbs:lbs_dev_2026@localhost:5433/lbs"
    DATABASE_URL_SYNC: str = "postgresql://lbs:lbs_dev_2026@localhost:5433/lbs"
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] = ["*"]

    model_config = {"env_file": "../.env.local", "extra": "ignore"}


settings = Settings()
