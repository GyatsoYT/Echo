"""
routes/search.py
-----------------
Routes for semantic search and the "Ask the Batch" results page.

GET  /search          — search page
POST /search          — run a search, returns JSON results
GET  /search/results  — rendered results page (query in query params)
"""

from flask import Blueprint, request, jsonify, render_template
from services.search import semantic_search
from services.synthesis import ask_the_batch
from services.memory_health import enrich_echoes_with_health
from database.db import get_search_stats
from config import Config

search_bp = Blueprint("search", __name__)


# ── Search page (GET) ───────────────────────────────────────────────────────

@search_bp.route("/search", methods=["GET"])
def search_page():
    stats = get_search_stats()
    return render_template("search.html", total_echoes=stats.get("total_echoes", 0))


# ── Run search (POST — JSON API) ────────────────────────────────────────────

@search_bp.route("/search", methods=["POST"])
def run_search():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()

    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400

    results = semantic_search(query)
    results = enrich_echoes_with_health(results)

    # Build Ask the Batch synthesis if enough matches
    synthesis = None
    if len(results) >= Config.ASK_BATCH_MIN_MATCHES:
        synthesis = ask_the_batch(question=query, echoes=results)

    # Strip numpy arrays before JSON serialisation
    clean_results = []
    for r in results:
        cr = {k: v for k, v in r.items() if k != "embedding"}
        # Convert health dict and numpy floats to plain Python types
        cr["similarity"] = round(float(cr["similarity"]), 4)
        clean_results.append(cr)

    return jsonify({
        "query": query,
        "results": clean_results,
        "synthesis": synthesis,
        "result_count": len(clean_results),
        "has_gaps": len(clean_results) == 0,
    }), 200


# ── Rendered results page ────────────────────────────────────────────────────

@search_bp.route("/results", methods=["GET"])
def results_page():
    query = request.args.get("q", "").strip()
    if not query:
        return render_template("search.html")

    results = semantic_search(query)
    results = enrich_echoes_with_health(results)

    synthesis = None
    if len(results) >= Config.ASK_BATCH_MIN_MATCHES:
        synthesis = ask_the_batch(question=query, echoes=results)

    # Clean up for template
    for r in results:
        r.pop("embedding", None)
        r["similarity"] = round(float(r["similarity"]), 4)

    return render_template(
        "results.html",
        query=query,
        results=results,
        synthesis=synthesis,
        result_count=len(results),
        has_gaps=len(results) == 0,
    )
