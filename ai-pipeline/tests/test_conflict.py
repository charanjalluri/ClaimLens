"""
ClaimLens AI Pipeline — Conflict Detection Tests
=================================================
Tests for the core conflict detection engine.
Run with: pytest tests/test_conflict.py -v

These tests use mocked Gemini responses so they run without an API key.
"""
import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestConflictDetector:

    @patch("pipeline.conflict_detector.genai")
    def test_prd_test_case_bumper_vs_windshield(self, mock_genai):
        """
        PRD Test Case:
          Text:  'My front bumper is damaged.'
          Voice: 'My windshield was completely broken.'
          Image: 'Front bumper damage visible.'
          Expected: conflictDetected=True, conflictType=damage_location
        """
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "conflictDetected": True,
            "confidence": 0.91,
            "conflictType": "damage_location",
            "evidenceA": "Photo shows front bumper damage",
            "evidenceB": "Voice states windshield is broken",
            "explanation": (
                "The visual and voice evidence describe different damaged components. "
                "The photo clearly shows front bumper impact damage while the voice "
                "recording describes a broken windshield — these are mutually exclusive injury locations."
            ),
            "status": "unresolved",
        })
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types = MagicMock()

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-001",
            claim_text="My front bumper is damaged.",
            transcription="My windshield was completely broken.",
            image_analysis="Front bumper shows significant impact damage with paint scraping. Location: front.",
        )

        assert result["conflictDetected"] is True
        assert result["confidence"] >= 0.8
        assert result["conflictType"] == "damage_location"
        assert result["status"] == "unresolved"
        assert "windshield" in result["evidenceB"].lower() or "bumper" in result["evidenceA"].lower()

    @patch("pipeline.conflict_detector.genai")
    def test_no_conflict_consistent_evidence(self, mock_genai):
        """When all evidence agrees, conflict should not be detected."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "conflictDetected": False,
            "confidence": 0.95,
            "conflictType": "none",
            "evidenceA": None,
            "evidenceB": None,
            "explanation": "All evidence consistently describes front bumper damage.",
            "status": "clear",
        })
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types = MagicMock()

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-002",
            claim_text="My front bumper is damaged.",
            transcription="The front bumper got hit.",
            image_analysis="Front bumper shows dent and paint damage. Location: front.",
        )

        assert result["conflictDetected"] is False
        assert result["conflictType"] == "none"
        assert result["status"] == "clear"
        assert result["confidence"] >= 0.8

    def test_insufficient_evidence_single_source(self):
        """With only one evidence source, should return insufficient_evidence."""
        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-003",
            claim_text="My car is damaged.",
            transcription=None,
            image_analysis=None,
        )

        assert result["conflictDetected"] is False
        assert result["status"] == "insufficient_evidence"
        assert result["confidence"] <= 0.5

    @patch("pipeline.conflict_detector.genai")
    def test_severity_conflict_detected(self, mock_genai):
        """Test detection of severity mismatch."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "conflictDetected": True,
            "confidence": 0.85,
            "conflictType": "damage_severity",
            "evidenceA": "Voice describes total loss: car is completely destroyed",
            "evidenceB": "Photo shows only a minor scratch on the door panel",
            "explanation": (
                "The voice recording dramatically overstates the damage severity. "
                "While the claimant claims total vehicle loss, the photo shows only a minor scratch."
            ),
            "status": "unresolved",
        })
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types = MagicMock()

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-004",
            claim_text="My car is badly damaged.",
            transcription="The car is completely destroyed, it's a total loss.",
            image_analysis="Minor scratch visible on driver-side door panel. Severity: minor.",
        )

        assert result["conflictDetected"] is True
        assert result["conflictType"] == "damage_severity"

    @patch("pipeline.conflict_detector.genai")
    def test_confidence_clamped_to_valid_range(self, mock_genai):
        """Gemini sometimes returns confidence > 1 — ensure it's clamped."""
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "conflictDetected": True,
            "confidence": 1.5,  # Invalid — above 1.0
            "conflictType": "damage_location",
            "evidenceA": "A",
            "evidenceB": "B",
            "explanation": "Test explanation",
            "status": "unresolved",
        })
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types = MagicMock()

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-005",
            claim_text="Test claim",
            transcription="Some transcription",
            image_analysis="Some image analysis",
        )

        assert result["confidence"] <= 1.0
        assert result["confidence"] >= 0.0

    @patch("pipeline.conflict_detector.genai")
    def test_gemini_api_exception_propagates(self, mock_genai):
        """If Gemini API fails, the exception should propagate for the route to handle."""
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("Gemini API unavailable")
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types = MagicMock()

        from pipeline.conflict_detector import detect_conflicts
        with pytest.raises(Exception, match="Gemini API unavailable"):
            detect_conflicts(
                claim_id="CLM-006",
                claim_text="Test",
                transcription="Test voice",
                image_analysis="Test image",
            )


# ─── FastAPI Integration Tests ────────────────────────────────────────────────

class TestAPIRoute:
    """Integration tests for the /api/v1/analyze endpoint using FastAPI TestClient."""

    def _get_client(self):
        """Create a test client — set a fake API key so the app starts."""
        os.environ.setdefault("GEMINI_API_KEY", "test-key-fake")
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)

    def test_health_endpoint(self):
        client = self._get_client()
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "whisperModel" in data
        assert "geminiModel" in data

    @patch("pipeline.conflict_detector.genai")
    @patch("pipeline.image_analyzer.genai")
    @patch("pipeline.transcriber._get_model")
    def test_analyze_endpoint_text_only(self, mock_whisper, mock_img_genai, mock_conf_genai):
        """Test /analyze with only claim text (no file uploads)."""
        # Mock conflict detection
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "conflictDetected": False,
            "confidence": 0.4,
            "conflictType": "none",
            "evidenceA": None,
            "evidenceB": None,
            "explanation": "Only one evidence source provided — cannot determine conflict.",
            "status": "insufficient_evidence",
        })
        mock_model_conf = MagicMock()
        mock_model_conf.generate_content.return_value = mock_response
        mock_conf_genai.GenerativeModel.return_value = mock_model_conf
        mock_conf_genai.types = MagicMock()

        client = self._get_client()
        response = client.post(
            "/api/v1/analyze",
            data={"claim_id": "CLM-TEST-001", "claim_text": "My front bumper is damaged."},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["claimId"] == "CLM-TEST-001"
        assert "conflictDetected" in data
        assert "confidence" in data
        assert "processingTimeMs" in data

    @patch("pipeline.conflict_detector.genai")
    def test_analyze_endpoint_missing_claim_text_returns_422(self, mock_genai):
        """Claim text is required — should return 422 if missing."""
        client = self._get_client()
        response = client.post("/api/v1/analyze", data={})
        assert response.status_code == 422  # Unprocessable Entity
