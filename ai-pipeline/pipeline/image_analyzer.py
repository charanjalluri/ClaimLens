"""
ClaimLens AI Pipeline — Image Analysis (Gemini Vision)
=======================================================
Analyses damage photos using Gemini 1.5 Flash vision capabilities.
Returns a structured description of visible damage for use in conflict detection.
"""
import base64
import logging
from pathlib import Path
from typing import Optional

import google.generativeai as genai  # type: ignore
from PIL import Image  # type: ignore
import io

logger = logging.getLogger(__name__)

# Insurance claim photo analysis prompt
IMAGE_ANALYSIS_PROMPT = """
You are an expert insurance claims adjuster analyzing photo evidence.

Carefully examine this image and provide a structured analysis:
1. What vehicle components or property are visibly damaged?
2. Where is the damage located (front, rear, driver side, passenger side, roof, etc.)?
3. What is the apparent severity (minor scratch, moderate dent, major structural damage, total loss)?
4. Are there any inconsistencies or unusual aspects visible?

Respond in this exact JSON format:
{
  "description": "<one clear sentence summarizing what damage is visible>",
  "damage_components": ["<component1>", "<component2>"],
  "damage_location": "<location>",
  "damage_severity": "<minor|moderate|severe|total_loss>",
  "additional_observations": "<any other relevant details>"
}

If no damage is visible, set description to "No visible damage detected" and use empty arrays.
"""


def analyze_image(
    image_bytes: bytes,
    filename: str = "image.jpg",
    gemini_model: str = "gemini-1.5-flash",
) -> dict:
    """
    Analyze an insurance claim photo using Gemini Vision.

    Args:
        image_bytes:   Raw bytes of the image file.
        filename:      Original filename (used to determine MIME type).
        gemini_model:  Gemini model name.

    Returns:
        dict with keys: description, damage_components, damage_location,
                        damage_severity, success, error
    """
    if not image_bytes:
        return {
            "description": "No image provided",
            "damage_components": [],
            "damage_location": None,
            "damage_severity": None,
            "success": False,
            "error": "Empty image data received",
        }

    try:
        # Validate and normalise image using Pillow
        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")  # normalise to RGB

        # Re-encode as JPEG for consistent MIME type
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        jpeg_bytes = buffer.getvalue()

        # Build Gemini request
        model = genai.GenerativeModel(gemini_model)
        image_part = {
            "mime_type": "image/jpeg",
            "data": base64.b64encode(jpeg_bytes).decode("utf-8"),
        }

        logger.info(f"Sending image to Gemini Vision ({len(jpeg_bytes)} bytes)...")
        response = model.generate_content(
            [IMAGE_ANALYSIS_PROMPT, image_part],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,  # Low temperature for factual analysis
                max_output_tokens=512,
            ),
        )

        raw_text = response.text.strip()
        logger.debug(f"Gemini Vision raw response: {raw_text}")

        # Parse JSON from response (Gemini may wrap in markdown code fences)
        import json, re
        # Strip markdown fences if present
        json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
        else:
            raise ValueError(f"No JSON found in Gemini response: {raw_text}")

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
            "success": False,
            "error": str(exc),
        }
