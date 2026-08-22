"""
services/transcription.py
--------------------------
Transcribes audio files using Groq's hosted Whisper API.
Falls back gracefully if the API is unavailable.

Usage:
    from services.transcription import transcribe_audio
    text = transcribe_audio("/path/to/file.webm")
    # Returns a string, or raises TranscriptionError if both API and fallback fail.
"""

import os
from groq import Groq
from config import Config


class TranscriptionError(Exception):
    """Raised when transcription fails and no fallback is available."""
    pass


# Supported audio MIME types for Groq Whisper
SUPPORTED_FORMATS = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".m4a": "audio/m4a",
    ".flac": "audio/flac",
}


def transcribe_audio(audio_path: str) -> str:
    """
    Transcribe an audio file using Groq Whisper.

    Args:
        audio_path: Absolute path to the audio file.

    Returns:
        Transcribed text string.

    Raises:
        TranscriptionError: If transcription fails and no fallback available.
    """
    if not Config.GROQ_API_KEY:
        raise TranscriptionError(
            "GROQ_API_KEY not set. Add it to your .env file."
        )

    ext = os.path.splitext(audio_path)[1].lower()
    mime_type = SUPPORTED_FORMATS.get(ext, "audio/webm")

    try:
        client = Groq(api_key=Config.GROQ_API_KEY)
        with open(audio_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=(os.path.basename(audio_path), audio_file, mime_type),
                model=Config.GROQ_WHISPER_MODEL,
                response_format="text",
                language="en",
            )
        # Groq returns the text directly when response_format="text"
        transcript = response if isinstance(response, str) else response.text
        return transcript.strip()

    except Exception as exc:
        raise TranscriptionError(
            f"Groq Whisper transcription failed: {exc}"
        ) from exc
