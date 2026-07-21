"""
ZKGate India — Verification API

Verifies zero-knowledge proofs from citizens and returns named claims. No
personal data is accepted, computed or stored: the only citizen-derived value
that touches this server is an anonymous nullifier.

    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from routers import claims, health, nullifiers, verifiers, verify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("zkgate")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if the circuit keys are not loadable — a verifier that cannot
    # verify should not report itself healthy.
    from services.proof_verifier import get_layout

    layout = get_layout()
    logger.info("ZKGate India API up. Circuits: %s", list(layout._circuits))
    logger.info("Nullifier backend: %s", settings.redis_url or "in-memory")
    logger.info("Zero personal data will be stored.")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="ZKGate India API",
    version="1.0.0",
    description=(
        "Zero-Knowledge identity verification for India.\n\n"
        "Citizens prove facts about themselves (age, residency, citizenship, PAN) "
        "using cryptographic proofs generated on their own devices. This API "
        "checks those proofs and returns only the claim — never any personal data. "
        "Even a full breach of this service reveals nothing about any citizen, "
        "because nothing about any citizen is stored."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_and_headers(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - start) * 1000:.1f}"
    response.headers["X-ZKGate-Version"] = "1.0.0"
    return response


app.include_router(health.router, tags=["Health"])
app.include_router(verify.router, prefix="/v1", tags=["Verification"])
app.include_router(nullifiers.router, prefix="/v1", tags=["Nullifiers"])
app.include_router(claims.router, prefix="/v1", tags=["Claims"])
app.include_router(verifiers.router, prefix="/v1", tags=["Verifiers"])


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):  # pragma: no cover
    logger.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"error": "internal error", "detail": str(exc)})
