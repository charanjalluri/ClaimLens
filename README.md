# ClaimLens 🔍

> **AI-powered insurance claim conflict detection system.**
> Automatically detects contradictions between photo, voice, and text evidence submitted with insurance claims.

---

## Team

| Name | Role | Key Responsibilities |
|---|---|---|
| **Jalluri Venkata Satya Charan** | AI + Integration / Tech Lead | NVIDIA NIM multimodal AI pipeline, voice transcription, image analysis, cross-modal conflict detection, AI response contract, AI/backend integration, overall technical integration |
| **Palukuri Kaushik** | Backend + Database | Backend APIs, claim processing, database, AI service integration, conflict storage, real-time updates, admin dashboard APIs, conflict resolution |
| **Gayathri Sai Vemula** | Android Developer | Android mobile app, claim submission UI, CameraX photo capture, voice recording, text input, Retrofit API integration, Room local storage, WorkManager offline sync, claim status/result display |

---

## Core Flow

```
Android App
Gayathri Sai Vemula
    │  POST /api/v1/claims  (multipart: image + audio + text)
    ▼
Backend + Database
Palukuri Kaushik
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
├── ai-pipeline/        ← AI conflict-detection microservice
├── docs/               ← Shared API contract & integration guides
└── README.md
```

> **Note:** The Android app and Backend API live in separate branches managed by the respective team members.

---

## Shared API Contract

See [`docs/api-contract.md`](docs/api-contract.md) for the full request/response specification agreed between all three team members.

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
