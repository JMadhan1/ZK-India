"""
Direct tests of the pairing verifier — the crypto core, tested in isolation from
the API so a failure points straight at the maths.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from services.groth16 import (
    BN128_R,
    ProofFormatError,
    load_verification_key,
    verify_groth16,
)
from tests.conftest import FIXTURES

KEYS = Path(__file__).resolve().parent.parent.parent / "circuits" / "keys"


def vkey(snake):
    return load_verification_key(KEYS / f"{snake}_verification_key.json")


def test_accepts_a_real_proof():
    p = FIXTURES["age18"]
    assert verify_groth16(vkey("age_proof"), p["public_signals"], p["proof"]) is True


def test_rejects_flipped_public_signal():
    p = FIXTURES["age18"]
    sig = list(p["public_signals"])
    sig[0] = "0"
    assert verify_groth16(vkey("age_proof"), sig, p["proof"]) is False


def test_rejects_tampered_proof_point():
    p = FIXTURES["age18"]
    proof = copy.deepcopy(p["proof"])
    proof["pi_a"][0] = str((int(proof["pi_a"][0]) + 1))
    # Off-curve point must be a clean False, not an exception.
    assert verify_groth16(vkey("age_proof"), p["public_signals"], proof) is False


def test_rejects_wrong_public_signal_count():
    p = FIXTURES["age18"]
    with pytest.raises(ProofFormatError):
        verify_groth16(vkey("age_proof"), p["public_signals"][:-1], p["proof"])


def test_rejects_signal_outside_field():
    p = FIXTURES["age18"]
    sig = list(p["public_signals"])
    sig[2] = str(BN128_R + 5)  # not a legal field element
    with pytest.raises(ProofFormatError):
        verify_groth16(vkey("age_proof"), sig, p["proof"])


def test_proof_for_one_circuit_fails_under_another_key():
    # An age proof must not verify against the citizenship key.
    p = FIXTURES["age18"]
    # nPublic differs, so this should raise rather than silently pass.
    with pytest.raises(ProofFormatError):
        verify_groth16(vkey("citizenship_proof"), p["public_signals"], p["proof"])
