import os
from dotenv import load_dotenv

load_dotenv()

# Base directory (used as fallback for local dev)
_BASE_DIR = os.path.dirname(__file__)


class Config:
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-prod")
    DEBUG = os.getenv("FLASK_ENV", "development") == "development"

    # API Keys
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

    # Database — use DATABASE_PATH env var on Railway (points to persistent volume)
    # Default: local echo.db for development
    DATABASE_PATH = os.getenv(
        "DATABASE_PATH",
        os.path.join(_BASE_DIR, "echo.db")
    )

    # Audio uploads — use UPLOAD_FOLDER env var on Railway (points to persistent volume)
    # Default: local static/audio for development
    UPLOAD_FOLDER = os.getenv(
        "UPLOAD_FOLDER",
        os.path.join(_BASE_DIR, "static", "audio")
    )
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB max audio

    # Search thresholds (calibrated for Gemini 3072-dim embeddings)
    SIMILARITY_THRESHOLD = 0.68      # Above this -> a "match"
    GAP_THRESHOLD = 0.68             # Below this -> logged as a knowledge gap
    ASK_BATCH_MIN_MATCHES = 1        # Min matches to trigger Ask the Batch (even 1 relevant match can synthesize)
    ASK_BATCH_MAX_CONTEXTS = 5       # How many echoes to pass to LLM

    # Memory health (days)
    HEALTH_GREEN_DAYS = 180          # < 6 months → 🟢
    HEALTH_YELLOW_DAYS = 365         # < 1 year   → 🟡
    # >= 1 year → 🔴

    # Groq models
    GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
    GROQ_LLM_MODEL = "groq/compound-mini"

    # Gemini models (multilingual + high free quota)
    GEMINI_LLM_MODEL = "gemini-3.1-flash-lite"
    GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
