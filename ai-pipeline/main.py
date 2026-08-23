"""
ClaimLens AI Pipeline — FastAPI Application Entry Point
========================================================
Start with:
    uvicorn main:app --port 8001 --reload

Environment variables (set in .env file):
    NVIDIA_API_KEY  — Required. Get from https://build.nvidia.com
    NVIDIA_MODEL    — Optional. Default: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
    NVIDIA_API_URL  — Optional. Default: https://integrate.api.nvidia.com/v1
    WHISPER_MODEL   — Optional. Model size: tiny|base|small|medium (default: base)
    PORT            — Optional. Service port (default: 8001)
    LOG_LEVEL       — Optional. Logging level (default: INFO)
"""
import logging
import os
from contextlib import asynccontextmanager

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

# ─── NVIDIA API Key ───────────────────────────────────────────────────────────
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
if not NVIDIA_API_KEY:
    logger.error(
        "NVIDIA_API_KEY is not set! "
        "Copy .env.example to .env and add your key from https://build.nvidia.com"
    )
else:
    logger.info("NVIDIA NIM API key loaded.")

# ─── Lifespan (startup logging) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(application: FastAPI):
    logger.info("=" * 60)
    logger.info("  ClaimLens AI Pipeline  —  Starting up")
    logger.info(f"  Whisper model  : {os.getenv('WHISPER_MODEL', 'base')}")
    logger.info(f"  NVIDIA model   : {os.getenv('NVIDIA_MODEL', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning')}")
    logger.info(f"  NVIDIA API URL : {os.getenv('NVIDIA_API_URL', 'https://integrate.api.nvidia.com/v1')}")
    logger.info(f"  API docs       : http://localhost:{os.getenv('PORT', '8001')}/docs")
    logger.info("=" * 60)
    yield  # application runs here


# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="ClaimLens AI Pipeline",
    description=(
        "Multimodal insurance claim conflict detection service. "
        "Accepts text + image + audio evidence and returns structured conflict analysis. "
        "Powered by NVIDIA NIM (nemotron-3-nano-omni) + OpenAI Whisper."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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
from api.routes import router  # noqa: E402
app.include_router(router)


# ─── Dev server ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
