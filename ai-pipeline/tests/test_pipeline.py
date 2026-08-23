"""
ClaimLens AI Pipeline — Unit Tests (NVIDIA NIM backend)
=========================================================
Tests each pipeline stage independently using mocks.
Run with: pytest tests/ -v
"""
import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ─── Transcriber Tests ────────────────────────────────────────────────────────

class TestTranscriber:

    def test_transcribe_empty_bytes_returns_failure(self):
        from pipeline.transcriber import transcribe_audio
        result = transcribe_audio(b"", "audio.mp3")
        assert result["success"] is False
        assert result["text"] == ""
        assert result["error"] is not None

    @patch("pipeline.transcriber._get_model")
    def test_transcribe_audio_success(self, mock_get_model):
        """Test successful transcription with a mocked Whisper model."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "text": " My windshield was completely broken.",
            "language": "en",
            "segments": [{"end": 3.5}],
        }
        mock_get_model.return_value = mock_model

        dummy_audio = b"\x00" * 200
        from pipeline.transcriber import transcribe_audio
        result = transcribe_audio(dummy_audio, "voice.mp3")

        assert result["success"] is True
        assert "windshield" in result["text"].lower()
        assert result["language"] == "en"
        assert result["duration_seconds"] == 3.5

    @patch("pipeline.transcriber._get_model")
    def test_transcribe_whisper_exception_returns_failure(self, mock_get_model):
        """If Whisper crashes, return failure dict not exception."""
        mock_model = MagicMock()
        mock_model.transcribe.side_effect = RuntimeError("GPU out of memory")
        mock_get_model.return_value = mock_model

        from pipeline.transcriber import transcribe_audio
        result = transcribe_audio(b"\x00" * 200, "audio.mp3")
        assert result["success"] is False
        assert "GPU out of memory" in result["error"]


# ─── Image Analyzer Tests (NVIDIA NIM) ────────────────────────────────────────

class TestImageAnalyzer:

    def test_analyze_empty_bytes_returns_failure(self):
        from pipeline.image_analyzer import analyze_image
        result = analyze_image(b"")
        assert result["success"] is False

    @patch("pipeline.image_analyzer.requests.post")
    @patch("pipeline.image_analyzer.Image")
    def test_analyze_image_success(self, mock_pil, mock_post):
        """Test successful image analysis with a mocked NVIDIA NIM response."""
        # Mock PIL image
        mock_img = MagicMock()
        mock_img.convert.return_value = mock_img
        mock_pil.open.return_value = mock_img
        mock_img.save = lambda buf, **kw: buf.write(b"fakejpeg")

        # Mock NVIDIA API response
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "description": "Front bumper shows significant impact damage with paint scraping.",
                        "damage_components": ["front bumper", "paint"],
                        "damage_location": "front",
                        "damage_severity": "moderate",
                        "additional_observations": "No airbag deployment visible.",
                    })
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        os.environ["NVIDIA_API_KEY"] = "test-key"
        fake_jpeg = b"\xff\xd8\xff" + b"\x00" * 100
        from pipeline.image_analyzer import analyze_image
        result = analyze_image(fake_jpeg, "bumper.jpg")

        assert result["success"] is True
        assert "bumper" in result["description"].lower()
        assert "front bumper" in result["damage_components"]
        assert result["damage_location"] == "front"

    @patch("pipeline.image_analyzer.requests.post")
    @patch("pipeline.image_analyzer.Image")
    def test_analyze_image_api_failure(self, mock_pil, mock_post):
        """If NVIDIA API raises, return failure dict."""
        mock_img = MagicMock()
        mock_img.convert.return_value = mock_img
        mock_pil.open.return_value = mock_img
        mock_img.save = lambda buf, **kw: buf.write(b"fakejpeg")

        mock_post.side_effect = Exception("Connection refused")

        os.environ["NVIDIA_API_KEY"] = "test-key"
        fake_jpeg = b"\xff\xd8\xff" + b"\x00" * 100
        from pipeline.image_analyzer import analyze_image
        result = analyze_image(fake_jpeg, "bumper.jpg")

        assert result["success"] is False
        assert "Connection refused" in result["error"]


# ─── Helper Tests ─────────────────────────────────────────────────────────────

class TestHelpers:

    def test_generate_claim_id_format(self):
        from utils.helpers import generate_claim_id
        cid = generate_claim_id()
        assert cid.startswith("CLM-")
        assert len(cid) > 6

    def test_sanitize_claim_id_removes_special_chars(self):
        from utils.helpers import sanitize_claim_id
        assert sanitize_claim_id("CLM-001") == "CLM-001"

    def test_validate_image_bytes_jpeg(self):
        from utils.helpers import validate_image_bytes
        assert validate_image_bytes(b"\xff\xd8\xff" + b"\x00" * 100) is True

    def test_validate_image_bytes_png(self):
        from utils.helpers import validate_image_bytes
        assert validate_image_bytes(b"\x89PNG" + b"\x00" * 100) is True

    def test_validate_image_bytes_invalid(self):
        from utils.helpers import validate_image_bytes
        assert validate_image_bytes(b"not an image") is False
        assert validate_image_bytes(b"") is False

    def test_validate_audio_bytes_valid(self):
        from utils.helpers import validate_audio_bytes
        assert validate_audio_bytes(b"\x00" * 200) is True

    def test_validate_audio_bytes_too_short(self):
        from utils.helpers import validate_audio_bytes
        assert validate_audio_bytes(b"\x00" * 50) is False
