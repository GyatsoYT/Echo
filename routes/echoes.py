import os
import uuid
import numpy as np
from flask import Blueprint, request, jsonify, render_template, redirect, url_for, flash
from database.db import insert_echo, get_all_echoes, get_echo_by_id, delete_echo, increment_confirmation
from services.transcription import transcribe_audio, TranscriptionError
from services.embeddings import embed_text
from services.memory_health import compute_health, enrich_echoes_with_health
from config import Config

echoes_bp = Blueprint("echoes", __name__)

ALLOWED_EXTENSIONS = {".webm", ".mp3", ".mp4", ".wav", ".ogg", ".m4a", ".flac"}

def _save_audio(file_obj) -> tuple[str, str]:
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    ext = os.path.splitext(file_obj.filename)[1].lower() or ".webm"
    filename = f"{uuid.uuid4().hex}{ext}"
    abs_path = os.path.join(Config.UPLOAD_FOLDER, filename)
    file_obj.save(abs_path)
    rel_url = f"audio/{filename}"
    return abs_path, rel_url

def _check_near_duplicate(new_embedding: list[float], new_course: str, threshold: float = 0.92) -> int | None:
    from services.search import cosine_similarity
    new_vec = np.array(new_embedding, dtype=np.float32)
    existing = get_all_echoes()
    for echo in existing:
        if echo.get("course_tag", "").lower() != new_course.lower():
            continue
        existing_vec = echo["embedding"]
        if existing_vec.shape != new_vec.shape:
            continue
        sim = cosine_similarity(new_vec, existing_vec)
        if sim >= threshold:
            return echo["id"]
    return None

@echoes_bp.route("/record", methods=["GET"])
def record_page():
    return render_template("record.html")

@echoes_bp.route("/record", methods=["POST"])
def submit_recording():
    course_tag = request.form.get("course_tag", "").strip()
    professor_tag = request.form.get("professor_tag", "").strip()
    topic_tag = request.form.get("topic_tag", "").strip()
    manual_transcript = request.form.get("manual_transcript", "").strip()

    if not course_tag:
        return jsonify({"error": "Course tag is required"}), 400

    audio_file = request.files.get("audio") or request.files.get("recorded_audio") or request.files.get("uploaded_audio")
    transcript = ""
    audio_path_rel = ""

    if audio_file and audio_file.filename:
        abs_path, audio_path_rel = _save_audio(audio_file)
        if not manual_transcript:
            try:
                transcript = transcribe_audio(abs_path)
            except TranscriptionError as e:
                return jsonify({
                    "status": "needs_transcript",
                    "message": str(e),
                    "audio_path": audio_path_rel,
                }), 200
        else:
            transcript = manual_transcript
    elif manual_transcript:
        transcript = manual_transcript
        audio_path_rel = ""
    else:
        return jsonify({"error": "Provide either an audio recording or a typed transcript"}), 400

    if not transcript:
        return jsonify({"error": "Transcript is empty"}), 400

    embedding = embed_text(transcript)
    dup_id = _check_near_duplicate(embedding, course_tag)
    if dup_id:
        increment_confirmation(dup_id)
        return jsonify({
            "status": "confirmed",
            "echo_id": dup_id,
            "message": "An existing Echo covers the same ground. Confirmation count bumped!",
            "transcript": transcript,
        }), 200

    echo_id = insert_echo(
        course_tag=course_tag,
        professor_tag=professor_tag,
        topic_tag=topic_tag,
        transcript=transcript,
        audio_path=audio_path_rel,
        embedding=embedding,
    )

    return jsonify({
        "status": "created",
        "echo_id": echo_id,
        "transcript": transcript,
        "message": "Echo saved successfully!",
    }), 201

@echoes_bp.route("/echoes", methods=["GET"])
def browse_echoes():
    echoes = get_all_echoes()
    echoes = enrich_echoes_with_health(echoes)
    for e in echoes:
        e.pop("embedding", None)
    return render_template("echoes.html", echoes=echoes)

@echoes_bp.route("/echoes/<int:echo_id>", methods=["GET"])
def echo_detail(echo_id):
    echo = get_echo_by_id(echo_id)
    if not echo:
        flash("Echo not found.", "error")
        return redirect(url_for("echoes.browse_echoes"))
    echo["health"] = compute_health(echo)
    echo.pop("embedding", None)
    return render_template("echo_detail.html", echo=echo)

@echoes_bp.route("/echoes/<int:echo_id>/delete", methods=["POST"])
def delete_echo_route(echo_id):
    delete_echo(echo_id)
    flash("Echo deleted.", "info")
    return redirect(url_for("echoes.browse_echoes"))
