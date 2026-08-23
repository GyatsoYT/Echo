import os
import io
import json
from flask import Blueprint, render_template, jsonify, send_file, current_app, request, flash, redirect, url_for
from database.db import get_knowledge_gaps, get_search_stats, get_all_echoes, insert_echo, get_db
from services.embeddings import embed_text
from services.memory_health import enrich_echoes_with_health

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/gaps", methods=["GET"])
def knowledge_gaps():
    active_gaps, resolved_gaps = get_knowledge_gaps()
    stats = get_search_stats()
    return render_template("gaps.html", gaps=active_gaps, resolved_gaps=resolved_gaps, stats=stats)

@admin_bp.route("/api/stats", methods=["GET"])
def api_stats():
    stats = get_search_stats()
    return jsonify(stats), 200

@admin_bp.route("/api/ghosts", methods=["POST"])
def api_create_ghost():
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

    from routes.echoes import _check_near_duplicate
    dup_id = _check_near_duplicate(embedding, course_tag, threshold=0.85)
    if not dup_id and course_tag.lower() == "general":
        dup_id = _check_near_duplicate(embedding, "general", threshold=0.85)

    if dup_id:
        from database.db import increment_confirmation
        stats = increment_confirmation(dup_id, group_name=group_name)
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

    return jsonify({
        "status": "created",
        "echo_id": echo_id,
        "group_name": group_name,
        "message": "Echo captured from WhatsApp and saved!",
    }), 201

@admin_bp.route("/api/ghosts/confirm", methods=["POST"])
def api_confirm_ghost():
    data = request.get_json(force=True, silent=True) or {}
    echo_id = data.get("echo_id")
    group_name = data.get("group_name", "")
    query = (data.get("query") or data.get("transcript") or "").strip()

    from database.db import increment_confirmation

    target_id = None
    if echo_id:
        target_id = int(echo_id)
    elif query:
        from services.search import semantic_search
        matches = semantic_search(query, threshold=0.75, top_k=1, log=False)
        if matches:
            target_id = matches[0]["id"]

    if not target_id:
        return jsonify({"status": "not_found", "message": "No matching Echo found to confirm"}), 404

    stats = increment_confirmation(target_id, group_name=group_name)

    return jsonify({
        "status": "confirmed",
        "echo_id": target_id,
        "confirmations": stats["confirmations"],
        "group_count": stats["group_count"],
        "group_names": stats["group_names"],
        "message": "Silent confirmation recorded!",
    }), 200

@admin_bp.route("/api/echoes/<int:echo_id>/reverify", methods=["POST"])
def api_reverify_echo(echo_id):
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

@admin_bp.route("/api/echoes/recent", methods=["GET"])
def api_recent_echoes():
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

_BOT_STATE = {
    "qr": None,
    "status": "waiting",
    "updated_at": None,
}

@admin_bp.route("/api/bot/qr", methods=["POST"])
def api_receive_bot_qr():
    data = request.get_json(force=True, silent=True) or {}
    _BOT_STATE["qr"] = data.get("qr")
    _BOT_STATE["status"] = data.get("status", "waiting")
    from datetime import datetime
    _BOT_STATE["updated_at"] = datetime.now().strftime("%H:%M:%S")
    return jsonify({"status": "received"}), 200

@admin_bp.route("/api/bot/qr/image", methods=["GET"])
def bot_qr_image():
    import qrcode
    qr_str = _BOT_STATE.get("qr")
    if not qr_str:
        qr_str = "https://github.com"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#000000", back_color="#FFFFFF")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")

@admin_bp.route("/bot/qr", methods=["GET"])
def view_bot_qr():
    return render_template(
        "bot_qr.html",
        has_qr=bool(_BOT_STATE.get("qr")),
        status=_BOT_STATE.get("status", "waiting"),
        updated_at=_BOT_STATE.get("updated_at", "Just now"),
    )

@admin_bp.route("/qr/<int:echo_id>", methods=["GET"])
def generate_qr(echo_id):
    try:
        import qrcode
        from qrcode.image.pil import PilImage

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
        img = qr.make_image(fill_color="#E05A3A", back_color="#1F2127")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        return send_file(buf, mimetype="image/png",
                         download_name=f"sst_echo_{echo_id}_qr.png")
    except ImportError:
        return jsonify({"error": "qrcode package not installed. Run: pip install qrcode[pil]"}), 500

SEED_DATA = [
    {
        "course_tag": "CS & AI",
        "professor_tag": "Anshuman Singh & Team",
        "topic_tag": "DSA & Algorithms",
        "transcript": "For Year 1 CS & AI, don't rush through syntax. Anshuman's problem sets prioritize time complexity optimization and algorithmic problem solving from day one. Master Java fundamentals and tree traversals before the first internal benchmark."
    },
    {
        "course_tag": "Dual Degree",
        "professor_tag": "IIT Madras BS Pathway",
        "topic_tag": "Exams & Deadlines",
        "transcript": "Balancing SST project sprints with IIT Madras BS Data Science: IITM weekly graded assignments are due every Wednesday night. Finish them on Tuesday so you don't get trapped when SST 48-hour hackathon sprints kick off on Thursday."
    },
    {
        "course_tag": "Dual Degree",
        "professor_tag": "BITS Pilani BSc Route",
        "topic_tag": "Midterm Schedule",
        "transcript": "For the BITS Pilani BSc Hons CS pathway: BITS proctored exams happen twice a semester. File your attendance exemption on SST Dashboard with your Batch Success Manager (BSM) at least 10 days in advance to get PDC credit waivers."
    },
    {
        "course_tag": "Innovation Lab",
        "professor_tag": "SIL Mentors & Shark Tank",
        "topic_tag": "Hardware & AI Wearables",
        "transcript": "Scaler Innovation Lab (SIL) supports deep-tech startups like NeoSapiens (AI wearable pendant funded on Shark Tank India) and Percevia (AI glasses). If you need 3D printing or GPU clusters, submit your hardware bill of materials to SIL mentors on Monday mornings."
    },
    {
        "course_tag": "Academic Integrity",
        "professor_tag": "Evaluation Committee",
        "topic_tag": "Plagiarism & Code Checkers",
        "transcript": "SST uses automated AST-level code similarity checkers across all DSA and web development assignments. Do NOT share your GitHub repos or copy logic from batchmates — during the 61-student plagiarism incident, all caught submissions were assigned zero with CGR penalties. Write original implementations."
    },
    {
        "course_tag": "AI & Business",
        "professor_tag": "Vidit Jain & SIL",
        "topic_tag": "Startup Incubation",
        "transcript": "In the AI & Business track, your 6-month startup incubation is evaluated on actual customer discovery, first-principles product thinking, and MRR. When pitching for the ₹2 Crore seed fund, show working user metrics and revenue over theoretical slides."
    },
    {
        "course_tag": "Internships",
        "professor_tag": "Industry Immersion",
        "topic_tag": "Singapore & Global Roles",
        "transcript": "International internships (like Singapore ₹2L/month in Scala/Backend and Apple Academy Bali): Companies look for deep backend mastery and open-source contributions. Kanan Arora and Sourashis Sarkar proved that building full-stack production systems beats simple class projects."
    },
    {
        "course_tag": "Open Source",
        "professor_tag": "Competitive Coding Club",
        "topic_tag": "GSoC & ICPC",
        "transcript": "SST had 14 students selected for GSoC 2026. Start reaching out to open-source maintainers by November. Seniors in the Competitive Coding and Open Source clubs do peer proposal reviews in the hostel common room every weekend."
    },
    {
        "course_tag": "SST Dashboard",
        "professor_tag": "Academic Office",
        "topic_tag": "CGR & Attendance",
        "transcript": "Keep a close eye on your CGR trends and PDC credits on sst-dashboard.com. If you represent SST at an external hackathon (like Smart India Hackathon or Meta PyTorch OpenEnv), submit your proof within 48 hours for immediate session-level attendance exemption."
    },
    {
        "course_tag": "Campus Life",
        "professor_tag": "404 Media & Council",
        "topic_tag": "Odyssey & Rise Up",
        "transcript": "Balance your intense coding sprints with campus community life. Events like Rise Up freshers, 404 Media Club podcast productions, and writing for Odyssey magazine are where you build lifelong founder networks with your batchmates."
    },
    {
        "course_tag": "Math & ML",
        "professor_tag": "Shivank Agrawal",
        "topic_tag": "Linear Algebra & Micro MBA",
        "transcript": "First year is intense with DSA + Web Dev + Linear Algebra + Micro MBA running concurrently. Don't fall behind in linear algebra matrix decompositions — it is the core foundation for machine learning backpropagation and attention mechanisms in Year 2."
    },
    {
        "course_tag": "Placements",
        "professor_tag": "Industry Super Mentors",
        "topic_tag": "MAANG & AI Roles",
        "transcript": "55%+ of SST early placement offers are AI-specific roles with ₹21 LPA average CTC. Practice explaining both low-level algorithmic proofs and transformer attention mechanisms in the 1:1 Super Mentor mock interview rounds."
    }
]

@admin_bp.route("/seed", methods=["POST"])
def seed_data():
    inserted = 0
    skipped = 0

    with get_db() as conn:
        conn.execute("DELETE FROM echoes")
        conn.execute("DELETE FROM searches")

    INITIAL_SEARCHES = [
        ("How to balance IIT Madras BS assignments with SST project sprints?", 0.94),
        ("GPU cluster access and PyTorch setup in SIL Innovation Lab", 0.90),
        ("How strict are code plagiarism checkers at SST?", 0.92),
        ("How did 14 SST students get selected for GSoC 2026?", 0.91),
        ("Best strategy for 2 Crore seed funding in AI and Business track", 0.88),
        ("How to get selected for Apple Academy in Bali as an SST student?", 0.89),
        ("How to prepare for Smart India Hackathon with Team AntarDrishti?", 0.85),
        ("Can we get proxy attendance from Batch Success Managers for hackathons?", 0.0),
        ("How to connect external microcontrollers to hostel LAN?", 0.0),
        ("Which electives in IIT Madras BS have the lowest grading curves?", 0.0),
        ("How does the 404 Media Club select camera crew and podcast hosts?", 0.0),
    ]

    with get_db() as conn:
        for q, score in INITIAL_SEARCHES:
            conn.execute("INSERT INTO searches (query_text, best_match_score) VALUES (?, ?)", (q, score if score > 0 else None))

    for item in SEED_DATA:
        try:
            transcript = item["transcript"]
            embedding = embed_text(transcript)
            insert_echo(
                course_tag=item["course_tag"],
                professor_tag=item.get("professor_tag", ""),
                topic_tag=item.get("topic_tag", ""),
                transcript=transcript,
                audio_path="",
                embedding=embedding,
            )
            inserted += 1
        except Exception:
            skipped += 1

    return jsonify({
        "status": "done",
        "inserted": inserted,
        "skipped": skipped,
        "message": f"Successfully loaded {inserted} authentic Scaler School of Technology (SST) campus memories and knowledge gaps."
    }), 200
