from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional  # noqa: F401


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Email via Resend (optional — notifications silently skipped if not set)
    RESEND_API_KEY: Optional[str] = None
    RESEND_FROM: str = "IE Planner <outreach@smorx.ai>"
    NOTIFICATION_TO: Optional[str] = None  # if set, overrides all recipient addresses

    # Twilio SMS (optional)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

    APP_URL: str = "http://localhost:5173"

    # Anthropic (optional — AI endpoints return 503 if not set)
    ANTHROPIC_API_KEY: Optional[str] = None

    @field_validator("DATABASE_URL")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        # asyncpg requires its own scheme
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)

        # asyncpg does not understand sslmode or channel_binding — strip them
        # SSL is passed via connect_args={"ssl": True} in the engine instead
        import re
        v = re.sub(r"[?&]sslmode=[^&]*", "", v)
        v = re.sub(r"[?&]channel_binding=[^&]*", "", v)

        # Clean up dangling ? or & after stripping
        v = re.sub(r"\?&", "?", v)
        v = re.sub(r"[?&]$", "", v)

        return v

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
