"""Request/response schemas. These are the API's contract; keep them boring."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ClaimType(str, Enum):
    AGE_ABOVE_18 = "age_above_18"
    AGE_ABOVE_21 = "age_above_21"
    AGE_ABOVE_60 = "age_above_60"
    VOTER_ELIGIBLE = "voter_eligible"
    STATE_RESIDENT = "state_resident"
    DISTRICT_RESIDENT = "district_resident"
    INDIA_CITIZEN = "india_citizen"
    COMPOUND_KYC = "compound_kyc"
    PAN_HOLDER = "pan_holder"


class ProofBundle(BaseModel):
    """A complete ZK proof as emitted by the citizen's browser (snarkjs shape)."""

    proof: dict[str, Any] = Field(..., description="Groth16 proof: pi_a, pi_b, pi_c, protocol")
    public_signals: list[str] = Field(..., description="Circuit public signals, in layout order")
    claim_type: ClaimType
    circuit_version: str = Field(default="1.0.0")
    generated_at: int = Field(..., description="Unix seconds when the proof was generated")
    demo: bool = Field(
        default=True,
        description="True if the UIDAI signature was accepted in demo mode rather "
        "than cryptographically verified against the real UIDAI key.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "proof": {
                    "pi_a": ["123…", "456…", "1"],
                    "pi_b": [["a…", "b…"], ["c…", "d…"], ["1", "0"]],
                    "pi_c": ["x…", "y…", "1"],
                    "protocol": "groth16",
                    "curve": "bn128",
                },
                "public_signals": ["1", "2165713258…", "18", "2026", "7", "14", "99999", "1783699200"],
                "claim_type": "age_above_18",
                "circuit_version": "1.0.0",
                "generated_at": 1783699000,
                "demo": True,
            }
        }
    }


class VerifyRequest(BaseModel):
    proof_bundle: ProofBundle
    verifier_id: str = Field(..., description="Registered verifier identifier (API key holder)")
    expected: dict[str, Any] = Field(
        default_factory=dict,
        description="What the verifier asked for: age_threshold, required_state_code, "
        "required_district_code. Used to reject a valid-but-off-topic proof.",
    )
    purpose: str | None = Field(None, description="Free-text purpose, for the verifier's own audit")


class VerifyResponse(BaseModel):
    """Verification result. Contains ZERO personal data by construction."""

    valid: bool
    claims: dict[str, Any] = Field(default_factory=dict)
    proof_id: str
    nullifier: str | None = None
    trust_level: str = Field("demo", description="'demo' or 'attested'")
    fresh: bool = Field(True, description="False if this nullifier was seen before (replay)")
    verified_at: datetime
    expires_at: datetime | None = None
    error: str | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "valid": True,
                "claims": {"age_above_18": True, "age_threshold_proven": 18},
                "proof_id": "prf_7f3a8b2c",
                "nullifier": "2165713258…",
                "trust_level": "demo",
                "fresh": True,
                "verified_at": "2026-07-15T14:23:00Z",
                "expires_at": "2026-07-16T14:23:00Z",
            }
        }
    }


class BatchVerifyRequest(BaseModel):
    proofs: list[VerifyRequest] = Field(..., max_length=100)


class BatchVerifyResponse(BaseModel):
    results: list[VerifyResponse]
    total: int
    valid_count: int
    invalid_count: int
