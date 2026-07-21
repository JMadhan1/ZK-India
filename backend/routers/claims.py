"""
Claim catalogue and geography encoding.

A verifier integrating ZKGate needs two things from us before they can ask for a
proof: the list of claims they can request, and the numeric codes to put in a
proof request (so the citizen's circuit and our verifier agree on "Andhra
Pradesh" == 28). Both are served here so no one hardcodes a table.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services import encoding
from services.proof_verifier import get_layout

router = APIRouter()


CLAIM_CATALOGUE = {
    "age_above_18": {"circuit": "age_proof", "reveals": "nothing beyond 'age >= 18'",
                     "needs": ["age_threshold=18", "current date"]},
    "age_above_21": {"circuit": "age_proof", "reveals": "nothing beyond 'age >= 21'",
                     "needs": ["age_threshold=21", "current date"]},
    "age_above_60": {"circuit": "age_proof", "reveals": "nothing beyond 'age >= 60'",
                     "needs": ["age_threshold=60", "current date"]},
    "voter_eligible": {"circuit": "age_proof", "reveals": "'age >= 18'",
                       "needs": ["age_threshold=18", "current date"]},
    "state_resident": {"circuit": "location_proof", "reveals": "the state, nothing narrower",
                       "needs": ["required_state_code"]},
    "district_resident": {"circuit": "location_proof", "reveals": "state + district",
                          "needs": ["required_state_code", "required_district_code"]},
    "india_citizen": {"circuit": "citizenship_proof", "reveals": "only that a signed Aadhaar exists",
                      "needs": []},
    "compound_kyc": {"circuit": "compound_proof",
                     "reveals": "citizen + age threshold + state, one proof",
                     "needs": ["age_threshold", "required_state_code"]},
    "pan_holder": {"circuit": "pan_proof",
                   "reveals": "holds a linked PAN + a per-verifier pseudonym",
                   "needs": []},
}


@router.get("/claims")
async def list_claims():
    """Every claim a verifier can request, and what each one does and doesn't reveal."""
    layout = get_layout()
    for name, spec in CLAIM_CATALOGUE.items():
        snake = spec["circuit"]
        spec["public_signals"] = layout.names(snake)
    return {"claims": CLAIM_CATALOGUE}


@router.get("/encode/state")
async def encode_state(name: str):
    """Map a state name (as spelled in an Aadhaar XML) to its census code."""
    code = encoding.encode_state(name)
    if code == 0:
        raise HTTPException(404, f"unknown state: {name!r}")
    return {"name": name, "state_code": code, "canonical": encoding.state_name(code)}


@router.get("/encode/district")
async def encode_district(state: str, district: str):
    """Map (state, district) to the namespaced district code the circuit compares."""
    state_code = encoding.encode_state(state)
    if state_code == 0:
        raise HTTPException(404, f"unknown state: {state!r}")
    return {
        "state": encoding.state_name(state_code),
        "state_code": state_code,
        "district": district,
        "district_code": encoding.encode_district(state_code, district),
    }
