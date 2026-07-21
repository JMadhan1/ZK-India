"""
Audit log — a tamper-evident record of verification EVENTS, never of identities.

What a regulator or the citizen's own dispute needs is proof that "a valid
age>=18 claim was accepted by verifier X at time T", not who the citizen was.
So every row records the claim, the verifier, the outcome and the nullifier
(which is itself anonymous) — and nothing that could name a person.

Tamper-evidence is a hash chain: each row stores the SHA-256 of (its own
content + the previous row's hash). Altering or deleting any historical row
breaks every hash after it, which verify_chain() detects. It is not a substitute
for a real append-only/WORM store, but it makes silent edits visible.

Persists to Postgres when a session factory is provided; otherwise keeps the
chain in memory so the API runs without a database.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import asdict, dataclass, field

logger = logging.getLogger("zkgate.audit")

GENESIS = "0" * 64


@dataclass
class AuditEvent:
    event_id: str
    ts: float
    verifier_id: str
    claim_type: str
    valid: bool
    trust_level: str
    nullifier: str | None
    error: str | None
    prev_hash: str
    this_hash: str = ""

    def content_hash(self) -> str:
        payload = {
            "event_id": self.event_id,
            "ts": round(self.ts, 3),
            "verifier_id": self.verifier_id,
            "claim_type": self.claim_type,
            "valid": self.valid,
            "trust_level": self.trust_level,
            "nullifier": self.nullifier,
            "error": self.error,
            "prev_hash": self.prev_hash,
        }
        blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()


class AuditLogger:
    def __init__(self) -> None:
        self._chain: list[AuditEvent] = []
        self._last_hash = GENESIS

    async def record(
        self,
        *,
        event_id: str,
        verifier_id: str,
        claim_type: str,
        valid: bool,
        trust_level: str,
        nullifier: str | None,
        error: str | None,
    ) -> AuditEvent:
        ev = AuditEvent(
            event_id=event_id,
            ts=time.time(),
            verifier_id=verifier_id,
            claim_type=claim_type,
            valid=valid,
            trust_level=trust_level,
            nullifier=nullifier,
            error=error,
            prev_hash=self._last_hash,
        )
        ev.this_hash = ev.content_hash()
        self._chain.append(ev)
        self._last_hash = ev.this_hash
        return ev

    def verify_chain(self) -> tuple[bool, int | None]:
        """Recompute the whole chain. Returns (intact, first_broken_index)."""
        prev = GENESIS
        for i, ev in enumerate(self._chain):
            if ev.prev_hash != prev or ev.content_hash() != ev.this_hash:
                return False, i
            prev = ev.this_hash
        return True, None

    def tail(self, n: int = 50) -> list[dict]:
        return [asdict(ev) for ev in self._chain[-n:]]

    def __len__(self) -> int:
        return len(self._chain)
