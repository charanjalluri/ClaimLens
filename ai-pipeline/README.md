# ClaimLens — AI Pipeline

> Multimodal insurance claim conflict detection microservice.

---

## What this service does

Accepts a claim submission (text + photo + voice recording) and uses AI to detect **contradictions** between the evidence — e.g., text says "bumper damage" but voice says "windshield broken".

---

## Pipeline Architecture

```
Input:   claim_text  +  image (optional)  +  audio (optional)
                │
    ┌───────────┼───────────┐
    │           │           │
Stage 1     Stage 2     (text passthrough)
Whisper    Gemini Vision
(voice→text) (image→desc)
    │           │
    └─────┬─────┘
          │
       Stage 3
   Gemini Conflict
    Detection
          │
   Structured JSON
      Response
```

---

## Quick Start

### 1. Get a Gemini API Key
Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a free API key.

### 2. Setup
```bash
cd ai-pipeline
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=your_key_here
```

### 3. Run
```bash
uvicorn main:app --port 8001 --reload
```

Interactive docs: http://localhost:8001/docs

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/v1/analyze` | Analyze claim evidence |

### POST /api/v1/analyze

**Request** (multipart/form-data):

| Field | Type | Required |
|---|---|---|
| claim_id | string | No (auto-generated) |
| claim_text | string | **Yes** |
| image | file | No |
| audio | file | No |

**Response:**
```json
{
  "claimId": "CLM-001",
  "conflictDetected": true,
  "confidence": 0.91,
  "conflictType": "damage_location",
  "evidenceA": "Photo shows front bumper damage",
  "evidenceB": "Voice states windshield is broken",
  "explanation": "The visual and voice evidence describe different damaged components.",
  "status": "unresolved",
  "transcription": "My windshield was completely broken.",
  "imageAnalysis": "Front bumper shows significant impact damage...",
  "processingTimeMs": 4200
}
```

---

## Test with curl

```bash
# Text only
curl -X POST http://localhost:8001/api/v1/analyze \
  -F "claim_id=CLM-001" \
  -F "claim_text=My front bumper is damaged"

# With files (PRD test case)
curl -X POST http://localhost:8001/api/v1/analyze \
  -F "claim_id=CLM-001" \
  -F "claim_text=My front bumper is damaged" \
  -F "image=@tests/test_assets/bumper_damage.jpg" \
  -F "audio=@tests/test_assets/windshield_voice.mp3"
```

---

## Run Tests

```bash
cd ai-pipeline
pip install pytest
pytest tests/ -v
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Gemini API key |
| `WHISPER_MODEL` | No | `base` | Whisper model size (tiny/base/small/medium) |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model |
| `PORT` | No | `8001` | Service port |
| `LOG_LEVEL` | No | `INFO` | Log level |

---

## File Structure

```
ai-pipeline/
├── main.py                    # FastAPI entry point
├── requirements.txt
├── .env.example
├── api/
│   └── routes.py              # /analyze + /health endpoints
├── pipeline/
│   ├── models.py              # Pydantic schemas
│   ├── transcriber.py         # Whisper voice→text
│   ├── image_analyzer.py      # Gemini Vision image analysis
│   └── conflict_detector.py   # Gemini conflict detection
├── utils/
│   └── helpers.py             # File validation, ID generation
└── tests/
    ├── test_pipeline.py        # Unit tests (transcriber, image, helpers)
    └── test_conflict.py        # Conflict detection + API tests
```

---

## Integration for Agent 2 (Backend)

See [`../docs/api-contract.md`](../docs/api-contract.md) for the complete integration guide including:
- Exact request/response format
- Backend pseudocode
- Suggested database schema
- Error handling guidance
