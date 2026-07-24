"""
Unit tests for the issuer registry and the age_proof trust-level resolution
added when the client-asserted signature_valid stub was replaced by an
in-circuit EdDSA issuer credential (see docs/UIDAI_INTEGRATION.md and
circuits/src/helpers/issuerCredential.circom).

These deliberately do NOT go through a real Groth16 proof — the age_proof
circuit's public-signal layout changed (8 -> 10 signals, see
circuits/keys/signal_layout.json), so the proofs committed in fixtures.json
are stale against it until the circuit is recompiled and new fixtures are
generated on a machine with circom 2.x (this sandbox has none — see
IMPLEMENTATION_NOTES.md). What CAN be tested without circom is the registry
and the trust_level decision logic itself, using a synthetic public-signal
dict shaped the way the real one will be once regenerated.
"""

from __future__ import annotations

from services.issuer_registry import IssuerRegistry
from services.proof_verifier import _resolve_trust_level


def test_unregistered_issuer_key_reports_demo():
    sig = {"issuer_pubkey_ax": "111", "issuer_pubkey_ay": "222"}
    assert _resolve_trust_level("age_proof", sig, is_demo=False) == "demo"


def test_registered_issuer_key_reports_attested(monkeypatch):
    registry = IssuerRegistry()
    registry.register(pubkey_ax="111", pubkey_ay="222", name="Demo Bank AUA")

    import services.proof_verifier as pv

    monkeypatch.setattr(pv, "get_issuer_registry", lambda: registry)

    sig = {"issuer_pubkey_ax": "111", "issuer_pubkey_ay": "222"}
    assert _resolve_trust_level("age_proof", sig, is_demo=False) == "attested"


def test_deactivated_issuer_key_falls_back_to_demo(monkeypatch):
    registry = IssuerRegistry()
    issuer = registry.register(pubkey_ax="111", pubkey_ay="222", name="Revoked AUA")
    issuer.active = False

    import services.proof_verifier as pv

    monkeypatch.setattr(pv, "get_issuer_registry", lambda: registry)

    sig = {"issuer_pubkey_ax": "111", "issuer_pubkey_ay": "222"}
    assert _resolve_trust_level("age_proof", sig, is_demo=False) == "demo"


def test_all_five_circuits_resolve_trust_uniformly_via_the_registry(monkeypatch):
    # Every circuit closed its signature_valid stub — trust_level is now
    # driven by the issuer registry for all five claim types, not by the
    # caller-supplied is_demo flag (which no longer affects the outcome).
    registry = IssuerRegistry()
    registry.register(pubkey_ax="111", pubkey_ay="222", name="Demo Bank AUA")

    import services.proof_verifier as pv

    monkeypatch.setattr(pv, "get_issuer_registry", lambda: registry)

    trusted_sig = {"issuer_pubkey_ax": "111", "issuer_pubkey_ay": "222"}
    unregistered_sig = {"issuer_pubkey_ax": "999", "issuer_pubkey_ay": "888"}
    for snake in ("age_proof", "citizenship_proof", "location_proof", "compound_proof", "pan_proof"):
        assert _resolve_trust_level(snake, trusted_sig, is_demo=True) == "attested"
        assert _resolve_trust_level(snake, trusted_sig, is_demo=False) == "attested"
        assert _resolve_trust_level(snake, unregistered_sig, is_demo=False) == "demo"
