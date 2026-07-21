"""Configuration via environment. Sensible dev defaults so `uvicorn main:app`
just runs; override everything in production."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    # Empty string => in-memory registry (no Redis needed for local dev/tests).
    redis_url: str = ""

    # Empty string => in-memory audit chain (no Postgres needed for local dev).
    database_url: str = ""

    circuit_keys_dir: str = str(
        Path(__file__).resolve().parent.parent / "circuits" / "keys"
    )

    # Whether verifiers must present a registered API key. Off by default so the
    # demo works out of the box; a deployment sets this on.
    require_api_key: bool = False

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://zkgate.in",
        "https://verifier.zkgate.in",
    ]


settings = Settings()
