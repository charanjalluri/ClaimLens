# ClaimLens — Integration Guide for Agent 2 (Backend)

> **Read this before integrating the AI pipeline with the backend.**

---

## Overview

The AI pipeline is a standalone **FastAPI microservice** running on port `8001`.
The backend calls it via HTTP after receiving a claim from the Android app.

---

## Step-by-Step Integration

### 1. Start the AI service
```bash
cd ai-pipeline
uvicorn main:app --port 8001 --reload
```

### 2. Health check from backend
```javascript
const health = await fetch('http://localhost:8001/health').then(r => r.json());
// { status: 'healthy', version: '1.0.0', ... }
```

### 3. Call /analyze from your claim controller
```javascript
const FormData = require('form-data');
const fetch = require('node-fetch');

async function analyzeClaimWithAI(claimId, claimText, imageBuffer, audioBuffer) {
  const form = new FormData();
  form.append('claim_id', claimId);
  form.append('claim_text', claimText);
  
  if (imageBuffer) {
    form.append('image', imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
  }
  if (audioBuffer) {
    form.append('audio', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
  }

  const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
  const response = await fetch(`${AI_URL}/api/v1/analyze`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 35000,   // 35s timeout — AI pipeline target is <30s
  });

  if (!response.ok) {
    throw new Error(`AI service returned ${response.status}`);
  }
  return response.json();
}
```

### 4. Handle the AI response
```javascript
const aiResult = await analyzeClaimWithAI(claim.id, req.body.claim_text, imageBuffer, audioBuffer);

await db.updateClaim(claim.id, {
  conflict_detected: aiResult.conflictDetected,
  confidence: aiResult.confidence,
  conflict_type: aiResult.conflictType,
  evidence_a: aiResult.evidenceA,
  evidence_b: aiResult.evidenceB,
  explanation: aiResult.explanation,
  status: aiResult.status,                    // 'unresolved' | 'clear' | 'insufficient_evidence'
  transcription: aiResult.transcription,
  image_analysis: aiResult.imageAnalysis,
  processing_time_ms: aiResult.processingTimeMs,
});
```

---

## Environment Variable for Backend

Add to your backend `.env`:
```
AI_SERVICE_URL=http://localhost:8001
```

In Docker Compose, use the service name:
```
AI_SERVICE_URL=http://ai-pipeline:8001
```

---

## Error Handling

The AI service returns HTTP 500 with this body on failure:
```json
{
  "claimId": "CLM-001",
  "error": "AI processing failed",
  "detail": "<specific error message>",
  "processingTimeMs": 312
}
```

Recommended: if AI fails, set claim status to `ai_failed` and surface the error in the admin dashboard.

---

## Performance

| Scenario | Expected Time |
|---|---|
| Text only | < 3s |
| Text + image | < 8s |
| Text + audio | < 10s |
| Text + image + audio | < 15s |

All well within the 30s PRD requirement.

---

## Docker Compose (Suggested)

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - AI_SERVICE_URL=http://ai-pipeline:8001
    depends_on:
      - ai-pipeline

  ai-pipeline:
    build: ./ai-pipeline
    ports:
      - "8001:8001"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - WHISPER_MODEL=base
    volumes:
      - whisper-cache:/root/.cache/whisper

volumes:
  whisper-cache:
```
