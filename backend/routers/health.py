"""Liveness and readiness."""

from __future__ import annotations

from fastapi import APIRouter

import dependencies
from services.proof_verifier import get_layout

router = APIRouter()


@router.get("/")
async def root():
    return {
        "service": "ZKGate India",
        "tagline": "India's first indigenous Zero-Knowledge Identity Layer",
        "version": "1.0.0",
        "docs": "/docs",
        "privacy": "Zero personal data is stored. Only anonymous nullifiers.",
    }


@router.get("/health")
async def health():
    """Readiness: all subsystems the verifier depends on are up."""
    redis_ok = await dependencies.nullifiers.health()
    chain_ok, broken = dependencies.audit.verify_chain()

    # If we cannot load the circuit layout/keys we cannot verify anything.
    try:
        layout = get_layout()
        circuits = list(layout._circuits.keys())
        circuits_ok = True
    except Exception as exc:  # pragma: no cover
        circuits, circuits_ok = [f"error: {exc}"], False

    ready = circuits_ok and chain_ok
    return {
        "status": "ready" if ready else "degraded",
        "circuits_loaded": circuits,
        "nullifier_backend": dependencies.nullifiers.backend,
        "nullifier_store_healthy": redis_ok,
        "audit_events": len(dependencies.audit),
        "audit_chain_intact": chain_ok,
        "audit_chain_broken_at": broken,
    }
