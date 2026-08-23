"""
ClaimLens AI Pipeline — Pydantic Data Models
=============================================
Defines all request/response schemas used by the API and pipeline stages.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class ConflictType(str, Enum):
    DAMAGE_LOCATION = "damage_location"
    DAMAGE_SEVERITY = "damage_severity"
    INCIDENT_TYPE = "incident_type"
    NO_DAMAGE_VISIBLE = "no_damage_visible"
    NONE = "none"


class ClaimStatus(str, Enum):
    UNRESOLVED = "unresolved"
    CLEAR = "clear"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class TranscriptionResult(BaseModel):
    """Result from the voice transcription stage."""
    text: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    success: bool = True
    error: Optional[str] = None


class ImageAnalysisResult(BaseModel):
    """Result from the image analysis stage."""
    description: str
    damage_components: List[str] = Field(default_factory=list)
    damage_location: Optional[str] = None
    damage_severity: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class ConflictAnalysisInput(BaseModel):
    """Input assembled from all evidence sources before running conflict detection."""
    claim_id: str
    claim_text: str
    transcription: Optional[str] = None
    image_analysis: Optional[str] = None


class ConflictDetectionResult(BaseModel):
    """
    The core conflict detection output — matches the PRD standard AI response format.
    """
    claimId: str
    conflictDetected: bool
    confidence: float = Field(ge=0.0, le=1.0)
    conflictType: ConflictType = ConflictType.NONE
    evidenceA: Optional[str] = None
    evidenceB: Optional[str] = None
    explanation: str
    status: ClaimStatus
    transcription: Optional[str] = None
    imageAnalysis: Optional[str] = None
    processingTimeMs: int = 0


class AnalyzeResponse(ConflictDetectionResult):
    """Full response returned by /api/v1/analyze endpoint."""
    pass


class ErrorResponse(BaseModel):
    """Returned when AI processing fails."""
    claimId: str
    error: str
    detail: Optional[str] = None
    processingTimeMs: int = 0


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "1.0.0"
    whisperModel: str
    nvidiaModel: str
