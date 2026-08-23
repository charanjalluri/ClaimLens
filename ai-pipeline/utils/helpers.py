"""
ClaimLens AI Pipeline — Utility Helpers
========================================
File handling, validation, and shared utilities.
"""
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)


def generate_claim_id(prefix: str = "CLM") -> str:
    """Generate a unique claim ID if none was provided."""
    import uuid
    short_id = uuid.uuid4().hex[:8].upper()
    return f"{prefix}-{short_id}"


def sanitize_claim_id(claim_id: str) -> str:
    """Sanitize a claim ID to remove any dangerous characters."""
    return re.sub(r"[^A-Za-z0-9\-_]", "", claim_id)[:50]


def validate_image_bytes(image_bytes: bytes) -> bool:
    """Check that bytes look like a valid image (JPEG or PNG magic bytes)."""
    if not image_bytes or len(image_bytes) < 8:
        return False
    # JPEG: starts with FF D8 FF
    # PNG:  starts with 89 50 4E 47
    return (
        image_bytes[:3] == b"\xff\xd8\xff"  # JPEG
        or image_bytes[:4] == b"\x89PNG"     # PNG
        or image_bytes[:4] == b"RIFF"        # WEBP (RIFF container)
    )


def validate_audio_bytes(audio_bytes: bytes) -> bool:
    """Basic validation that bytes could be an audio file."""
    if not audio_bytes or len(audio_bytes) < 4:
        return False
    # MP3: ID3 or 0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xF2
    # WAV: RIFF
    # M4A: starts with ftyp at offset 4 typically
    return len(audio_bytes) > 100  # Anything >100 bytes is plausibly audio


def format_processing_time(start_ms: float, end_ms: float) -> int:
    """Return integer milliseconds between two time.time() calls."""
    return int((end_ms - start_ms) * 1000)


def get_env_or_raise(key: str) -> str:
    """Get an env var or raise a clear error."""
    val = os.environ.get(key)
    if not val:
        raise EnvironmentError(
            f"Required environment variable '{key}' is not set. "
            f"Copy .env.example to .env and fill in the value."
        )
    return val
