"""
Turns a raw ZK proof into a set of human-meaningful claims.

Verification is two independent gates, and BOTH must pass:

  1. Cryptographic: does the Groth16 proof verify against the circuit's
     verification key? (services/groth16.py)
  2. Semantic: do the public signals actually say what the verifier asked?

Gate 1 alone is not enough, and this is the subtlety the whole design turns on.
A proof can be perfectly valid yet answer a different question — a valid age
proof for threshold 18 does not establish age >= 21, and a valid location proof
for Maharashtra does not establish Andhra Pradesh residency. Because our
circuits CONSTRAIN is_valid === 1, gate 1 already guarantees the claim inside
the proof is true; gate 2's job is to confirm that claim is the one the verifier
requested, and to translate the numeric signals into named claims.

The public-signal indices come from circuits/keys/signal_layout.json — the
shared contract. We never hardcode positions here.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

from services import encoding
from services.groth16 import (
    ProofFormatError,
    VerificationKeyError,
    load_verification_key,
    verify_groth16,
)

logger = logging.getLogger("zkgate.verifier")

# Circuit + key directory. Overridable so the container and the tests can point
# at different locations.
KEYS_DIR = Path(
    __import__("os").environ.get(
        "CIRCUIT_KEYS_DIR",
        str(Path(__file__).resolve().parent.parent.parent / "circuits" / "keys"),
    )
)

# How far the verifier's asserted "current date" may drift from the server's
# real clock. The date is a public input the client puts in the witness, so a
# malicious client could backdate or postdate it to shift an age result. We pin
# it to the server's wall clock within a day's tolerance.
MAX_DATE_SKEW_DAYS = 1


@dataclass
class VerificationResult:
    valid: bool
    claims: dict = field(default_factory=dict)
    nullifier: str | None = None
    trust_level: str = "demo"  # "demo" until in-circuit UIDAI attestation exists
    error: str | None = None


class _Layout:
    """Loads signal_layout.json once and answers 'what is signal i of circuit X'."""

    def __init__(self, path: Path):
        with path.open(encoding="utf-8") as fh:
            self._circuits = json.load(fh)["circuits"]
        self._vkeys: dict[str, dict] = {}

    def circuit_for_claim(self, claim_type: str) -> str | None:
        for snake, spec in self._circuits.items():
            if claim_type in spec["claims"]:
                return snake
        return None

    def names(self, snake: str) -> list[str]:
        return self._circuits[snake]["signals"]

    def n_public(self, snake: str) -> int:
        return self._circuits[snake]["n_public"]

    def vkey(self, snake: str) -> dict:
        if snake not in self._vkeys:
            self._vkeys[snake] = load_verification_key(
                KEYS_DIR / f"{snake}_verification_key.json"
            )
        return self._vkeys[snake]


_layout: _Layout | None = None


def get_layout() -> _Layout:
    global _layout
    if _layout is None:
        _layout = _Layout(KEYS_DIR / "signal_layout.json")
    return _layout


def _named_signals(snake: str, public_signals: list[str]) -> dict[str, str]:
    return dict(zip(get_layout().names(snake), public_signals))


# ── Age thresholds each named claim demands ──────────────────────────────────
_AGE_CLAIM_THRESHOLD = {
    "age_above_18": 18,
    "age_above_21": 21,
    "age_above_60": 60,
    "voter_eligible": 18,
}


def _reference_today():
    """Today, per the server. Overridable via ZKGATE_REFERENCE_DATE (YYYY-MM-DD)
    so tests and demos can pin a fixed 'now' — a committed proof bakes in its own
    date, and without a fixed reference every dated fixture would go stale after
    MAX_DATE_SKEW_DAYS of real time. Production leaves it unset and uses the clock."""
    import datetime as _dt
    import os as _os

    override = _os.environ.get("ZKGATE_REFERENCE_DATE", "").strip()
    if override:
        return _dt.date.fromisoformat(override)
    return _dt.datetime.now(_dt.timezone.utc).date()


def _date_is_fresh(sig: dict) -> bool:
    """The client-asserted current_* date must be near the server's reference date."""
    import datetime as _dt

    try:
        y = int(sig["current_year"]); m = int(sig["current_month"]); d = int(sig["current_day"])
        asserted = _dt.date(y, m, d)
    except (KeyError, ValueError):
        return False
    delta = abs((_reference_today() - asserted).days)
    return delta <= MAX_DATE_SKEW_DAYS


def _build_claims(
    claim_type: str, snake: str, sig: dict, expected: dict
) -> tuple[bool, dict, str | None]:
    """
    Confirm the proof answers the requested question and describe what it proved.

    Returns (ok, claims, error). `expected` carries what the verifier asked for
    (age_threshold, required_state_code, ...) so we can reject a valid-but-off-
    topic proof.
    """
    claims: dict = {}

    # Every circuit binds verifier_id and expiry. Freshness of expiry is enforced
    # by the nullifier registry TTL; here we just surface it.
    claims["expires_at"] = int(sig["expiry_timestamp"])

    if claim_type in _AGE_CLAIM_THRESHOLD:
        want = _AGE_CLAIM_THRESHOLD[claim_type]
        proven = int(sig["age_threshold"])
        # The proof must have been built for AT LEAST the threshold this claim
        # needs. A proof of ">= 18" cannot satisfy a request for ">= 21".
        if proven < want:
            return False, {}, f"proof establishes age>={proven}, claim needs age>={want}"
        if not _date_is_fresh(sig):
            return False, {}, "proof's current date is not fresh"
        claims[claim_type] = True
        claims["age_threshold_proven"] = proven

    elif claim_type in ("state_resident", "district_resident"):
        req_state = int(expected.get("required_state_code", 0))
        if int(sig["required_state_code"]) != req_state:
            return False, {}, "proof was not bound to the requested state"
        proved_state = int(sig["proved_state_code"])
        claims["state_resident"] = True
        claims["state_code"] = proved_state
        claims["state_name"] = encoding.state_name(proved_state)
        if claim_type == "district_resident":
            req_dist = int(expected.get("required_district_code", 0))
            if req_dist == 0 or int(sig["required_district_code"]) != req_dist:
                return False, {}, "district claim requires a district to be bound"
            claims["district_resident"] = True

    elif claim_type == "india_citizen":
        claims["india_citizen"] = True

    elif claim_type == "compound_kyc":
        want_age = int(expected.get("age_threshold", 18))
        if int(sig["age_threshold"]) < want_age:
            return False, {}, "compound proof age threshold too low"
        req_state = int(expected.get("required_state_code", 0))
        if int(sig["required_state_code"]) != req_state:
            return False, {}, "compound proof not bound to the requested state"
        if not _date_is_fresh(sig):
            return False, {}, "compound proof's current date is not fresh"
        claims["compound_kyc"] = True
        claims["india_citizen"] = True
        claims[f"age_above_{want_age}"] = True
        claims["state_code"] = int(sig["proved_state_code"])
        claims["state_name"] = encoding.state_name(int(sig["proved_state_code"]))

    elif claim_type == "pan_holder":
        claims["pan_holder"] = True
        # A per-verifier handle the verifier can dedup on without learning the PAN.
        claims["pan_pseudonym"] = sig["pan_pseudonym"]

    else:
        return False, {}, f"unknown claim type: {claim_type}"

    return True, claims, None


def verify_bundle(
    claim_type: str,
    proof: dict,
    public_signals: list[str],
    expected: dict | None = None,
    is_demo: bool = True,
) -> VerificationResult:
    """
    Full verification of one proof bundle: crypto gate, then semantic gate.

    `expected` is what the verifier requested (from their verification request).
    `is_demo` reflects whether the citizen's client attested the UIDAI signature
    for real or in demo mode — it never affects the maths, only the trust_level
    we report, so a verifier can decide whether a demo proof is acceptable.
    """
    expected = expected or {}
    layout = get_layout()

    snake = layout.circuit_for_claim(claim_type)
    if snake is None:
        return VerificationResult(False, error=f"unsupported claim type: {claim_type}")

    if len(public_signals) != layout.n_public(snake):
        return VerificationResult(
            False,
            error=f"{claim_type} expects {layout.n_public(snake)} public signals, "
            f"got {len(public_signals)}",
        )

    # ── Gate 1: cryptographic ──
    try:
        ok = verify_groth16(layout.vkey(snake), public_signals, proof)
    except (ProofFormatError, VerificationKeyError) as exc:
        return VerificationResult(False, error=f"malformed proof: {exc}")
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("verifier crashed")
        return VerificationResult(False, error=f"verification error: {exc}")

    if not ok:
        return VerificationResult(False, error="proof failed cryptographic verification")

    sig = _named_signals(snake, public_signals)

    # is_valid === 1 is enforced inside the circuit, so a verifying proof already
    # has it — but assert it here too, because this invariant is load-bearing and
    # a future circuit change must not silently weaken it.
    if sig.get("is_valid") != "1":
        return VerificationResult(False, error="proof verified but is_valid != 1")

    # ── Gate 2: semantic ──
    good, claims, err = _build_claims(claim_type, snake, sig, expected)
    if not good:
        return VerificationResult(False, error=err)

    return VerificationResult(
        valid=True,
        claims=claims,
        nullifier=sig["nullifier"],
        trust_level="demo" if is_demo else "attested",
    )
