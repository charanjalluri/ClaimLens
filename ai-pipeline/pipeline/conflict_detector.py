"""
ClaimLens AI Pipeline — Conflict Detection (Gemini)
====================================================
The core intelligence of ClaimLens.
Takes all three evidence streams (text, transcription, image analysis)
and uses Gemini 1.5 Flash to detect contradictions and generate
a structured conflict report.
"""
import json
import logging
import re
from typing import Optional

import google.generativeai as genai  # type: ignore

logger = logging.getLogger(__name__)

CONFLICT_DETECTION_PROMPT = """
You are an expert insurance fraud investigator and claims analyst.

A new insurance claim has been submitted with the following evidence:

CLAIM TEXT (typed by claimant):
{claim_text}

VOICE RECORDING (transcribed):
{transcription}

PHOTO EVIDENCE (AI image analysis):
{image_analysis}

---

Your task: Carefully compare all three evidence sources and determine if there are any CONTRADICTIONS or CONFLICTS between them.

A conflict exists when:
- Different body parts / components are described as damaged (e.g., text says "bumper" but voice says "windshield")
- The severity described in text/voice doesn't match what's visible in the photo
- The type of incident is inconsistent across evidence sources
- The photo shows no damage but text/voice claim significant damage
- Locations are inconsistent (e.g., "front" vs "rear")

Respond ONLY in this exact JSON format (no other text):
{{
  "conflictDetected": <true or false>,
  "confidence": <0.0 to 1.0>,
  "conflictType": "<damage_location|damage_severity|incident_type|no_damage_visible|none>",
  "evidenceA": "<what one piece of evidence says>",
  "evidenceB": "<what conflicting evidence says>",
  "explanation": "<clear explanation of the contradiction and why it matters for the claim>",
  "status": "<unresolved|clear|insufficient_evidence>"
}}

Rules:
- If no conflict: conflictDetected=false, conflictType="none", status="clear", confidence >= 0.8
- If conflict found: conflictDetected=true, status="unresolved", confidence reflects your certainty (0.7–0.99)
- If evidence is missing/insufficient: status="insufficient_evidence", confidence <= 0.5
- Always base evidenceA and evidenceB on ACTUAL quotes or descriptions from the evidence above
- The explanation must be specific — mention the exact components/locations that conflict
"""


def detect_conflicts(
    claim_id: str,
    claim_text: str,
    transcription: Optional[str],
    image_analysis: Optional[str],
    gemini_model: str = "gemini-1.5-flash",
) -> dict:
    """
    Run multimodal conflict detection across all evidence sources.

    Args:
        claim_id:       Unique claim identifier.
        claim_text:     Text entered by the claimant.
        transcription:  Voice-to-text output (may be None).
        image_analysis: Image description from vision model (may be None).
        gemini_model:   Gemini model to use.

    Returns:
        dict matching the standard ClaimLens AI response format.
    """
    # Handle missing evidence gracefully
    transcription_text = transcription if transcription else "No voice recording provided."
    image_text = image_analysis if image_analysis else "No photo provided."

    # Check for insufficient evidence
    evidence_count = sum([
        bool(claim_text and claim_text.strip()),
        bool(transcription and transcription.strip()),
        bool(image_analysis and image_analysis.strip()),
    ])

    if evidence_count < 2:
        logger.warning(f"[{claim_id}] Insufficient evidence ({evidence_count} sources) for conflict detection.")
        return _insufficient_evidence_result(claim_id, claim_text, transcription, image_analysis)

    try:
        model = genai.GenerativeModel(gemini_model)

        prompt = CONFLICT_DETECTION_PROMPT.format(
            claim_text=claim_text or "(not provided)",
            transcription=transcription_text,
            image_analysis=image_text,
        )

        logger.info(f"[{claim_id}] Running conflict detection with Gemini...")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,      # Slightly creative for nuanced reasoning
                max_output_tokens=800,
            ),
        )

        raw_text = response.text.strip()
        logger.debug(f"[{claim_id}] Gemini conflict response: {raw_text}")

        # Extract JSON (handle markdown code fences)
        json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not json_match:
            raise ValueError(f"No JSON in conflict response: {raw_text}")

        parsed = json.loads(json_match.group())

        # Normalise and validate
        result = {
            "claimId": claim_id,
            "conflictDetected": bool(parsed.get("conflictDetected", False)),
            "confidence": max(0.0, min(1.0, float(parsed.get("confidence", 0.5)))),
            "conflictType": parsed.get("conflictType", "none"),
            "evidenceA": parsed.get("evidenceA"),
            "evidenceB": parsed.get("evidenceB"),
            "explanation": parsed.get("explanation", ""),
            "status": parsed.get("status", "clear"),
        }

        logger.info(
            f"[{claim_id}] Conflict detection done. "
            f"conflictDetected={result['conflictDetected']}, "
            f"confidence={result['confidence']:.2f}, "
            f"type={result['conflictType']}"
        )
        return result

    except Exception as exc:
        logger.error(f"[{claim_id}] Conflict detection failed: {exc}", exc_info=True)
        raise


def _insufficient_evidence_result(
    claim_id: str,
    claim_text: str,
    transcription: Optional[str],
    image_analysis: Optional[str],
) -> dict:
    """Return a structured result when there is not enough evidence to determine conflicts."""
    return {
        "claimId": claim_id,
        "conflictDetected": False,
        "confidence": 0.3,
        "conflictType": "none",
        "evidenceA": None,
        "evidenceB": None,
        "explanation": (
            "Insufficient evidence to perform conflict detection. "
            "At least two of the three evidence sources (text, voice, photo) are required."
        ),
        "status": "insufficient_evidence",
    }
