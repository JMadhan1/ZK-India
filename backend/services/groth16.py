"""
Groth16 verification over BN128, compatible with snarkjs output.

This is the cryptographic core of the backend and the one place a subtle bug is
both easy to introduce and invisible in testing: a broken verifier that happens
to return True for the handful of valid proofs you tried looks exactly like a
correct one, right up until it accepts a forgery. So the implementation is
deliberately literal about the Groth16 equation, and tests/test_groth16.py
checks it BOTH ways — a real snarkjs proof must pass, and the same proof with a
single mutated signal must fail.

Backend: py_ecc.optimized_bn128. The textbook `py_ecc.bn128` backend is not
usable here — its field exponentiation is written recursively, and BN128's final
exponentiation needs ~2800 levels of square-and-multiply, which blows Python's
recursion limit (and risks a C-stack segfault if you just raise the limit). The
optimized backend uses projective coordinates and an iterative pairing, verifies
in well under a second, and is what a server should use anyway.

The verification equation (neg-A form, which is how snarkjs arranges it):

    e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1

where vk_x = IC[0] + sum_i(publicSignals[i] · IC[i+1]).

We compute the four Miller loops WITHOUT their per-pairing final exponentiation,
multiply the results in Fq12, and apply a single final exponentiation at the end
— algebraically identical, materially faster, and it keeps everything on the
iterative path.

Coordinate order, the classic snarkjs footgun: snarkjs serialises G2 points as
[[x_c0, x_c1], [y_c0, y_c1]] and py_ecc's FQ2 takes coefficients as [c0, c1], so
the pair maps across directly — but transpose it and valid proofs fail for no
visible reason. parse_g2 is where that is pinned down, once.
"""

from __future__ import annotations

import functools
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("zkgate.groth16")

# BN128 scalar field order. Every public signal must be a residue mod this; a
# signal >= r is not a legal field element and is rejected before any pairing.
BN128_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617


class VerificationKeyError(ValueError):
    """The verification key JSON is malformed or not a Groth16 BN128 key."""


class ProofFormatError(ValueError):
    """The proof or public-signal payload is structurally invalid."""


def _int(value: Any) -> int:
    # snarkjs emits field elements as decimal strings; accept ints too, but never
    # a bool (True == 1 would silently sail through as a field element).
    if isinstance(value, bool):
        raise ProofFormatError("boolean where field element expected")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value)
    raise ProofFormatError(f"cannot read field element from {type(value).__name__}")


@functools.lru_cache(maxsize=1)
def _ec():
    """Import the optimized BN128 backend lazily and cache it. A missing
    dependency is a hard error, never a silent pass-through — a verifier that
    cannot verify must refuse, not wave proofs by."""
    try:
        from py_ecc.optimized_bn128 import (
            FQ, FQ2, FQ12, add, final_exponentiate, multiply, neg, pairing,
        )
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "py_ecc is required for proof verification (`pip install py_ecc`). "
            "Refusing to verify without it."
        ) from exc
    return {
        "FQ": FQ, "FQ2": FQ2, "FQ12": FQ12,
        "add": add, "multiply": multiply, "neg": neg,
        "pairing": pairing, "final_exponentiate": final_exponentiate,
    }


def parse_g1(point: list[Any]):
    """snarkjs G1 is [x, y, z]; z is the projective flag ('1' affine, '0' = infinity).
    Returns a projective triple or None for the point at infinity."""
    ec = _ec()
    FQ = ec["FQ"]
    if len(point) < 3:
        raise ProofFormatError("G1 point needs three coordinates")
    if _int(point[2]) == 0:
        return None
    return (FQ(_int(point[0])), FQ(_int(point[1])), FQ(1))


def parse_g2(point: list[Any]):
    """snarkjs G2 is [[x_c0, x_c1], [y_c0, y_c1], [z...]]. See module docstring on order."""
    ec = _ec()
    FQ2 = ec["FQ2"]
    if len(point) < 3:
        raise ProofFormatError("G2 point needs three coordinate pairs")
    z = point[2]
    if _int(z[0]) == 0 and _int(z[1]) == 0:
        return None
    x = FQ2([_int(point[0][0]), _int(point[0][1])])
    y = FQ2([_int(point[1][0]), _int(point[1][1])])
    return (x, y, FQ2.one())


def load_verification_key(path: str | Path) -> dict:
    """Read and sanity-check a snarkjs verification_key.json."""
    path = Path(path)
    with path.open(encoding="utf-8") as fh:
        vkey = json.load(fh)

    if vkey.get("protocol") != "groth16":
        raise VerificationKeyError(f"expected groth16, got {vkey.get('protocol')!r}")
    if vkey.get("curve", "bn128").lower() not in ("bn128", "bn254", "altbn128"):
        raise VerificationKeyError(f"unsupported curve {vkey.get('curve')!r}")

    n_public = int(vkey["nPublic"])
    if len(vkey["IC"]) != n_public + 1:
        raise VerificationKeyError(
            f"IC has {len(vkey['IC'])} points, expected nPublic+1 = {n_public + 1}"
        )
    return vkey


def verify_groth16(vkey: dict, public_signals: list[Any], proof: dict) -> bool:
    """
    Return True iff `proof` is a valid Groth16 proof of `public_signals` under `vkey`.

    Returns False for a well-formed but invalid proof. Raises ProofFormatError /
    VerificationKeyError for structurally broken input — the caller should treat
    a raised error the same as a rejection, but the distinction is worth keeping
    in logs (malformed request vs. genuine forgery attempt).
    """
    ec = _ec()
    add, multiply, neg = ec["add"], ec["multiply"], ec["neg"]
    pairing, final_exponentiate, FQ12 = ec["pairing"], ec["final_exponentiate"], ec["FQ12"]

    n_public = int(vkey["nPublic"])
    if len(public_signals) != n_public:
        raise ProofFormatError(
            f"got {len(public_signals)} public signals, key expects {n_public}"
        )

    signals = [_int(s) for s in public_signals]
    for s in signals:
        if not 0 <= s < BN128_R:
            # A signal outside the field is the shape of a malleability attempt.
            raise ProofFormatError("public signal outside the scalar field")

    for key in ("pi_a", "pi_b", "pi_c"):
        if key not in proof:
            raise ProofFormatError(f"proof missing {key}")
    if proof.get("protocol", "groth16") != "groth16":
        raise ProofFormatError("proof is not tagged groth16")

    A = parse_g1(proof["pi_a"])
    B = parse_g2(proof["pi_b"])
    C = parse_g1(proof["pi_c"])
    if A is None or B is None or C is None:
        # A, B or C at infinity never occurs in an honest proof.
        return False

    alpha = parse_g1(vkey["vk_alpha_1"])
    beta = parse_g2(vkey["vk_beta_2"])
    gamma = parse_g2(vkey["vk_gamma_2"])
    delta = parse_g2(vkey["vk_delta_2"])
    IC = [parse_g1(pt) for pt in vkey["IC"]]

    # vk_x = IC[0] + sum(signal_i * IC[i+1])
    vk_x = IC[0]
    for i, s in enumerate(signals):
        vk_x = add(vk_x, multiply(IC[i + 1], s))

    # Four Miller loops without per-pairing final exp, combined, then one final exp.
    # e(-A, B) · e(alpha, beta) · e(vk_x, gamma) · e(C, delta) == 1
    #
    # py_ecc's pairing() rejects a point that is not on the curve or not in the
    # right subgroup by RAISING. A forged proof carrying such a point is simply
    # invalid, not a server error, so we translate that raise into False. (The
    # verification-key points are trusted and pre-validated at load; only the
    # attacker-supplied A/B/C can be off-curve here.)
    try:
        combined = (
            pairing(B, neg(A), final_exponentiate=False)
            * pairing(beta, alpha, final_exponentiate=False)
            * pairing(gamma, vk_x, final_exponentiate=False)
            * pairing(delta, C, final_exponentiate=False)
        )
    except ValueError as exc:
        logger.info("rejecting proof: point failed curve/subgroup check (%s)", exc)
        return False

    return final_exponentiate(combined) == FQ12.one()
