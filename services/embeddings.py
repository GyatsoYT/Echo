"""
services/embeddings.py
-----------------------
Generates text embeddings using Google Gemini's embedding API (new google-genai SDK).
Falls back to a simple hash-based bag-of-words vector if Gemini is unreachable,
so the app stays functional even without an internet connection.

Usage:
    from services.embeddings import embed_text
    vector = embed_text("the professor's midterm was really hard")
    # Returns list[float] of length 3072 (Gemini) or 512 (fallback)
"""

import math
import hashlib
from collections import Counter
from config import Config


# ── Fallback embedding (no API needed) ─────────────────────────────────────

_FALLBACK_DIM = 512

def _fallback_embed(text: str) -> list[float]:
    """
    Simple deterministic bag-of-words embedding as an offline fallback.
    NOT semantic — use only when Gemini is unavailable.
    Produces a fixed 512-dim vector by hashing word unigrams into buckets.
    """
    words = text.lower().split()
    counts = Counter(words)
    vec = [0.0] * _FALLBACK_DIM
    for word, cnt in counts.items():
        idx = int(hashlib.md5(word.encode()).hexdigest(), 16) % _FALLBACK_DIM
        vec[idx] += cnt
    # L2 normalise
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


# ── Gemini embedding ────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float]:
    """
    Embed a text string using Gemini's embedding model.
    Falls back to _fallback_embed if the API call fails.

    Args:
        text: The text to embed (transcript or search query).

    Returns:
        list[float] — embedding vector.
    """
    if not Config.GEMINI_API_KEY:
        print("[Embeddings] GEMINI_API_KEY not set → using fallback embedding")
        return _fallback_embed(text)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        result = client.models.embed_content(
            model=Config.GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
        )
        return result.embeddings[0].values

    except Exception as exc:
        print(f"[Embeddings] Gemini API failed ({exc}) → using fallback embedding")
        return _fallback_embed(text)


def embed_query(text: str) -> list[float]:
    """
    Embed a search query. Uses RETRIEVAL_QUERY task type for better retrieval.
    Falls back to embed_text behaviour if the API is unavailable.
    """
    if not Config.GEMINI_API_KEY:
        return _fallback_embed(text)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        result = client.models.embed_content(
            model=Config.GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
        )
        return result.embeddings[0].values

    except Exception as exc:
        print(f"[Embeddings] Gemini query embed failed ({exc}) → using fallback")
        return _fallback_embed(text)
