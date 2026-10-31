from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./cyber_risk.db"
    NVD_API_KEY: str | None = None
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:4173,http://127.0.0.1:4173"
    # Path to EPSS CSV file (relative to project root or absolute)
    EPSS_CSV_PATH: str = "dataset/epss_scores.csv"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
