"""
app.py — Echo: Institutional Memory Engine
==========================================
Main Flask application entry point.

Run with:
    python app.py
    # or
    flask run

Environment: copy .env.example → .env and fill in API keys.
"""

import os
from flask import Flask, render_template, redirect, url_for
from config import Config
from database.db import init_db


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    # Ensure audio upload directory exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # Initialise SQLite database
    with app.app_context():
        init_db()

    # Register blueprints
    from routes.echoes import echoes_bp
    from routes.search import search_bp
    from routes.admin import admin_bp

    app.register_blueprint(echoes_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(admin_bp)

    # ── Audio file serving (supports custom persistent volume /data/audio) ──
    @app.route("/static/audio/<path:filename>")
    def serve_audio(filename):
        from flask import send_from_directory
        return send_from_directory(Config.UPLOAD_FOLDER, filename)

    # ── Root route ──────────────────────────────────────────────────────────
    @app.route("/")
    def index():
        from database.db import get_search_stats, get_recent_echoes, get_knowledge_gaps
        stats = get_search_stats()
        recent_echoes = get_recent_echoes(limit=6)
        active_gaps, _ = get_knowledge_gaps(limit=4)
        return render_template(
            "index.html",
            stats=stats,
            recent_echoes=recent_echoes,
            active_gaps=active_gaps
        )

    # ── Custom error pages ──────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return render_template("error.html", code=404,
                               message="This Echo doesn't exist."), 404

    @app.errorhandler(500)
    def server_error(e):
        return render_template("error.html", code=500,
                               message="Something went wrong. The memory is foggy."), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
