"""
Verifier registry — who is allowed to call /verify, and as whom.

A verifier is an institution (a bank, a liquor retailer, a government portal).
Each holds an API key and a stable numeric `verifier_id` that the citizen's
circuit binds the nullifier and pseudonym to. That binding is what makes
nullifiers unlinkable ACROSS verifiers, so the id has to be stable and public.

For the prototype this is an in-memory table seeded with a couple of demo
verifiers. Production would back it with Postgres and issue keys through an
onboarding flow — the interface here is deliberately small so that swap is local.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass


@dataclass
class Verifier:
    verifier_id: str        # numeric string; bound into the circuit
    name: str
    api_key_hash: str
    active: bool = True


def _hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


class VerifierRegistry:
    def __init__(self) -> None:
        self._by_id: dict[str, Verifier] = {}
        self._id_by_keyhash: dict[str, str] = {}
        self._seed_demo()

    def _seed_demo(self) -> None:
        # Two well-known demo verifiers. The keys are printed in the docs; they
        # are not secrets, they exist so the demo and tests have something to use.
        self.register(verifier_id="99999", name="Demo Bank (KYC)", api_key="demo-bank-key")
        self.register(verifier_id="88888", name="Demo Liquor Retailer (age)", api_key="demo-age-key")

    def register(self, *, verifier_id: str, name: str, api_key: str | None = None) -> tuple[Verifier, str]:
        api_key = api_key or ("zkg_" + secrets.token_urlsafe(24))
        v = Verifier(verifier_id=verifier_id, name=name, api_key_hash=_hash_key(api_key))
        self._by_id[verifier_id] = v
        self._id_by_keyhash[v.api_key_hash] = verifier_id
        return v, api_key

    def get(self, verifier_id: str) -> Verifier | None:
        return self._by_id.get(verifier_id)

    def authenticate(self, api_key: str) -> Verifier | None:
        vid = self._id_by_keyhash.get(_hash_key(api_key))
        if vid is None:
            return None
        v = self._by_id[vid]
        return v if v.active else None

    def list_public(self) -> list[dict]:
        # Never expose key hashes.
        return [
            {"verifier_id": v.verifier_id, "name": v.name, "active": v.active}
            for v in self._by_id.values()
        ]
