import json
from datetime import datetime
from config import Config

def compute_health(echo: dict) -> dict:
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

    group_names_raw = echo.get("group_names", "[]")
    if isinstance(group_names_raw, list):
        group_names = group_names_raw
    else:
        try:
            group_names = json.loads(group_names_raw or "[]")
            if not isinstance(group_names, list):
                group_names = []
        except Exception:
            group_names = []

    group_count = int(echo.get("group_count", len(group_names) or 1) or 1)

    if source == "whatsapp":
        max_days = 90
        green_threshold = 30
        yellow_threshold = 60
    else:
        max_days = Config.HEALTH_YELLOW_DAYS
        green_threshold = Config.HEALTH_GREEN_DAYS
        yellow_threshold = Config.HEALTH_YELLOW_DAYS

    effective_days = max(0, days_since_confirmed - (confirmations - 1) * 15)
    freshness_pct = max(0, int(100 * (1 - effective_days / max_days)))

    if effective_days < green_threshold:
        status = "fresh"
        emoji = "🟢"
    elif effective_days < yellow_threshold:
        status = "aging"
        emoji = "🟡"
    else:
        status = "stale"
        emoji = "🔴"

    is_whatsapp_stale = False
    stale_warning = None
    if source == "whatsapp" and (effective_days >= yellow_threshold or days_old >= 60):
        is_whatsapp_stale = True
        stale_warning = (
            f"WhatsApp intel from {days_old} days ago may be outdated — "
            f"hasn't been reconfirmed in a WhatsApp group recently. Verify with current batch."
        )

    if confirmations == 1:
        conf_label = "1 senior"
    else:
        conf_label = f"{confirmations} seniors"

    label = f"{emoji} {freshness_pct}% fresh · confirmed by {conf_label}"

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
    for echo in echoes:
        echo["health"] = compute_health(echo)
    return echoes
