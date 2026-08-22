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
    WhatsApp intel has a faster time-decay because group advice/policies change quickly.

    Args:
        echo: A dict with at least "created_at" (str ISO timestamp),
              "confirmations" (int), "source" (str), and optional "last_confirmed_at", "group_names", "group_count".

    Returns:
        A dict with:
          - status: "fresh" | "aging" | "stale"
          - emoji:  "🟢" | "🟡" | "🔴"
          - label:  Human-readable badge text
          - freshness_pct: 0–100 (100 = brand new)
          - days_old: int
          - confirmations: int
          - is_whatsapp_stale: bool
          - stale_warning: str | None
          - cross_group_label: str | None
          - group_names: list[str]
          - group_count: int
    """
    # Parse created_at
    created_raw = echo.get("created_at", "")
    created = datetime.now()
    if isinstance(created_raw, datetime):
        created = created_raw
    elif created_raw:
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                created = datetime.strptime(str(created_raw)[:19], fmt)
                break
            except ValueError:
                continue

    # Parse last_confirmed_at
    last_confirmed_raw = echo.get("last_confirmed_at") or created_raw
    last_confirmed = created
    if isinstance(last_confirmed_raw, datetime):
        last_confirmed = last_confirmed_raw
    elif last_confirmed_raw:
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                last_confirmed = datetime.strptime(str(last_confirmed_raw)[:19], fmt)
                break
            except ValueError:
                continue

    now = datetime.now()
    days_old = max(0, (now - created.replace(tzinfo=None)).days)
    days_since_confirmed = max(0, (now - last_confirmed.replace(tzinfo=None)).days)
    confirmations = int(echo.get("confirmations", 1) or 1)
    source = (echo.get("source") or "web").lower()

    # Parse groups
    group_names_raw = echo.get("group_names", "[]")
    if isinstance(group_names_raw, list):
        group_names = group_names_raw
    else:
        try:
            import json
            group_names = json.loads(group_names_raw or "[]")
            if not isinstance(group_names, list):
                group_names = []
        except Exception:
            group_names = []

    group_count = int(echo.get("group_count", len(group_names) or 1) or 1)

    # ── Time-Decay Calculation ───────────────────────────────────────────────
    # WhatsApp answers decay much faster (max 90 days vs 365 days)
    if source == "whatsapp":
        max_days = 90
        green_threshold = 30
        yellow_threshold = 60
    else:
        max_days = Config.HEALTH_YELLOW_DAYS
        green_threshold = Config.HEALTH_GREEN_DAYS
        yellow_threshold = Config.HEALTH_YELLOW_DAYS

    # Confirmation boosts freshness (each confirmation restores up to 15 days)
    effective_days = max(0, days_since_confirmed - (confirmations - 1) * 15)
    freshness_pct = max(0, int(100 * (1 - effective_days / max_days)))

    # Status
    if effective_days < green_threshold:
        status = "fresh"
        emoji = "🟢"
    elif effective_days < yellow_threshold:
        status = "aging"
        emoji = "🟡"
    else:
        status = "stale"
        emoji = "🔴"

    # WhatsApp-specific stale warning
    is_whatsapp_stale = False
    stale_warning = None
    if source == "whatsapp" and (effective_days >= yellow_threshold or days_old >= 60):
        is_whatsapp_stale = True
        stale_warning = (
            f"WhatsApp intel from {days_old} days ago may be outdated — "
            f"hasn't been reconfirmed in a WhatsApp group recently. Verify with current batch."
        )

    # Confirmation label
    if confirmations == 1:
        conf_label = "1 senior"
    else:
        conf_label = f"{confirmations} seniors"

    label = f"{emoji} {freshness_pct}% fresh · confirmed by {conf_label}"

    # Cross-group insight label
    cross_group_label = None
    if group_count > 1:
        group_str = ", ".join(group_names[:2])
        if len(group_names) > 2:
            group_str += f" +{len(group_names)-2} more"
        cross_group_label = f"📌 Heard across {group_count} different groups ({group_str})"

    return {
        "status": status,
        "emoji": emoji,
        "label": label,
        "freshness_pct": freshness_pct,
        "days_old": days_old,
        "days_since_confirmed": days_since_confirmed,
        "confirmations": confirmations,
        "source": source,
        "is_whatsapp_stale": is_whatsapp_stale,
        "stale_warning": stale_warning,
        "cross_group_label": cross_group_label,
        "group_names": group_names,
        "group_count": group_count,
    }


def enrich_echoes_with_health(echoes: list[dict]) -> list[dict]:
    """Add a 'health' key to each echo dict in a list."""
    for echo in echoes:
        echo["health"] = compute_health(echo)
    return echoes
