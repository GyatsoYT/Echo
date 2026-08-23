import re
import numpy as np
from database.db import get_all_echoes, log_search
from services.embeddings import embed_query
from config import Config

def extract_course_code(text: str) -> str | None:
    match = re.search(r'\b([A-Za-z]{2,5}\s*[-]?\s*\d{3,4}[A-Za-z]?)\b', text, re.IGNORECASE)
    if match:
        return re.sub(r'[\s-]', '', match.group(1)).upper()
    return None

def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
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
    if threshold is None:
        threshold = Config.SIMILARITY_THRESHOLD

    query_course = extract_course_code(query)
    query_vec = np.array(embed_query(query), dtype=np.float32)

    echoes = get_all_echoes()
    results = []

    for echo in echoes:
        echo_vec = echo["embedding"]
        if echo_vec.shape != query_vec.shape:
            continue

        sim = cosine_similarity(query_vec, echo_vec)
        echo_course = (echo.get("course_tag") or "").upper().replace(" ", "").replace("-", "")

        if query_course:
            is_matching_course = (query_course in echo_course) or (query_course in (echo.get("transcript") or "").upper())
            if not is_matching_course:
                continue
            else:
                sim = min(1.0, sim + 0.05)

        if sim >= threshold:
            results.append({**echo, "similarity": sim})

    results.sort(key=lambda x: x["similarity"], reverse=True)
    results = results[:top_k]

    if log:
        best_score = results[0]["similarity"] if results else 0.0
        log_search(query, best_score)

    return results
