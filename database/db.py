"""
database/db.py — SQLite setup, schema creation, and all DB helper functions.
Uses raw sqlite3 for speed at hackathon scale (no need for full ORM overhead).
"""

import sqlite3
import json
import numpy as np
from datetime import datetime
from contextlib import contextmanager
from config import Config


# ── Schema ─────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS echoes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    course_tag      TEXT    NOT NULL,
    professor_tag   TEXT,
    topic_tag       TEXT,
    transcript      TEXT    NOT NULL,
    audio_path      TEXT    NOT NULL,
    embedding       BLOB    NOT NULL,   -- JSON-serialised numpy float32 array
    confirmations   INTEGER DEFAULT 1,  -- bumped when near-duplicate submitted
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS searches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query_text      TEXT    NOT NULL,
    best_match_score REAL,              -- NULL when no echoes exist yet
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


# ── Connection helper ───────────────────────────────────────────────────────

@contextmanager
def get_db():
    """Context manager that yields a sqlite3 connection and commits on exit."""
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row          # rows accessible as dicts
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist. Safe to call multiple times."""
    with get_db() as conn:
        conn.executescript(SCHEMA)
    print(f"[DB] Initialised -> {Config.DATABASE_PATH}")


# ── Embedding serialisation ─────────────────────────────────────────────────

def embed_to_blob(embedding: list[float]) -> bytes:
    """Convert a list of floats → JSON bytes for BLOB storage."""
    return json.dumps(embedding).encode("utf-8")


def blob_to_embed(blob: bytes) -> np.ndarray:
    """Convert stored BLOB → numpy float32 array."""
    return np.array(json.loads(blob.decode("utf-8")), dtype=np.float32)


# ── Echo helpers ────────────────────────────────────────────────────────────

def insert_echo(course_tag: str, professor_tag: str, topic_tag: str,
                transcript: str, audio_path: str, embedding: list[float]) -> int:
    """Insert a new Echo and return its ID."""
    blob = embed_to_blob(embedding)
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO echoes
               (course_tag, professor_tag, topic_tag, transcript, audio_path, embedding)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (course_tag, professor_tag, topic_tag, transcript, audio_path, blob)
        )
        return cur.lastrowid


def increment_confirmation(echo_id: int):
    """Bump the confirmation counter on an existing Echo."""
    with get_db() as conn:
        conn.execute(
            "UPDATE echoes SET confirmations = confirmations + 1 WHERE id = ?",
            (echo_id,)
        )


def get_all_echoes() -> list[dict]:
    """Return all echoes as a list of dicts (embedding as numpy array)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM echoes ORDER BY created_at DESC"
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["embedding"] = blob_to_embed(d["embedding"])
        result.append(d)
    return result


def get_echo_by_id(echo_id: int) -> dict | None:
    """Return a single echo dict or None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM echoes WHERE id = ?", (echo_id,)
        ).fetchone()
    if row is None:
        return None
    d = dict(row)
    d["embedding"] = blob_to_embed(d["embedding"])
    return d


def delete_echo(echo_id: int):
    """Delete an echo by ID."""
    with get_db() as conn:
        conn.execute("DELETE FROM echoes WHERE id = ?", (echo_id,))


# ── Search / gap helpers ────────────────────────────────────────────────────

def log_search(query_text: str, best_match_score: float | None):
    """Log every search query with its best similarity score."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO searches (query_text, best_match_score) VALUES (?, ?)",
            (query_text, best_match_score)
        )


def get_knowledge_gaps(threshold: float | None = None, limit: int = 50) -> list[dict]:
    """
    Return searches grouped by query_text where best_match_score < threshold.
    Ordered by frequency (most-asked unanswered questions first).
    """
    if threshold is None:
        from config import Config
        threshold = Config.GAP_THRESHOLD

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                query_text,
                COUNT(*)        AS ask_count,
                AVG(best_match_score) AS avg_score,
                MIN(created_at) AS first_asked,
                MAX(created_at) AS last_asked
            FROM searches
            WHERE best_match_score < ? OR best_match_score IS NULL
            GROUP BY LOWER(TRIM(query_text))
            ORDER BY ask_count DESC
            LIMIT ?
            """,
            (threshold, limit)
        ).fetchall()
    return [dict(r) for r in rows]


def get_search_stats() -> dict:
    """Basic stats for the admin dashboard."""
    with get_db() as conn:
        total_echoes = conn.execute("SELECT COUNT(*) FROM echoes").fetchone()[0]
        total_searches = conn.execute("SELECT COUNT(*) FROM searches").fetchone()[0]
        gap_count = conn.execute(
            "SELECT COUNT(DISTINCT LOWER(TRIM(query_text))) FROM searches WHERE best_match_score < 0.45 OR best_match_score IS NULL"
        ).fetchone()[0]
    return {
        "total_echoes": total_echoes,
        "total_searches": total_searches,
        "gap_count": gap_count,
    }
