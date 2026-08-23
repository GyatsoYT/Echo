import os
from dotenv import load_dotenv

load_dotenv()

_BASE_DIR = os.path.dirname(__file__)

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-prod")
    DEBUG = os.getenv("FLASK_ENV", "development") == "development"

    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

    DATABASE_PATH = os.getenv(
        "DATABASE_PATH",
        os.path.join(_BASE_DIR, "echo.db")
    )

    UPLOAD_FOLDER = os.getenv(
        "UPLOAD_FOLDER",
        os.path.join(_BASE_DIR, "static", "audio")
    )
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024

    SIMILARITY_THRESHOLD = 0.68
    GAP_THRESHOLD = 0.68
    ASK_BATCH_MIN_MATCHES = 1
    ASK_BATCH_MAX_CONTEXTS = 5

    HEALTH_GREEN_DAYS = 180
    HEALTH_YELLOW_DAYS = 365

    GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
    GROQ_LLM_MODEL = "groq/compound-mini"

    GEMINI_LLM_MODEL = "gemini-3.1-flash-lite"
    GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
