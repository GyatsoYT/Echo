import math
import hashlib
from functools import lru_cache
from collections import Counter
from config import Config

_FALLBACK_DIM = 512

def _fallback_embed(text: str) -> list[float]:
    words = text.lower().split()
    counts = Counter(words)
    vec = [0.0] * _FALLBACK_DIM
    for word, cnt in counts.items():
        idx = int(hashlib.md5(word.encode()).hexdigest(), 16) % _FALLBACK_DIM
        vec[idx] += cnt
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]

@lru_cache(maxsize=512)
def _embed_text_cached(text: str) -> tuple[float, ...]:
    if not Config.GEMINI_API_KEY:
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
    except Exception:
        return tuple(_fallback_embed(text))

def embed_text(text: str) -> list[float]:
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
    except Exception:
        return tuple(_fallback_embed(text))

def embed_query(text: str) -> list[float]:
    return list(_embed_query_cached(text.strip()))
