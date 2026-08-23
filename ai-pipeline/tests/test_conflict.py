"""
ClaimLens AI Pipeline — Conflict Detection Tests (NVIDIA NIM backend)
======================================================================
Tests for the core conflict detection engine.
Run with: pytest tests/test_conflict.py -v

Uses mocked requests.post — no real API key required.
"""
import json
import sys
import os
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set a fake key so the module doesn't raise on import
os.environ.setdefault("NVIDIA_API_KEY", "test-key-fake")


class TestConflictDetector:

    @patch("pipeline.conflict_detector.requests.post")
    def test_prd_test_case_bumper_vs_windshield(self, mock_post):
        """
        PRD Test Case:
          Text:  'My front bumper is damaged.'
          Voice: 'My windshield was completely broken.'
          Image: 'Front bumper damage visible.'
          Expected: conflictDetected=True, conflictType=damage_location
        """
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "conflictDetected": True,
                        "confidence": 0.91,
                        "conflictType": "damage_location",
                        "evidenceA": "Photo shows front bumper damage",
                        "evidenceB": "Voice states windshield is broken",
                        "explanation": (
                            "The visual and voice evidence describe different damaged components. "
                            "The photo clearly shows front bumper impact damage while the voice "
                            "recording describes a broken windshield."
                        ),
                        "status": "unresolved",
                    })
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-001",
            claim_text="My front bumper is damaged.",
            transcription="My windshield was completely broken.",
            image_analysis="Front bumper shows significant impact damage. Location: front.",
        )

        assert result["conflictDetected"] is True
        assert result["confidence"] >= 0.8
        assert result["conflictType"] == "damage_location"
        assert result["status"] == "unresolved"
        assert result["claimId"] == "CLM-001"

    @patch("pipeline.conflict_detector.requests.post")
    def test_no_conflict_consistent_evidence(self, mock_post):
        """When all evidence agrees, conflict should not be detected."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "conflictDetected": False,
                        "confidence": 0.95,
                        "conflictType": "none",
                        "evidenceA": None,
                        "evidenceB": None,
                        "explanation": "All evidence consistently describes front bumper damage.",
                        "status": "clear",
                    })
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-002",
            claim_text="My front bumper is damaged.",
            transcription="The front bumper got hit.",
            image_analysis="Front bumper shows dent. Location: front.",
        )

        assert result["conflictDetected"] is False
        assert result["conflictType"] == "none"
        assert result["status"] == "clear"

    def test_insufficient_evidence_single_source(self):
        """With only claim text (no voice/image), should return insufficient_evidence."""
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

    @patch("pipeline.conflict_detector.requests.post")
    def test_severity_conflict_detected(self, mock_post):
        """Test detection of severity mismatch."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": json.dumps({
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
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-004",
            claim_text="My car is badly damaged.",
            transcription="The car is completely destroyed, it's a total loss.",
            image_analysis="Minor scratch visible on driver-side door panel. Severity: minor.",
        )

        assert result["conflictDetected"] is True
        assert result["conflictType"] == "damage_severity"

    @patch("pipeline.conflict_detector.requests.post")
    def test_confidence_clamped_to_valid_range(self, mock_post):
        """Ensure confidence is clamped to [0.0, 1.0] even if model returns > 1."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "conflictDetected": True,
                        "confidence": 1.5,  # Invalid — above 1.0
                        "conflictType": "damage_location",
                        "evidenceA": "A",
                        "evidenceB": "B",
                        "explanation": "Test",
                        "status": "unresolved",
                    })
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-005",
            claim_text="Test",
            transcription="Some transcription",
            image_analysis="Some image analysis",
        )

        assert result["confidence"] <= 1.0
        assert result["confidence"] >= 0.0

    @patch("pipeline.conflict_detector.requests.post")
    def test_think_tags_stripped_before_json_parse(self, mock_post):
        """NVIDIA reasoning model may return <think>...</think> tags — they must be stripped."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{
                "message": {
                    "content": (
                        "<think>Let me compare bumper vs windshield...</think>\n"
                        + json.dumps({
                            "conflictDetected": True,
                            "confidence": 0.91,
                            "conflictType": "damage_location",
                            "evidenceA": "Photo: bumper",
                            "evidenceB": "Voice: windshield",
                            "explanation": "Different components.",
                            "status": "unresolved",
                        })
                    )
                }
            }]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        from pipeline.conflict_detector import detect_conflicts
        result = detect_conflicts(
            claim_id="CLM-006",
            claim_text="Bumper is damaged.",
            transcription="Windshield is broken.",
            image_analysis="Front bumper dent.",
        )

        assert result["conflictDetected"] is True
        assert result["confidence"] == 0.91

    @patch("pipeline.conflict_detector.requests.post")
    def test_api_exception_propagates(self, mock_post):
        """If NVIDIA API fails, the exception should propagate for the route to handle."""
        mock_post.side_effect = Exception("NVIDIA API unavailable")

        from pipeline.conflict_detector import detect_conflicts
        with pytest.raises(Exception, match="NVIDIA API unavailable"):
            detect_conflicts(
                claim_id="CLM-007",
                claim_text="Test",
                transcription="Test voice",
                image_analysis="Test image",
            )


# ─── FastAPI Integration Tests ────────────────────────────────────────────────

class TestAPIRoute:

    def _get_client(self):
        os.environ.setdefault("NVIDIA_API_KEY", "test-key-fake")
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
        assert "geminiModel" in data  # field name kept for backward compat

    def test_analyze_endpoint_missing_claim_text_returns_422(self):
        """claim_text is required — should return 422 if missing."""
        client = self._get_client()
        response = client.post("/api/v1/analyze", data={})
        assert response.status_code == 422
