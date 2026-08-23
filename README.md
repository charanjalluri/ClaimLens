# ClaimLens 🔍

> **AI-powered insurance claim conflict detection system.**
> Automatically detects contradictions between photo, voice, and text evidence submitted with insurance claims.

---

## Project Structure

```
ClaimLens/
├── ai-pipeline/        ← AI conflict-detection microservice (this repo)
├── docs/               ← Shared API contract & integration guides
└── README.md
```

> **Note:** The Android app and Backend API live in separate repos / branches managed by respective team members.

---

## Team & Responsibilities

| Role | Scope |
|---|---|
| Android Developer | Mobile app (photo + text + voice capture) |
| Agent 2 — Backend | REST API, database, claim storage, routing |
| **Agent 1 — AI (this repo)** | AI pipeline, conflict detection, multimodal analysis |

---

## Core Flow

```
Android App
    │  POST /api/v1/claims  (multipart: image + audio + text)
    ▼
Backend API  (Node.js / Express — Agent 2)
    │  POST http://ai-service:8001/api/v1/analyze
    ▼
AI Pipeline Service  ← Port 8001
    │  Whisper transcription + Gemini Vision + Conflict Detection
    ▼
Conflict Result JSON
    │
    ▼
Database → Admin Dashboard
```

---

## Shared API Contract

See [`docs/api-contract.md`](docs/api-contract.md) for the full request/response specification.

---

## Quick Start (AI Pipeline)

```bash
cd ai-pipeline
pip install -r requirements.txt
cp .env.example .env        # Add your GEMINI_API_KEY
uvicorn main:app --port 8001 --reload
```

Health check:
```
GET http://localhost:8001/health
```

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, reviewed code only |
| `feature/ai-integration` | AI pipeline (Agent 1) |
| `feature/backend` | Backend API (Agent 2) |

---

## License

MIT
