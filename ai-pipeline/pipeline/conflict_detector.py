"""
ClaimLens AI Pipeline — Conflict Detection (NVIDIA NIM)
=======================================================
The core intelligence of ClaimLens.
Takes all three evidence streams (text, transcription, image analysis)
and uses the NVIDIA NIM reasoning model to detect contradictions and
generate a structured conflict report.

Model: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
  — 30B parameter model with built-in chain-of-thought reasoning
  — reasoning_budget controls how much thinking the model does
"""
import json
import logging
import os
import re
from typing import Optional

import requests

logger = logging.getLogger(__name__)

NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

CONFLICT_DETECTION_PROMPT = """You are an expert insurance fraud investigator and claims analyst.

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

Respond ONLY in this exact JSON format (no other text, no markdown):
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


def _get_nvidia_key() -> str:
    key = os.getenv("NVIDIA_API_KEY", "")
    if not key:
        raise EnvironmentError(
            "NVIDIA_API_KEY is not set. Copy .env.example to .env and set your key."
        )
    return key


def detect_conflicts(
    claim_id: str,
    claim_text: str,
    transcription: Optional[str],
    image_analysis: Optional[str],
    nvidia_model: Optional[str] = None,
) -> dict:
    """
    Run multimodal conflict detection across all evidence sources.

    Args:
        claim_id:       Unique claim identifier.
        claim_text:     Text entered by the claimant.
        transcription:  Voice-to-text output (may be None).
        image_analysis: Image description from vision model (may be None).
        nvidia_model:   NVIDIA NIM model name (reads env var if None).

    Returns:
        dict matching the standard ClaimLens AI response format.
    """
    transcription_text = transcription or "No voice recording provided."
    image_text = image_analysis or "No photo provided."

    # Require at least 2 evidence sources for meaningful conflict detection
    evidence_count = sum([
        bool(claim_text and claim_text.strip()),
        bool(transcription and transcription.strip()),
        bool(image_analysis and image_analysis.strip()),
    ])

    if evidence_count < 2:
        logger.warning(f"[{claim_id}] Insufficient evidence ({evidence_count} sources).")
        return _insufficient_evidence_result(claim_id)

    model = nvidia_model or os.getenv(
        "NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    )

    prompt = CONFLICT_DETECTION_PROMPT.format(
        claim_text=claim_text or "(not provided)",
        transcription=transcription_text,
        image_analysis=image_text,
    )

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 65536,
        "reasoning_budget": 16384,   # Allow full chain-of-thought reasoning
        "temperature": 0.6,
        "top_p": 0.95,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {_get_nvidia_key()}",
        "Accept": "application/json",
    }

    try:
        logger.info(f"[{claim_id}] Running conflict detection via NVIDIA NIM (model={model})...")
        resp = requests.post(
            NVIDIA_API_URL,
            headers=headers,
            json=payload,
            timeout=120,   # Reasoning model can take longer
        )
        resp.raise_for_status()

        raw_text = resp.json()["choices"][0]["message"]["content"].strip()
        logger.debug(f"[{claim_id}] NVIDIA conflict response: {raw_text}")

        # Extract the JSON block (model may include <think>...</think> reasoning)
        # Strip <think> sections first, then find the JSON object
        cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
        json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not json_match:
            # Fallback: try raw_text in case no <think> tags
            json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not json_match:
            raise ValueError(f"No JSON found in conflict response: {raw_text}")

        parsed = json.loads(json_match.group())

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
            f"[{claim_id}] Conflict detection done — "
            f"conflictDetected={result['conflictDetected']}, "
            f"confidence={result['confidence']:.2f}, "
            f"type={result['conflictType']}"
        )
        return result

    except Exception as exc:
        logger.error(f"[{claim_id}] Conflict detection failed: {exc}", exc_info=True)
        raise


def _insufficient_evidence_result(claim_id: str) -> dict:
    """Return a structured result when there is not enough evidence."""
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
