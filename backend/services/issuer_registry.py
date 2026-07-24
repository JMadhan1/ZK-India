"""
Issuer registry — which enrolment-authority EdDSA keys does this deployment
trust to have genuinely checked a UIDAI signature before issuing a credential?

This is the backend half of the fix described in docs/UIDAI_INTEGRATION.md:
circuits/src/ageProof.circom no longer takes a client-asserted signature_valid
bit — it verifies, in-circuit, an EdDSA-Poseidon signature over a commitment to
the citizen's attributes, from a specific issuer public key. That in-circuit
check proves the signature is genuine; it does NOT by itself tell a verifier
whether that issuer's key is one anyone should trust. That is exactly what a
registry is for — the same reason backend/services/verifier_registry.py exists
for verifiers rather than accepting any verifier_id.

An issuer here is meant to be a licensed AUA/KUA (a bank, telco, or Common
Service Centre already authorised by UIDAI to perform Aadhaar e-KYC) — see
scripts/issuer/issue_credential.mjs for the reference enrolment-authority
implementation that produces credentials against a registered key.

For the prototype this is an in-memory table seeded with one demo issuer.
Production would back it with a governance process (who gets empanelled, how
a compromised key is revoked) — the interface here is deliberately small so
that swap is local, mirroring verifier_registry.py.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Issuer:
    pubkey_ax: str      # decimal string, as it appears in the proof's public signals
    pubkey_ay: str
    name: str
    active: bool = True


class IssuerRegistry:
    def __init__(self) -> None:
        self._by_key: dict[tuple[str, str], Issuer] = {}
        self._seed_demo()

    def _seed_demo(self) -> None:
        # The keypair scripts/issuer/issue_credential.mjs generates on first run
        # (scripts/issuer/demo_issuer_key.json, gitignored). Registering the
        # matching public key here is what lets the backend report
        # trust_level: "attested" for credentials signed by it instead of
        # "demo" — register real empanelled AUA/KUA keys the same way in
        # production. Left unregistered by default: a deployment must
        # deliberately opt an issuer in, rather than trusting whatever key a
        # proof happens to name.
        pass

    def register(self, *, pubkey_ax: str, pubkey_ay: str, name: str) -> Issuer:
        issuer = Issuer(pubkey_ax=pubkey_ax, pubkey_ay=pubkey_ay, name=name)
        self._by_key[(pubkey_ax, pubkey_ay)] = issuer
        return issuer

    def get(self, pubkey_ax: str, pubkey_ay: str) -> Issuer | None:
        issuer = self._by_key.get((pubkey_ax, pubkey_ay))
        return issuer if issuer and issuer.active else None

    def is_trusted(self, pubkey_ax: str, pubkey_ay: str) -> bool:
        return self.get(pubkey_ax, pubkey_ay) is not None

    def list_public(self) -> list[dict]:
        return [
            {"name": i.name, "pubkey_ax": i.pubkey_ax, "pubkey_ay": i.pubkey_ay, "active": i.active}
            for i in self._by_key.values()
        ]


_registry: IssuerRegistry | None = None


def get_issuer_registry() -> IssuerRegistry:
    global _registry
    if _registry is None:
        _registry = IssuerRegistry()
    return _registry
