"""
ClaimLens AI Pipeline — FastAPI Routes
=======================================
Defines the /api/v1/analyze and /health endpoints.
Powered by NVIDIA NIM (vision + reasoning) + OpenAI Whisper (transcription).
"""
import logging
import time
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from pipeline.conflict_detector import detect_conflicts
from pipeline.image_analyzer import analyze_image
from pipeline.models import AnalyzeResponse, ClaimStatus, ConflictType, ErrorResponse, HealthResponse
from pipeline.transcriber import transcribe_audio
from utils.helpers import generate_claim_id, sanitize_claim_id, validate_audio_bytes, validate_image_bytes

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint — confirms the AI service is running.
    Used by backend and infrastructure monitoring.
    """
    import os
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        whisperModel=os.getenv("WHISPER_MODEL", "base"),
        geminiModel=os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
    )


@router.post(
    "/api/v1/analyze",
    response_model=AnalyzeResponse,
    tags=["AI Pipeline"],
    summary="Analyze claim evidence for conflicts",
    description=(
        "Accepts multimodal insurance claim evidence (text + image + audio) and "
        "returns a structured conflict detection report. "
        "This endpoint is called by the backend — not directly by the Android app."
    ),
)
async def analyze_claim(
    claim_id: Optional[str] = Form(None, description="Claim ID — generated if not provided"),
    claim_text: str = Form(..., description="Text description from the claimant"),
    image: Optional[UploadFile] = File(None, description="Damage photo (jpg/png)"),
    audio: Optional[UploadFile] = File(None, description="Voice recording (mp3/wav/m4a)"),
):
    """
    Full AI analysis pipeline:
      1. Transcribe voice audio → text (Whisper)
      2. Analyse damage photo → description (Gemini Vision)
      3. Cross-modal conflict detection (Gemini)
      4. Return structured conflict report
    """
    start_time = time.time()

    # Sanitise / generate claim ID
    if claim_id:
        claim_id = sanitize_claim_id(claim_id)
    else:
        claim_id = generate_claim_id()

    logger.info(f"[{claim_id}] === New claim received ===")
    logger.info(f"[{claim_id}] claim_text: '{claim_text[:100]}'")
    logger.info(f"[{claim_id}] has_image={image is not None}, has_audio={audio is not None}")

    transcription_text: Optional[str] = None
    image_analysis_text: Optional[str] = None

    # -----------------------------------------------------------------------
    # Stage 1: Voice Transcription (Whisper)
    # -----------------------------------------------------------------------
    if audio is not None:
        import os
        audio_bytes = await audio.read()
        if validate_audio_bytes(audio_bytes):
            logger.info(f"[{claim_id}] Stage 1: Transcribing audio ({len(audio_bytes)} bytes)...")
            whisper_model = os.getenv("WHISPER_MODEL", "base")
            transcription_result = transcribe_audio(
                audio_bytes=audio_bytes,
                filename=audio.filename or "audio.mp3",
                model_name=whisper_model,
            )
            if transcription_result["success"]:
                transcription_text = transcription_result["text"]
                logger.info(f"[{claim_id}] Transcription: '{transcription_text}'")
            else:
                logger.warning(f"[{claim_id}] Transcription failed: {transcription_result['error']}")
        else:
            logger.warning(f"[{claim_id}] Invalid audio bytes — skipping transcription.")

    # -----------------------------------------------------------------------
    # Stage 2: Image Analysis (Gemini Vision)
    # -----------------------------------------------------------------------
    if image is not None:
        import os
        image_bytes = await image.read()
        if validate_image_bytes(image_bytes):
            logger.info(f"[{claim_id}] Stage 2: Analyzing image ({len(image_bytes)} bytes)...")
            nvidia_model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")
            image_result = analyze_image(
                image_bytes=image_bytes,
                filename=image.filename or "image.jpg",
                nvidia_model=nvidia_model,
            )
            if image_result["success"]:
                # Compose a rich description string for the conflict detector
                image_analysis_text = image_result["description"]
                if image_result.get("damage_components"):
                    comps = ", ".join(image_result["damage_components"])
                    image_analysis_text += f" Damaged components: {comps}."
                if image_result.get("damage_location"):
                    image_analysis_text += f" Location: {image_result['damage_location']}."
                if image_result.get("damage_severity"):
                    image_analysis_text += f" Severity: {image_result['damage_severity']}."
                if image_result.get("additional_observations"):
                    image_analysis_text += f" {image_result['additional_observations']}"
                logger.info(f"[{claim_id}] Image analysis: '{image_analysis_text[:100]}'")
            else:
                logger.warning(f"[{claim_id}] Image analysis failed: {image_result['error']}")
        else:
            logger.warning(f"[{claim_id}] Invalid image bytes — skipping image analysis.")

    # -----------------------------------------------------------------------
    # Stage 3: Conflict Detection (Gemini)
    # -----------------------------------------------------------------------
    try:
        import os
        logger.info(f"[{claim_id}] Stage 3: Running conflict detection...")
        nvidia_model = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")
        conflict_result = detect_conflicts(
            claim_id=claim_id,
            claim_text=claim_text,
            transcription=transcription_text,
            image_analysis=image_analysis_text,
            nvidia_model=nvidia_model,
        )
    except Exception as exc:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[{claim_id}] AI processing failed after {processing_time}ms: {exc}")
        error_response = ErrorResponse(
            claimId=claim_id,
            error="AI processing failed",
            detail=str(exc),
            processingTimeMs=processing_time,
        )
        return JSONResponse(status_code=500, content=error_response.model_dump())

    # -----------------------------------------------------------------------
    # Build final response
    # -----------------------------------------------------------------------
    processing_time = int((time.time() - start_time) * 1000)
    logger.info(f"[{claim_id}] Total processing time: {processing_time}ms")

    response = AnalyzeResponse(
        claimId=conflict_result["claimId"],
        conflictDetected=conflict_result["conflictDetected"],
        confidence=conflict_result["confidence"],
        conflictType=ConflictType(conflict_result.get("conflictType", "none")),
        evidenceA=conflict_result.get("evidenceA"),
        evidenceB=conflict_result.get("evidenceB"),
        explanation=conflict_result["explanation"],
        status=ClaimStatus(conflict_result.get("status", "clear")),
        transcription=transcription_text,
        imageAnalysis=image_analysis_text,
        processingTimeMs=processing_time,
    )

    return response
