"""
Application configuration using Pydantic Settings.

All configuration is loaded from environment variables.
Secrets are never hardcoded — see .env.example for required variables.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from the project root
def _find_project_root() -> Path:
    curr = Path(__file__).resolve().parent
    # 1. Look for .env file explicitly in parents
    for p in [curr, *curr.parents]:
        if (p / ".env").is_file():
            return p
    # 2. Look for project boundary markers
    for p in [curr, *curr.parents]:
        if (p / "backend").is_dir() and (p / "frontend").is_dir():
            return p
    return Path("/app") if Path("/app").exists() else curr

_PROJECT_ROOT = _find_project_root()
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    """Central application configuration.

    Values are loaded from environment variables and/or a .env file.
    All secrets must be provided via environment — never hardcode them.
    """

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    app_name: str = "AuraAI"
    app_version: str = "2.0.0"
    debug: bool = False
    environment: str = "development"
    log_level: str = "INFO"

    # ── Server ───────────────────────────────────────────────────
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # ── Database (PostgreSQL) ────────────────────────────────────
    postgres_user: str = "aura"
    postgres_password: str = "aura_dev_password_change_me"
    postgres_db: str = "aura_ai"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    # Explicit URLs take precedence when supplied by a managed deployment.
    # Keeping these as declared settings means they are never silently ignored.
    database_url_override: str | None = Field(
        default=None, validation_alias="DATABASE_URL"
    )

    @property
    def database_url(self) -> str:
        """Async PostgreSQL connection URL for SQLAlchemy."""
        if self.database_url_override:
            return self.database_url_override
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync PostgreSQL connection URL (used by Alembic)."""
        if self.database_url_override:
            return self.database_url_override.replace("postgresql+asyncpg://", "postgresql://")
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── Redis ────────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_url_override: str | None = Field(default=None, validation_alias="REDIS_URL")

    @property
    def redis_url(self) -> str:
        """Redis connection URL."""
        if self.redis_url_override:
            return self.redis_url_override
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ── JWT Authentication ───────────────────────────────────────
    jwt_secret_key: str = Field(
        default="CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING",
        validation_alias=AliasChoices("JWT_SECRET_KEY", "JWT_SECRET"),
    )
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # ── CORS ─────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # ── Rate Limiting ────────────────────────────────────────────
    rate_limit_per_minute: int = 60

    # ── AI Providers ─────────────────────────────────────────────
    # NVIDIA NIM (Main Brain)
    nvidia_nim_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("NVIDIA_NIM_API_KEY", "nvidia_nim_api_key"),
    )
    nvidia_nim_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_nim_model: str = "meta/llama-3.2-11b-vision-instruct"

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Provider priority
    ai_provider_priority: str = "nvidia_nim,gemini,openai"

    @property
    def ai_provider_priority_list(self) -> List[str]:
        """Parse AI provider priority from comma-separated string."""
        return [p.strip() for p in self.ai_provider_priority.split(",") if p.strip()]

    # ── TTS ──────────────────────────────────────────────────────
    tts_provider: str = "edge_tts"        # elevenlabs | edge_tts | nvidia_tts
    tts_voice: str = "en-IN-NeerjaExpressiveNeural"  # Expressive Indian English neural voice
    tts_sentence_buffer_chars: int = 80   # Flush TTS after this many buffered chars

    # ElevenLabs TTS
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str = "Xb7hH8MSUJpSbSDYk0k2"  # Alice (Clear, Engaging, Free Premade Voice)
    elevenlabs_model_id: str = "eleven_multilingual_v2" # High-quality multilingual model

    # NVIDIA TTS (Magpie or regular)
    nvidia_tts_uri: str = "grpc.nvcf.nvidia.com:443"
    nvidia_tts_function_id: str | None = None # Required for Magpie Multilingual on Cloud NVCF

    # ── STT ──────────────────────────────────────────────────────
    stt_provider: str = "whisper"
    stt_model_size: str = "small"         # tiny | base | small | medium | large
    stt_language: str = "auto"           # auto | en | hi
    stt_compute_type: str = "int8"       # int8 (CPU) | float16 (GPU)

    # ── Voice Activity Detection ─────────────────────────────────
    vad_aggressiveness: int = 2          # 0 (lenient) – 3 (aggressive)
    vad_silence_threshold_ms: int = 800  # Silence gap before speech_ended fires
    vad_min_speech_ms: int = 250         # Min speech duration to trigger STT
    vad_frame_duration_ms: int = 30      # VAD frame size: 10 | 20 | 30 ms

    # ── Voice WebSocket ──────────────────────────────────────────
    voice_ws_require_auth: bool = False   # Gate voice WS behind JWT (set True in prod)
    voice_session_timeout_s: int = 300    # Idle session auto-close after N seconds

    # ── Validation ───────────────────────────────────────────────
    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Ensure log level is valid."""
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid_levels:
            raise ValueError(f"Invalid log level: {v}. Must be one of {valid_levels}")
        return upper

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Ensure environment is valid."""
        valid_envs = {"development", "staging", "production", "testing"}
        lower = v.lower()
        if lower not in valid_envs:
            raise ValueError(f"Invalid environment: {v}. Must be one of {valid_envs}")
        return lower


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Get cached application settings singleton.

    Uses lru_cache to ensure settings are loaded only once.
    """
    return Settings()
