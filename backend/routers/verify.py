"""
Verification endpoints — the heart of the API.

POST /v1/verify        one proof
POST /v1/verify/batch  up to 100 proofs

The flow for a single proof, in order, because the order is the security:

  1. Verify the proof cryptographically AND semantically (proof_verifier).
  2. If valid, atomically register its nullifier — this is where a replay is
     caught. A cryptographically perfect proof that has been seen before is
     downgraded to valid=false, fresh=false.
  3. Record an audit event either way.

Step 2 must come after step 1 (no point registering a bad proof) and the audit
in step 3 must capture the post-replay verdict, not the pre-replay one.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

import dependencies
from dependencies import require_verifier
from models.proof import (
    BatchVerifyRequest,
    BatchVerifyResponse,
    VerifyRequest,
    VerifyResponse,
)
from services.proof_verifier import verify_bundle

router = APIRouter()


def _new_proof_id() -> str:
    return "prf_" + uuid.uuid4().hex[:12]


async def _verify_one(req: VerifyRequest, caller) -> VerifyResponse:
    proof_id = _new_proof_id()
    now = datetime.now(timezone.utc)
    bundle = req.proof_bundle

    # An authenticated caller's identity wins over whatever the body claims, so a
    # verifier cannot spend another verifier's nullifier namespace.
    verifier_id = caller.verifier_id if caller is not None else req.verifier_id

    result = verify_bundle(
        claim_type=bundle.claim_type.value,
        proof=bundle.proof,
        public_signals=bundle.public_signals,
        expected=req.expected,
        is_demo=bundle.demo,
    )

    fresh = True
    expires_at = None

    if result.valid and result.nullifier is not None:
        expiry = int(result.claims.get("expires_at", int(time.time()) + 86400))
        fresh, prior = await dependencies.nullifiers.check_and_register(
            nullifier=result.nullifier,
            verifier_id=verifier_id,
            claim_type=bundle.claim_type.value,
            expires_at=expiry,
        )
        expires_at = datetime.fromtimestamp(expiry, tz=timezone.utc)
        if not fresh:
            # Valid maths, but already spent. Not a valid verification.
            result.valid = False
            result.error = "proof already used (replay); request a fresh proof"

    await dependencies.audit.record(
        event_id=proof_id,
        verifier_id=verifier_id,
        claim_type=bundle.claim_type.value,
        valid=result.valid,
        trust_level=result.trust_level,
        nullifier=result.nullifier,
        error=result.error,
    )

    return VerifyResponse(
        valid=result.valid,
        claims=result.claims if result.valid else {},
        proof_id=proof_id,
        nullifier=result.nullifier,
        trust_level=result.trust_level,
        fresh=fresh,
        verified_at=now,
        expires_at=expires_at,
        error=result.error,
    )


@router.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest, caller=Depends(require_verifier)):
    return await _verify_one(req, caller)


@router.post("/verify/batch", response_model=BatchVerifyResponse)
async def verify_batch(req: BatchVerifyRequest, caller=Depends(require_verifier)):
    results = [await _verify_one(one, caller) for one in req.proofs]
    valid = sum(1 for r in results if r.valid)
    return BatchVerifyResponse(
        results=results,
        total=len(results),
        valid_count=valid,
        invalid_count=len(results) - valid,
    )
