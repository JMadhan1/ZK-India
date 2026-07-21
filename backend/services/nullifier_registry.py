"""
Nullifier registry — the replay guard.

Every proof carries a nullifier: Poseidon(aadhaar_secret, verifier_id, expiry).
The first time a (claim_type, nullifier) pair is seen it is recorded; a second
sighting before it expires is a replay and is refused.

Two things worth stating plainly about privacy:

  * A nullifier is a hash of a secret that never leaves the citizen's device.
    Storing every nullifier ever seen tells an attacker who breaches this store
    exactly nothing about any citizen — there is no identity in here to leak.

  * The registry key is (claim_type, nullifier), NOT the nullifier alone. Within
    one session (fixed verifier_id + expiry) the nullifier is the SAME across all
    of a citizen's circuits, because it is deliberately independent of the claim.
    Keying on the pair lets a citizen present, say, a citizenship proof and an
    age proof to the same verifier in one session without the second being
    misread as a replay of the first, while still catching a true replay — where
    claim_type AND nullifier both repeat.

Falls back to an in-process store when Redis is absent, so the API and its tests
run with no infrastructure. The fallback is single-process and non-durable and
is not for production; NullifierRegistry.backend tells you which is active.
"""

from __future__ import annotations

import json
import logging
import time

logger = logging.getLogger("zkgate.nullifier")


class _MemoryStore:
    """Minimal Redis stand-in: SET NX with TTL, GET, TTL, INCR. Not thread-safe
    beyond asyncio's single thread; fine for dev and tests."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}

    def _expired(self, key: str) -> bool:
        item = self._data.get(key)
        if item is None:
            return True
        _, exp = item
        if exp is not None and exp < time.time():
            self._data.pop(key, None)
            return True
        return False

    async def set_nx(self, key: str, value: str, ttl: int) -> bool:
        if not self._expired(key):
            return False
        self._data[key] = (value, time.time() + ttl if ttl > 0 else None)
        return True

    async def get(self, key: str) -> str | None:
        if self._expired(key):
            return None
        return self._data[key][0]

    async def ttl(self, key: str) -> int:
        if self._expired(key):
            return -2
        _, exp = self._data[key]
        return int(exp - time.time()) if exp else -1

    async def incr(self, key: str) -> int:
        cur = 0 if self._expired(key) else int(self._data[key][0])
        cur += 1
        _, exp = self._data.get(key, (None, None))
        self._data[key] = (str(cur), exp)
        return cur

    async def ping(self) -> bool:
        return True


class NullifierRegistry:
    KEY = "zkgate:nul:"
    STAT = "zkgate:stat:"

    def __init__(self, redis_url: str | None = None):
        self.backend = "memory"
        self._store: object = _MemoryStore()
        if redis_url:
            try:
                import redis.asyncio as aioredis

                self._store = aioredis.from_url(redis_url, decode_responses=True)
                self.backend = "redis"
            except Exception as exc:  # pragma: no cover
                logger.warning("Redis unavailable (%s); using in-memory registry", exc)

    def _key(self, claim_type: str, nullifier: str) -> str:
        return f"{self.KEY}{claim_type}:{nullifier}"

    async def check_and_register(
        self, nullifier: str, verifier_id: str, claim_type: str, expires_at: int
    ) -> tuple[bool, dict | None]:
        """
        Atomically record a first sighting.

        Returns (is_fresh, prior_record). is_fresh False means this exact proof
        was already used — a replay — and prior_record describes the first use.
        The record's TTL is the proof's own lifetime, so an expired proof frees
        its slot and a fresh proof for the next session is unaffected.
        """
        key = self._key(claim_type, nullifier)
        ttl = max(1, expires_at - int(time.time()))
        record = json.dumps(
            {
                "claim_type": claim_type,
                # Hash the verifier id even here — the registry should hold no
                # plaintext identifiers of anyone, verifiers included.
                "verifier": hash(verifier_id) % 10**9,
                "registered_at": int(time.time()),
                "expires_at": expires_at,
            }
        )

        fresh = await self._call_set_nx(key, record, ttl)
        if fresh:
            await self._bump(claim_type, "verified")
            return True, None

        prior_raw = await self._call_get(key)
        await self._bump(claim_type, "replay")
        logger.warning("replay refused: %s %s…", claim_type, nullifier[:16])
        return False, json.loads(prior_raw) if prior_raw else None

    async def status(self, claim_type: str, nullifier: str) -> dict | None:
        raw = await self._call_get(self._key(claim_type, nullifier))
        if raw is None:
            return None
        data = json.loads(raw)
        data["expires_in_seconds"] = await self._call_ttl(self._key(claim_type, nullifier))
        return data

    async def stats(self) -> dict:
        today = time.strftime("%Y-%m-%d")
        out = {}
        for event in ("verified", "replay"):
            out[event] = int(await self._call_get(f"{self.STAT}{event}:{today}") or 0)
        out["backend"] = self.backend
        return out

    async def health(self) -> bool:
        try:
            return bool(await self._call_ping())
        except Exception:
            return False

    async def _bump(self, claim_type: str, event: str) -> None:
        today = time.strftime("%Y-%m-%d")
        try:
            await self._call_incr(f"{self.STAT}{event}:{today}")
            await self._call_incr(f"{self.STAT}{claim_type}:{event}:{today}")
        except Exception:  # stats are best-effort, never fail a verification for them
            pass

    # ── thin adapters so the same code drives redis and the memory store ──
    async def _call_set_nx(self, key, value, ttl):
        if self.backend == "redis":
            return bool(await self._store.set(key, value, ex=ttl, nx=True))
        return await self._store.set_nx(key, value, ttl)

    async def _call_get(self, key):
        return await self._store.get(key)

    async def _call_ttl(self, key):
        return await self._store.ttl(key)

    async def _call_incr(self, key):
        return await self._store.incr(key)

    async def _call_ping(self):
        return await self._store.ping()
