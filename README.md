# ClaimLens 🔍

> **AI-powered insurance claim conflict detection system.**
> Automatically detects contradictions between photo, voice, and text evidence submitted with insurance claims.

---

## Team

| Name | Role | Key Responsibilities |
|---|---|---|
| **Jalluri Venkata Satya Charan** | AI + Integration / Tech Lead | NVIDIA NIM multimodal AI pipeline, voice transcription, image analysis, cross-modal conflict detection, AI response contract, AI/backend integration, overall technical integration |
| **Gayathri Sai Vemula** | Backend + Database | Backend APIs, claim processing, database, AI service integration, conflict storage, real-time updates, admin dashboard APIs, conflict resolution |
| **Palukuri Kaushik** | Android Developer | Android mobile app, claim submission UI, CameraX photo capture, voice recording, text input, Retrofit API integration, Room local storage, WorkManager offline sync, claim status/result display |

---

## Core Flow

```
Android App
Palukuri Kaushik
    │  POST /api/v1/claims  (multipart: image + audio + text)
    ▼
Backend + Database
Gayathri Sai Vemula
    │  POST http://ai-service:8001/api/v1/analyze
    ▼
AI Pipeline
Jalluri Venkata Satya Charan
    │  Whisper transcription + NVIDIA NIM Vision + Conflict Detection
    ▼
NVIDIA NIM
    │
    ▼
Conflict Result JSON
    │
    ▼
Backend + Database
    │
    ▼
Dashboard / Resolution
```

---

## Project Structure

```
ClaimLens/
├── ai-pipeline/        ← AI conflict-detection microservice (FastAPI, NVIDIA NIM, Whisper)
├── backend/            ← Backend API, Database, Real-Time SSE/WS, Admin Dashboard (Node.js/Express)
├── docs/               ← Shared API contract & integration guides
└── README.md
```

---

## Shared API Contract & Documentation

- [`docs/api-contract.md`](docs/api-contract.md) — Shared request/response specification agreed between all team members.
- [`docs/android-integration-guide.md`](docs/android-integration-guide.md) — Complete guide for Android Retrofit 2 integration, data models, and status codes.
- [`docs/integration-guide.md`](docs/integration-guide.md) — Backend-to-AI microservice integration guide.

---

## Quick Start (Backend API & Admin Dashboard)

```bash
cd backend
npm install
npm start
```

- **HTTP API Base**: `http://localhost:8000`
- **Live Admin Dashboard**: `http://localhost:8000/dashboard`
- **Real-Time WebSocket**: `ws://localhost:8000/ws`
- **SSE Stream**: `http://localhost:8000/api/v1/events`
- **Health check**: `http://localhost:8000/health`
- **Run Tests**: `npm test`

---

## Quick Start (AI Pipeline)

```bash
cd ai-pipeline
pip install -r requirements.txt
cp .env.example .env        # Add your NVIDIA_API_KEY
uvicorn main:app --port 8001 --reload
```

Health check:
```
GET http://localhost:8001/health
```

---

## Branches

| Branch | Owner | Purpose |
|---|---|---|
| `main` | All | Stable, reviewed code only |
| `feature/ai-integration` | Jalluri Venkata Satya Charan | AI pipeline |
| `feature/backend` | Palukuri Kaushik | Backend API + Database |
| `feature/android` | Gayathri Sai Vemula | Android application |

---

## License

MIT
