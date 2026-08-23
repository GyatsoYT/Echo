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
from functools import lru_cache
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

@lru_cache(maxsize=512)
def _embed_text_cached(text: str) -> tuple[float, ...]:
    if not Config.GEMINI_API_KEY:
        print("[Embeddings] GEMINI_API_KEY not set -> using fallback embedding")
        return tuple(_fallback_embed(text))

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        result = client.models.embed_content(
            model=Config.GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
        )
        return tuple(result.embeddings[0].values)

    except Exception as exc:
        print(f"[Embeddings] Gemini API failed ({exc}) -> using fallback embedding")
        return tuple(_fallback_embed(text))


def embed_text(text: str) -> list[float]:
    """Embed a text string using Gemini's embedding model (cached)."""
    return list(_embed_text_cached(text.strip()))


@lru_cache(maxsize=512)
def _embed_query_cached(text: str) -> tuple[float, ...]:
    if not Config.GEMINI_API_KEY:
        return tuple(_fallback_embed(text))

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=Config.GEMINI_API_KEY)
        result = client.models.embed_content(
            model=Config.GEMINI_EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
        )
        return tuple(result.embeddings[0].values)

    except Exception as exc:
        print(f"[Embeddings] Gemini query embed failed ({exc}) -> using fallback")
        return tuple(_fallback_embed(text))


def embed_query(text: str) -> list[float]:
    """Embed a search query using RETRIEVAL_QUERY task type (cached)."""
    return list(_embed_query_cached(text.strip()))
