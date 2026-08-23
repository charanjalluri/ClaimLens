"""
ClaimLens AI Pipeline — Image Analysis (NVIDIA NIM Vision)
===========================================================
Analyses damage photos using the NVIDIA NIM multimodal model
(nvidia/nemotron-3-nano-omni-30b-a3b-reasoning) via the
OpenAI-compatible chat completions endpoint.

The image is base64-encoded and sent as a data URL so no external
storage is required — the upload goes directly to NVIDIA's API.
"""
import base64
import io
import json
import logging
import os
import re
from typing import Optional

import requests
from PIL import Image  # type: ignore

logger = logging.getLogger(__name__)

NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

IMAGE_ANALYSIS_PROMPT = (
    "You are an expert insurance claims adjuster analyzing photo evidence.\n\n"
    "Carefully examine this image and provide a structured analysis:\n"
    "1. What vehicle components or property are visibly damaged?\n"
    "2. Where is the damage located (front, rear, driver side, passenger side, roof, etc.)?\n"
    "3. What is the apparent severity (minor scratch, moderate dent, major structural damage, total loss)?\n"
    "4. Are there any inconsistencies or unusual aspects visible?\n\n"
    "Respond in this EXACT JSON format (no other text):\n"
    "{\n"
    '  "description": "<one clear sentence summarizing what damage is visible>",\n'
    '  "damage_components": ["<component1>", "<component2>"],\n'
    '  "damage_location": "<location>",\n'
    '  "damage_severity": "<minor|moderate|severe|total_loss>",\n'
    '  "additional_observations": "<any other relevant details>"\n'
    "}\n\n"
    "If no damage is visible, set description to \"No visible damage detected\" and use empty arrays."
)


def _get_nvidia_key() -> str:
    key = os.getenv("NVIDIA_API_KEY", "")
    if not key:
        raise EnvironmentError(
            "NVIDIA_API_KEY is not set. Copy .env.example to .env and set your key."
        )
    return key


def analyze_image(
    image_bytes: bytes,
    filename: str = "image.jpg",
    nvidia_model: Optional[str] = None,
) -> dict:
    """
    Analyze an insurance claim photo using NVIDIA NIM vision model.

    Args:
        image_bytes:  Raw bytes of the image file.
        filename:     Original filename (used to determine format).
        nvidia_model: NVIDIA NIM model name. Reads NVIDIA_MODEL env var if None.

    Returns:
        dict with keys: description, damage_components, damage_location,
                        damage_severity, additional_observations, success, error
    """
    if not image_bytes:
        return {
            "description": "No image provided",
            "damage_components": [],
            "damage_location": None,
            "damage_severity": None,
            "additional_observations": "",
            "success": False,
            "error": "Empty image data received",
        }

    model = nvidia_model or os.getenv(
        "NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    )

    try:
        # Normalise to JPEG via Pillow for consistent encoding
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        jpeg_bytes = buf.getvalue()

        # Base64-encode → data URL (NVIDIA NIM supports this format)
        b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64}"

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": IMAGE_ANALYSIS_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            "max_tokens": 1024,
            "temperature": 0.1,   # Low temperature for factual analysis
            "top_p": 0.95,
            "stream": False,
        }

        headers = {
            "Authorization": f"Bearer {_get_nvidia_key()}",
            "Accept": "application/json",
        }

        logger.info(f"Sending image to NVIDIA NIM ({len(jpeg_bytes)} bytes, model={model})...")
        resp = requests.post(
            NVIDIA_API_URL,
            headers=headers,
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()

        raw_text = resp.json()["choices"][0]["message"]["content"].strip()
        logger.debug(f"NVIDIA Vision raw response: {raw_text}")

        # Strip markdown code fences if present, then parse JSON
        json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not json_match:
            raise ValueError(f"No JSON found in NVIDIA response: {raw_text}")

        parsed = json.loads(json_match.group())
        result = {
            "description": parsed.get("description", ""),
            "damage_components": parsed.get("damage_components", []),
            "damage_location": parsed.get("damage_location"),
            "damage_severity": parsed.get("damage_severity"),
            "additional_observations": parsed.get("additional_observations", ""),
            "success": True,
            "error": None,
        }
        logger.info(f"Image analysis complete: {result['description']}")
        return result

    except Exception as exc:
        logger.error(f"Image analysis failed: {exc}", exc_info=True)
        return {
            "description": "Image analysis failed",
            "damage_components": [],
            "damage_location": None,
            "damage_severity": None,
            "additional_observations": "",
            "success": False,
            "error": str(exc),
        }
