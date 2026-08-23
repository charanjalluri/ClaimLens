# ClaimLens — Shared API Contract

> **Version:** 1.0.0  
> **Last Updated:** 2026-08-23  
> **Owners:** Agent 1 (AI), Agent 2 (Backend)

This document defines the **agreed interface** between:
- The Android app → Backend API
- The Backend API → AI Pipeline service

---

## 1. Android → Backend API

### Endpoint
```
POST /api/v1/claims
Host: <backend-host>
Content-Type: multipart/form-data
```

### Request Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `claim_id` | string | No | Optional — backend generates if absent |
| `claim_text` | string | **Yes** | Text description typed by user |
| `image` | file (jpg/png) | No | Photo of damage |
| `audio` | file (mp3/wav/m4a/ogg) | No | Voice memo recording |
| `user_id` | string | No | Authenticated user ID |

### Response (201 Created)
```json
{
  "claimId": "CLM-001",
  "status": "processing",
  "message": "Claim received. AI analysis in progress."
}
```

---

## 2. Backend → AI Pipeline (Internal Call)

### Endpoint
```
POST http://localhost:8001/api/v1/analyze
Content-Type: multipart/form-data
```

> This is an **internal service-to-service call**. It should NOT be exposed to the internet.

### Request Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `claim_id` | string | **Yes** | Claim identifier |
| `claim_text` | string | **Yes** | Text entered by user |
| `image` | file | No | Forwarded from Android |
| `audio` | file | No | Forwarded from Android |

### Response (200 OK)
```json
{
  "claimId": "CLM-001",
  "conflictDetected": true,
  "confidence": 0.91,
  "conflictType": "damage_location",
  "evidenceA": "Photo shows front bumper damage",
  "evidenceB": "Voice states windshield is broken",
  "explanation": "The visual and voice evidence describe different damaged components. The photo clearly shows front bumper impact damage while the voice recording describes a broken windshield — these are mutually exclusive injury locations.",
  "status": "unresolved",
  "transcription": "My windshield was completely broken.",
  "imageAnalysis": "Front bumper shows significant impact damage with paint scraping and structural deformation.",
  "processingTimeMs": 4200
}
```

### Conflict Types

| Value | Description |
|---|---|
| `damage_location` | Different body parts described |
| `damage_severity` | Severity mismatch (minor vs total loss) |
| `incident_type` | Type of incident differs |
| `no_damage_visible` | Text claims damage but image shows none |
| `none` | No conflict detected |

### Status Values

| Value | Description |
|---|---|
| `unresolved` | Conflict found, needs human review |
| `clear` | No conflict, claim appears consistent |
| `insufficient_evidence` | Too little data to determine |

### Error Response (422 / 500)
```json
{
  "claimId": "CLM-001",
  "error": "AI processing failed",
  "detail": "<error message>",
  "processingTimeMs": 312
}
```

---

## 3. Health Check

```
GET http://localhost:8001/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "whisperModel": "base",
  "geminiModel": "gemini-1.5-flash"
}
```

---

## 4. Integration Notes for Agent 2

1. **Call the AI service synchronously** after saving the claim to DB with `status: "processing"`.
2. After receiving the AI response, **update the DB record** with conflict fields.
3. The AI service accepts files as **raw multipart** — just forward the files you received from Android.
4. If AI service returns an error, set claim status to `"ai_failed"` and log the error.
5. The AI service URL should be an **environment variable**: `AI_SERVICE_URL=http://localhost:8001`

### Backend Integration Pseudocode
```javascript
// In your claim controller:
async function handleNewClaim(req, res) {
  const claim = await db.saveClaim({ ...req.body, status: 'processing' });

  const formData = new FormData();
  formData.append('claim_id', claim.id);
  formData.append('claim_text', req.body.claim_text);
  if (req.files.image) formData.append('image', req.files.image[0].buffer, 'image.jpg');
  if (req.files.audio) formData.append('audio', req.files.audio[0].buffer, 'audio.mp3');

  const aiResult = await fetch(`${AI_SERVICE_URL}/api/v1/analyze`, {
    method: 'POST',
    body: formData,
  }).then(r => r.json());

  await db.updateClaim(claim.id, {
    conflict_detected: aiResult.conflictDetected,
    confidence: aiResult.confidence,
    conflict_type: aiResult.conflictType,
    evidence_a: aiResult.evidenceA,
    evidence_b: aiResult.evidenceB,
    explanation: aiResult.explanation,
    status: aiResult.conflictDetected ? 'unresolved' : 'clear',
    transcription: aiResult.transcription,
    image_analysis: aiResult.imageAnalysis,
  });

  res.json({ claimId: claim.id, status: claim.status });
}
```

---

## 5. Database Schema (Suggested for Agent 2)

```sql
CREATE TABLE claims (
  id              VARCHAR(50) PRIMARY KEY,  -- e.g. CLM-001
  user_id         VARCHAR(100),
  claim_text      TEXT NOT NULL,
  image_url       TEXT,
  audio_url       TEXT,
  transcription   TEXT,
  image_analysis  TEXT,
  conflict_detected BOOLEAN DEFAULT FALSE,
  confidence      FLOAT,
  conflict_type   VARCHAR(50),
  evidence_a      TEXT,
  evidence_b      TEXT,
  explanation     TEXT,
  status          VARCHAR(30) DEFAULT 'processing',
  processing_time_ms INTEGER,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```
