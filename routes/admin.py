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
