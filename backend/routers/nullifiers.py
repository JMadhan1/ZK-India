"""Nullifier status and anonymous statistics. No personal data is reachable here."""

from __future__ import annotations

from fastapi import APIRouter

import dependencies

router = APIRouter()


@router.get("/nullifiers/{claim_type}/{nullifier}")
async def nullifier_status(claim_type: str, nullifier: str):
    """
    Has this proof been used? A verifier can check before honouring a proof they
    received out of band. Returns 'unused' or the (anonymous) prior record.
    """
    record = await dependencies.nullifiers.status(claim_type, nullifier)
    if record is None:
        return {"nullifier": nullifier, "claim_type": claim_type, "used": False}
    return {"nullifier": nullifier, "claim_type": claim_type, "used": True, "record": record}


@router.get("/stats")
async def stats():
    """Aggregate counters — verifications and replay attempts. Nothing per-citizen."""
    return await dependencies.nullifiers.stats()
