"""
services/memory_health.py
--------------------------
Computes the "Memory Health" of an Echo — a freshness + confirmation score
displayed as a coloured badge on each Echo card.

No AI needed — pure date math and a confirmation counter.

Usage:
    from services.memory_health import compute_health
    health = compute_health(echo_dict)
    # Returns: {"status": "fresh", "emoji": "🟢", "label": "🟢 92% fresh · confirmed by 3 seniors",
    #           "freshness_pct": 92, "days_old": 14, "confirmations": 3}
"""

from datetime import datetime, timezone
from config import Config


def compute_health(echo: dict) -> dict:
    """
    Compute the memory health of a single echo.

    Args:
        echo: A dict with at least "created_at" (str ISO timestamp) and
              "confirmations" (int) fields.

    Returns:
        A dict with:
          - status: "fresh" | "aging" | "stale"
          - emoji:  "🟢" | "🟡" | "🔴"
          - label:  Human-readable badge text
          - freshness_pct: 0–100 (100 = brand new)
          - days_old: int
          - confirmations: int
    """
    # Parse created_at — SQLite stores as "YYYY-MM-DD HH:MM:SS"
    created_raw = echo.get("created_at", "")
    try:
        if isinstance(created_raw, datetime):
            created = created_raw
        else:
            # Try ISO format first, then SQLite format
            for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    created = datetime.strptime(created_raw, fmt)
                    break
                except ValueError:
                    continue
            else:
                created = datetime.now()
    except Exception:
        created = datetime.now()

    now = datetime.now()
    days_old = max(0, (now - created.replace(tzinfo=None)).days)
    confirmations = echo.get("confirmations", 1)

    # Freshness: linear decay from 100% at day 0 to 0% at HEALTH_YELLOW_DAYS
    max_days = Config.HEALTH_YELLOW_DAYS
    freshness_pct = max(0, int(100 * (1 - days_old / max_days)))

    # Status
    if days_old < Config.HEALTH_GREEN_DAYS:
        status = "fresh"
        emoji = "🟢"
    elif days_old < Config.HEALTH_YELLOW_DAYS:
        status = "aging"
        emoji = "🟡"
    else:
        status = "stale"
        emoji = "🔴"

    # Confirmation label
    if confirmations == 1:
        conf_label = "1 senior"
    else:
        conf_label = f"{confirmations} seniors"

    label = f"{emoji} {freshness_pct}% fresh · confirmed by {conf_label}"

    return {
        "status": status,
        "emoji": emoji,
        "label": label,
        "freshness_pct": freshness_pct,
        "days_old": days_old,
        "confirmations": confirmations,
    }


def enrich_echoes_with_health(echoes: list[dict]) -> list[dict]:
    """Add a 'health' key to each echo dict in a list."""
    for echo in echoes:
        echo["health"] = compute_health(echo)
    return echoes
