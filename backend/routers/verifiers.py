"""Verifier directory and audit access."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import dependencies
from dependencies import require_verifier

router = APIRouter()


class RegisterVerifier(BaseModel):
    verifier_id: str
    name: str


@router.get("/verifiers")
async def list_verifiers():
    """Public directory of registered verifiers (no secrets)."""
    return {"verifiers": dependencies.verifiers.list_public()}


@router.post("/verifiers")
async def register_verifier(body: RegisterVerifier):
    """
    Register a verifier and mint an API key.

    The key is shown ONCE in the response and only its hash is retained — we
    cannot show it again, which is the point. In production this sits behind an
    admin auth boundary; for the prototype it is open so a demo can self-serve.
    """
    if dependencies.verifiers.get(body.verifier_id) is not None:
        raise HTTPException(409, f"verifier_id {body.verifier_id} already exists")
    v, api_key = dependencies.verifiers.register(verifier_id=body.verifier_id, name=body.name)
    return {
        "verifier_id": v.verifier_id,
        "name": v.name,
        "api_key": api_key,
        "note": "Store this key now — it is not recoverable.",
    }


@router.get("/audit")
async def audit_tail(limit: int = 50, caller=Depends(require_verifier)):
    """
    Recent audit events plus a live integrity check of the hash chain.

    The events name no citizen — only claims, verifiers, verdicts and anonymous
    nullifiers — so this is safe to expose to a verifier for their own records.
    """
    intact, broken_at = dependencies.audit.verify_chain()
    return {
        "chain_intact": intact,
        "broken_at": broken_at,
        "count": len(dependencies.audit),
        "events": dependencies.audit.tail(min(limit, 200)),
    }
