-- ZKGate India — initial schema
--
-- Read this table list as a privacy statement: there is no citizens table, no
-- names, no dates of birth, no addresses, no Aadhaar numbers. There is nowhere
-- in this schema for personal data to live, by design. What we persist is
-- anonymous: verification events, the nullifiers that have been spent, and the
-- verifier directory.

-- Registered institutions that may call /verify.
CREATE TABLE IF NOT EXISTS verifiers (
    verifier_id   TEXT PRIMARY KEY,      -- numeric string, bound into the circuit
    name          TEXT NOT NULL,
    api_key_hash  TEXT NOT NULL,         -- sha256 of the key; the key itself is never stored
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spent nullifiers. A nullifier is Poseidon(secret, verifier_id, expiry) and
-- reveals nothing about the citizen. (claim_type, nullifier) is unique so one
-- citizen can present different claims to the same verifier in a session while
-- a true replay is still caught. Redis is the hot path; this is the durable
-- backstop.
CREATE TABLE IF NOT EXISTS nullifiers (
    claim_type    TEXT NOT NULL,
    nullifier     TEXT NOT NULL,
    verifier_hash BIGINT NOT NULL,       -- hashed verifier id, not the plaintext
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (claim_type, nullifier)
);
CREATE INDEX IF NOT EXISTS idx_nullifiers_expiry ON nullifiers (expires_at);

-- Tamper-evident audit chain. Each row's hash covers the previous row's hash,
-- so any edit or deletion breaks the chain from that point on.
CREATE TABLE IF NOT EXISTS audit_events (
    seq          BIGSERIAL PRIMARY KEY,
    event_id     TEXT NOT NULL UNIQUE,
    ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
    verifier_id  TEXT NOT NULL,
    claim_type   TEXT NOT NULL,
    valid        BOOLEAN NOT NULL,
    trust_level  TEXT NOT NULL,
    nullifier    TEXT,                   -- anonymous
    error        TEXT,
    prev_hash    CHAR(64) NOT NULL,
    this_hash    CHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_verifier ON audit_events (verifier_id, ts);
