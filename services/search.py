"""
services/search.py
-------------------
Semantic search over stored Echoes using cosine similarity.
Loads all echo embeddings from the DB, computes similarity against the query,
and returns ranked results above a threshold.

Usage:
    from services.search import semantic_search
    results = semantic_search("which professor gives easy grades?")
    # Returns list of dicts with echo data + similarity score
"""

import numpy as np
from database.db import get_all_echoes, log_search
from services.embeddings import embed_query
from config import Config


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity between two 1-D numpy arrays."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def semantic_search(
    query: str,
    threshold: float | None = None,
    top_k: int = 5,
    log: bool = True,
) -> list[dict]:
    """
    Search all Echoes semantically using cosine similarity.

    Args:
        query:      The user's plain-language question.
        threshold:  Minimum similarity to include a result (default: Config.SIMILARITY_THRESHOLD).
        top_k:      Max number of results to return.
        log:        Whether to log this search to the `searches` table.

    Returns:
        List of echo dicts, each with an added "similarity" key (float 0–1),
        sorted descending by similarity.
    """
    if threshold is None:
        threshold = Config.SIMILARITY_THRESHOLD

    # Embed the query
    query_vec = np.array(embed_query(query), dtype=np.float32)

    # Load all echoes and compute similarity
    echoes = get_all_echoes()
    results = []

    for echo in echoes:
        echo_vec = echo["embedding"]  # already a numpy array from db.py
        # Handle dimension mismatch (fallback vs Gemini embeddings)
        if echo_vec.shape != query_vec.shape:
            continue
        sim = cosine_similarity(query_vec, echo_vec)
        if sim >= threshold:
            results.append({**echo, "similarity": sim})

    # Sort by similarity descending
    results.sort(key=lambda x: x["similarity"], reverse=True)
    results = results[:top_k]

    # Log the search
    if log:
        best_score = results[0]["similarity"] if results else None
        log_search(query, best_score)

    return results
