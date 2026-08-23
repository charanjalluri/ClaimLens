"""
ClaimLens AI Pipeline — FastAPI Application Entry Point
========================================================
Start with:
    uvicorn main:app --port 8001 --reload

Environment variables (set in .env file):
    GEMINI_API_KEY  — Required. Get from https://aistudio.google.com/app/apikey
    WHISPER_MODEL   — Optional. Model size: tiny|base|small|medium (default: base)
    GEMINI_MODEL    — Optional. Gemini model name (default: gemini-1.5-flash)
    PORT            — Optional. Service port (default: 8001)
    LOG_LEVEL       — Optional. Logging level (default: INFO)
"""
import logging
import os

import google.generativeai as genai  # type: ignore
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before anything else
load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Gemini API Key ───────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error(
        "GEMINI_API_KEY is not set! "
        "Copy .env.example to .env and add your key from https://aistudio.google.com/app/apikey"
    )
else:
    genai.configure(api_key=GEMINI_API_KEY)
    logger.info("Gemini API configured.")

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="ClaimLens AI Pipeline",
    description=(
        "Multimodal insurance claim conflict detection service. "
        "Accepts text + image + audio evidence and returns structured conflict analysis."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow CORS for backend service (adjust origins in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────
from api.routes import router  # noqa: E402  (import after app creation to avoid circular)
app.include_router(router)


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("  ClaimLens AI Pipeline  —  Starting up")
    logger.info(f"  Whisper model : {os.getenv('WHISPER_MODEL', 'base')}")
    logger.info(f"  Gemini model  : {os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')}")
    logger.info(f"  API docs      : http://localhost:{os.getenv('PORT', '8001')}/docs")
    logger.info("=" * 60)


# ─── Dev server ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
