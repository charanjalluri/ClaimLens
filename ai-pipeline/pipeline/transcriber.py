"""
ClaimLens AI Pipeline — Voice Transcription (Whisper)
======================================================
Converts audio evidence (mp3 / wav / m4a / ogg) to text
using OpenAI Whisper running locally (no API key required).

Model sizes vs speed (on CPU):
  tiny  : ~1s   — rough accuracy
  base  : ~3s   — good accuracy  ← default
  small : ~6s   — better accuracy
  medium: ~15s  — near-human accuracy
"""
import logging
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Lazy-load whisper so startup is fast even if torch is slow to import
_whisper_model = None


def _get_model(model_name: str = "base"):
    """Lazy-load and cache the Whisper model."""
    global _whisper_model
    if _whisper_model is None:
        import whisper  # type: ignore
        logger.info(f"Loading Whisper model '{model_name}' (first-time load)...")
        _whisper_model = whisper.load_model(model_name)
        logger.info("Whisper model loaded.")
    return _whisper_model


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.mp3", model_name: str = "base") -> dict:
    """
    Transcribe audio bytes to text using Whisper.

    Args:
        audio_bytes: Raw bytes of the audio file.
        filename:    Original filename (used to infer format).
        model_name:  Whisper model size (tiny/base/small/medium).

    Returns:
        dict with keys: text, language, duration_seconds, success, error
    """
    if not audio_bytes:
        return {
            "text": "",
            "language": None,
            "duration_seconds": None,
            "success": False,
            "error": "Empty audio data received",
        }

    # Determine file suffix from filename
    suffix = Path(filename).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mp4"}:
        suffix = ".mp3"  # fallback

    try:
        model = _get_model(model_name)

        # Write bytes to a temp file — Whisper needs a file path
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            logger.info(f"Transcribing audio file: {tmp_path} ({len(audio_bytes)} bytes)")
            result = model.transcribe(tmp_path, fp16=False)  # fp16=False for CPU
            text = result.get("text", "").strip()
            language = result.get("language", "en")

            # Estimate duration from segments if available
            segments = result.get("segments", [])
            duration = segments[-1]["end"] if segments else None

            logger.info(f"Transcription complete: '{text[:80]}...' " if len(text) > 80 else f"Transcription: '{text}'")
            return {
                "text": text,
                "language": language,
                "duration_seconds": duration,
                "success": True,
                "error": None,
            }
        finally:
            os.unlink(tmp_path)  # Clean up temp file

    except Exception as exc:
        logger.error(f"Whisper transcription failed: {exc}", exc_info=True)
        return {
            "text": "",
            "language": None,
            "duration_seconds": None,
            "success": False,
            "error": str(exc),
        }
