"""
Shared singletons and FastAPI dependencies.

The registries live for the process lifetime and are created once here, so every
router and every request sees the same nullifier store, audit chain and verifier
table. Tests import these too and reset them between cases.
"""

from __future__ import annotations

from fastapi import Header, HTTPException

from config import settings
from services.audit_logger import AuditLogger
from services.nullifier_registry import NullifierRegistry
from services.verifier_registry import VerifierRegistry

nullifiers = NullifierRegistry(settings.redis_url or None)
audit = AuditLogger()
verifiers = VerifierRegistry()


async def require_verifier(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    """
    Resolve the calling verifier from its API key.

    When require_api_key is off (the default for the demo) an unauthenticated
    call is allowed through as the anonymous verifier "0", so the portals work
    with no setup. When it is on, a missing or bad key is a hard 401.
    """
    if x_api_key:
        v = verifiers.authenticate(x_api_key)
        if v is None:
            raise HTTPException(status_code=401, detail="invalid API key")
        return v

    if settings.require_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key required")

    return None  # anonymous, demo mode
