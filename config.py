import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-prod")
    DEBUG = os.getenv("FLASK_ENV", "development") == "development"

    # API Keys
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

    # Database
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), "echo.db")

    # Audio uploads
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "audio")
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50 MB max audio

    # Search thresholds
    SIMILARITY_THRESHOLD = 0.45      # Above this → a "match"
    GAP_THRESHOLD = 0.45             # Below this → logged as a knowledge gap
    ASK_BATCH_MIN_MATCHES = 2        # Min matches to trigger Ask the Batch
    ASK_BATCH_MAX_CONTEXTS = 5       # How many echoes to pass to LLM

    # Memory health (days)
    HEALTH_GREEN_DAYS = 180          # < 6 months → 🟢
    HEALTH_YELLOW_DAYS = 365         # < 1 year   → 🟡
    # >= 1 year → 🔴

    # Groq models
    GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
    GROQ_LLM_MODEL = "openai/gpt-oss-20b"

    # Gemini embedding model
    GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
