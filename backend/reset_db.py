from app.core.config import settings
from app.db.database import Base, engine
import app.models  # noqa: F401 - ensures all models are registered


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print(f"Reset complete for: {settings.DATABASE_URL}")
    print("All tables were dropped and recreated in the current database.")


if __name__ == "__main__":
    reset_database()
