"""
routes/admin.py
----------------
Admin / instructor routes:

GET  /gaps          — Knowledge Gaps view
GET  /stats         — Dashboard stats (JSON)
POST /seed          — Seed demo data (dev only)
GET  /qr/<echo_id>  — Generate QR code for an Echo (JIT Handover)
"""

import os
import io
import json
from flask import Blueprint, render_template, jsonify, send_file, current_app, request, flash, redirect, url_for
from database.db import get_knowledge_gaps, get_search_stats, get_all_echoes, insert_echo
from services.embeddings import embed_text
from services.memory_health import enrich_echoes_with_health

admin_bp = Blueprint("admin", __name__)


# ── Knowledge Gaps view ─────────────────────────────────────────────────────

@admin_bp.route("/gaps", methods=["GET"])
def knowledge_gaps():
    active_gaps, resolved_gaps = get_knowledge_gaps()
    stats = get_search_stats()
    return render_template("gaps.html", gaps=active_gaps, resolved_gaps=resolved_gaps, stats=stats)


# ── Dashboard stats (JSON) ──────────────────────────────────────────────────

@admin_bp.route("/api/stats", methods=["GET"])
def api_stats():
    stats = get_search_stats()
    return jsonify(stats), 200


# ── WhatsApp bot endpoint: POST /api/ghosts ─────────────────────────────────

@admin_bp.route("/api/ghosts", methods=["POST"])
def api_create_ghost():
    """
    JSON endpoint for the Baileys WhatsApp bot.
    Accepts a Q&A pair captured from WhatsApp and saves it as an Echo.
    Performs automatic cross-group deduplication.
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    transcript = (data.get("transcript") or "").strip()
    question_context = (data.get("question_context") or "").strip()
    course_tag = (data.get("course_tag") or "general").strip()
    source = (data.get("source") or "web").strip()
    group_name = (data.get("group_name") or "").strip()

    if not transcript:
        return jsonify({"error": "transcript is required"}), 400
    if len(transcript) < 12:
        return jsonify({"error": "transcript too short to be meaningful"}), 400

    try:
        embedding = embed_text(transcript)
    except Exception as e:
        return jsonify({"error": f"Embedding failed: {str(e)}"}), 500

    # Cross-group deduplication: check if an existing Echo has very high similarity (>= 0.85)
    from routes.echoes import _check_near_duplicate
    dup_id = _check_near_duplicate(embedding, course_tag, threshold=0.85)
    if not dup_id and course_tag.lower() == "general":
        # Check globally for general advice
        dup_id = _check_near_duplicate(embedding, "general", threshold=0.85)

    if dup_id:
        from database.db import increment_confirmation
        stats = increment_confirmation(dup_id, group_name=group_name)
        print(f"[API] Cross-group duplicate found! Echo #{dup_id} confirmation bumped to {stats['confirmations']} across {stats['group_count']} groups")
        return jsonify({
            "status": "confirmed",
            "echo_id": dup_id,
            "group_count": stats["group_count"],
            "group_names": stats["group_names"],
            "confirmations": stats["confirmations"],
            "message": f"Cross-group consensus detected! Confirmed in {stats['group_count']} groups.",
        }), 200

    try:
        echo_id = insert_echo(
            course_tag=course_tag,
            professor_tag="",
            topic_tag="whatsapp-capture",
            transcript=transcript,
            audio_path="",
            embedding=embedding,
            source=source,
            question_context=question_context,
            group_name=group_name,
        )
    except Exception as e:
        return jsonify({"error": f"DB insert failed: {str(e)}"}), 500

    print(f"[API] WhatsApp Ghost saved: echo_id={echo_id}, course={course_tag}, source={source}, group={group_name}")
    return jsonify({
        "status": "created",
        "echo_id": echo_id,
        "group_name": group_name,
        "message": "Echo captured from WhatsApp and saved!",
    }), 201


# ── Silent Confidence Confirmation: POST /api/ghosts/confirm ────────────────

@admin_bp.route("/api/ghosts/confirm", methods=["POST"])
def api_confirm_ghost():
    """
    Called when users react (👍, +1, "same", "vouch") in WhatsApp.
    Increments confidence/confirmations and records group participation without needing a new post.
    """
    data = request.get_json(force=True, silent=True) or {}
    echo_id = data.get("echo_id")
    group_name = data.get("group_name", "")
    query = (data.get("query") or data.get("transcript") or "").strip()

    from database.db import increment_confirmation

    target_id = None
    if echo_id:
        target_id = int(echo_id)
    elif query:
        # Match nearest echo
        from services.search import semantic_search
        matches = semantic_search(query, threshold=0.75, top_k=1, log=False)
        if matches:
            target_id = matches[0]["id"]

    if not target_id:
        return jsonify({"status": "not_found", "message": "No matching Echo found to confirm"}), 404

    stats = increment_confirmation(target_id, group_name=group_name)
    print(f"[API] Silent confidence confirmation recorded for Echo #{target_id} (+1 from {group_name or 'group'})")

    return jsonify({
        "status": "confirmed",
        "echo_id": target_id,
        "confirmations": stats["confirmations"],
        "group_count": stats["group_count"],
        "group_names": stats["group_names"],
        "message": "Silent confirmation recorded!",
    }), 200


# ── 1-Click Web Re-verification: POST /api/echoes/<id>/reverify ──────────────

@admin_bp.route("/api/echoes/<int:echo_id>/reverify", methods=["POST"])
def api_reverify_echo(echo_id):
    """Allows students/seniors on the site to mark an older Echo as 'Still True' with 1 click."""
    from database.db import increment_confirmation, get_echo_by_id
    from services.memory_health import compute_health

    echo = get_echo_by_id(echo_id)
    if not echo:
        return jsonify({"error": "Echo not found"}), 404

    stats = increment_confirmation(echo_id, group_name="Web Verified")
    updated_echo = get_echo_by_id(echo_id)
    health = compute_health(updated_echo)

    return jsonify({
        "status": "reverified",
        "echo_id": echo_id,
        "health": health,
        "message": "Marked as Still True! Freshness restored.",
    }), 200


# ── Recent echoes feed (for live UI polling) ────────────────────────────────

@admin_bp.route("/api/echoes/recent", methods=["GET"])
def api_recent_echoes():
    """Returns the 10 most recently added echoes (for live feed on the website)."""
    echoes = get_all_echoes()
    recent = []
    from services.memory_health import compute_health
    for e in echoes[:10]:
        h = compute_health(e)
        recent.append({
            "id": e["id"],
            "course_tag": e.get("course_tag", ""),
            "topic_tag": e.get("topic_tag", ""),
            "transcript": (e.get("transcript") or "")[:120],
            "source": e.get("source", "web"),
            "question_context": e.get("question_context", ""),
            "group_count": h.get("group_count", 1),
            "cross_group_label": h.get("cross_group_label"),
            "is_whatsapp_stale": h.get("is_whatsapp_stale", False),
            "stale_warning": h.get("stale_warning"),
            "created_at": e.get("created_at", ""),
        })
    return jsonify(recent), 200


# ── QR Code generation (JIT Handover) ──────────────────────────────────────

@admin_bp.route("/qr/<int:echo_id>", methods=["GET"])
def generate_qr(echo_id):
    """Generate a QR code image for a specific Echo."""
    try:
        import qrcode
        from qrcode.image.pil import PilImage

        # Build the URL for this Echo
        host = request.host_url.rstrip("/")
        echo_url = f"{host}/echoes/{echo_id}"

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(echo_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#7C3AED", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        return send_file(buf, mimetype="image/png",
                         download_name=f"echo_{echo_id}_qr.png")
    except ImportError:
        return jsonify({"error": "qrcode package not installed. Run: pip install qrcode[pil]"}), 500


# ── Seed demo data ──────────────────────────────────────────────────────────

SEED_DATA = [
    {
        "course_tag": "CS301",
        "professor_tag": "Prof. Mehta",
        "topic_tag": "exams",
        "transcript": "Prof. Mehta recycles past paper questions almost verbatim. Get the last 5 years of question papers from the library database — they don't advertise it but it's free to access with your student ID. Focus on dynamic programming and graph traversal, those are his favourite topics."
    },
    {
        "course_tag": "CS301",
        "professor_tag": "Prof. Mehta",
        "topic_tag": "grading",
        "transcript": "Mehta's grading is actually quite fair but he's strict on code style. He deducts marks for missing comments and inconsistent indentation. Write your variable names like you're writing documentation — be verbose, he respects it."
    },
    {
        "course_tag": "EC202",
        "professor_tag": "Prof. Sharma",
        "topic_tag": "attendance",
        "transcript": "Sharma marks attendance at the START of class, not the end. A lot of people miss this and lose attendance marks even if they come 5 minutes late. Set your alarm early. Also he doesn't take proxy — he knows everyone by face by week 3."
    },
    {
        "course_tag": "EC202",
        "professor_tag": "Prof. Sharma",
        "topic_tag": "lab",
        "transcript": "The EC202 lab computers crash if you run simulations above 10,000 samples. Save your work every 15 minutes. The lab assistant told me the university IT hasn't updated the RAM in 3 years. Use your own laptop with the USB boot image if possible."
    },
    {
        "course_tag": "MATH101",
        "professor_tag": "Prof. Joshi",
        "topic_tag": "exams",
        "transcript": "Joshi's midterm is not from the textbook. She writes completely original problems. The only way to prepare is to do every assignment problem because she reuses her own assignment formats in exams. Don't bother memorising theorems without understanding proofs."
    },
    {
        "course_tag": "MATH101",
        "professor_tag": "Prof. Joshi",
        "topic_tag": "office hours",
        "transcript": "Joshi's office hours are genuinely the most useful resource in the course. She'll basically solve any doubt if you show up having attempted the problem yourself. Go on Tuesdays — Fridays she's in faculty meetings and cuts it short."
    },
    {
        "course_tag": "PHY103",
        "professor_tag": "Prof. Kulkarni",
        "topic_tag": "practicals",
        "transcript": "The PHY103 practical viva is worth 30% and most people under-prepare for it. Kulkarni asks you to explain the theory of every single experiment, not just how to operate the equipment. Prepare a one-page theory summary for each practical in advance."
    },
    {
        "course_tag": "portal",
        "professor_tag": "",
        "topic_tag": "registration",
        "transcript": "The student portal almost always crashes during exam registration week — especially on the last day. Register on day 1 of the window opening. I tried to change my elective on deadline day last semester and the portal was down for 6 hours straight."
    },
    {
        "course_tag": "portal",
        "professor_tag": "",
        "topic_tag": "grades",
        "transcript": "Grade submission by professors happens late — usually 2 to 3 weeks after the deadline. Don't panic if your grades don't show up in the portal right after results day. The portal shows a dash, not zero, for pending grades. Zero means something actually went wrong."
    },
    {
        "course_tag": "CS401",
        "professor_tag": "Prof. Rathore",
        "topic_tag": "project",
        "transcript": "For the CS401 capstone project, Rathore cares way more about the problem framing and impact than the technical complexity. A simple ML model with a well-defined real-world problem beats a complicated system with a vague use case. Lead with 'why this matters' in your presentation."
    },
    {
        "course_tag": "CS401",
        "professor_tag": "Prof. Rathore",
        "topic_tag": "plagiarism",
        "transcript": "Rathore runs all code through a plagiarism checker that checks against GitHub repos too. Don't copy from public repositories. You can use open source libraries but you cannot copy core project logic. One team got zero in 2023 for this."
    },
    {
        "course_tag": "hostel",
        "professor_tag": "",
        "topic_tag": "wifi",
        "transcript": "Hostel wifi is strongest on floors 2 and 3 of Block B — avoid Block A if you need to do anything API-heavy or video calls. The router in Block A hasn't been replaced in years. Also wifi drops every night between 1am and 1:30am for maintenance."
    },
    {
        "course_tag": "library",
        "professor_tag": "",
        "topic_tag": "resources",
        "transcript": "The library has free access to IEEE Xplore and ACM Digital Library through the institutional login. Most juniors don't know the credentials are on the library website under 'E-Resources'. You need to be on campus wifi or use the VPN client they provide."
    },
    {
        "course_tag": "CS301",
        "professor_tag": "Prof. Mehta",
        "topic_tag": "assignments",
        "transcript": "Mehta gives extensions if you email him before the deadline, not after. He's very responsive on email — usually replies within 2 hours. Never ask for extension after you've already missed it, he'll say no every time. Subject line should be professional."
    },
    {
        "course_tag": "internship",
        "professor_tag": "",
        "topic_tag": "placement",
        "transcript": "Placement season starts in August for December grad. The TPO portal opens for profile submission in July — fill it out the day it opens, the shortlisting algorithm considers profile completeness as a factor. Also get your CGPA certified by the academic section before July, companies ask for it instantly."
    },
]


@admin_bp.route("/seed", methods=["POST"])
def seed_data():
    """Seed the database with demo Echoes. Dev/demo use only."""
    inserted = 0
    skipped = 0

    for item in SEED_DATA:
        try:
            transcript = item["transcript"]
            embedding = embed_text(transcript)
            insert_echo(
                course_tag=item["course_tag"],
                professor_tag=item.get("professor_tag", ""),
                topic_tag=item.get("topic_tag", ""),
                transcript=transcript,
                audio_path="",  # No audio for seed data
                embedding=embedding,
            )
            inserted += 1
        except Exception as e:
            print(f"[Seed] Failed to insert echo: {e}")
            skipped += 1

    return jsonify({
        "status": "done",
        "inserted": inserted,
        "skipped": skipped,
        "message": f"Seeded {inserted} Echoes ({skipped} skipped due to errors)."
    }), 200
