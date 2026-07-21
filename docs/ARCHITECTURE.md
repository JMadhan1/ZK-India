# Architecture

## Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  CITIZEN'S DEVICE (browser)                                          │
│                                                                     │
│   Aadhaar XML ──► parseAadhaarXml ──► fields (DOB, state, pincode)  │
│                        │                                            │
│                   deriveSecret (Poseidon)                          │
│                        │                                            │
│                   buildWitness ──► snarkjs.groth16.fullProve       │
│                        │                    │ (wasm + zkey,        │
│                        │                    │  fetched as static)  │
│                        ▼                    ▼                       │
│                   { proof, publicSignals }                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS  (only the proof; never the XML)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VERIFICATION API (FastAPI)                                         │
│                                                                     │
│   POST /v1/verify                                                  │
│     1. groth16.verify_groth16   ── pairing check (py_ecc)          │
│     2. semantic gate            ── do signals match the ask?       │
│     3. nullifier registry       ── first use? or replay?           │
│     4. audit chain              ── hash-linked event log           │
│                        │                                            │
│                        ▼                                            │
│                 { valid, claims, nullifier, trust_level }          │
│                                                                     │
│   State: Redis (nullifiers) + Postgres (audit) — both optional,    │
│          in-memory fallbacks for local dev.                        │
└─────────────────────────────────────────────────────────────────────┘
```

The **verifier portal** and **citizen portal** are thin Next.js clients over this
API and the SDK. The **SDK** is the shared client library both the portal and
third-party integrators use.

## Data flow, and what is where

| Value | Lives on citizen device | Sent to server | In the proof (public) |
| --- | :--: | :--: | :--: |
| Date of birth | ✔ | ✕ | ✕ |
| Name, photo | ✔ | ✕ | ✕ |
| Full address, pincode | ✔ | ✕ | ✕ |
| Aadhaar number | ✔ | ✕ | ✕ |
| `aadhaar_secret` | ✔ | ✕ | ✕ |
| Age threshold met (bool) | — | — | ✔ |
| State code (only if asked) | — | — | ✔ |
| Nullifier (anonymous hash) | — | ✔ | ✔ |
| Verifier id, expiry | — | ✔ | ✔ |

The rightmost column *is* what the server receives — the proof's public signals
are the only citizen-derived data that crosses the wire, and none of it is
personal.

## The signal-layout contract

snarkjs emits public signals as a bare array of strings with no field names.
[`circuits/keys/signal_layout.json`](../circuits/keys/signal_layout.json) is the
single source of truth mapping index → meaning, shared by the circuits, the
backend and the SDK. If it drifts from the `.circom` sources, the backend reads
the wrong field and still reports "valid" — a silent correctness bug. It is
therefore asserted by both the circuit tests and the backend tests.

## Threat model (what each mechanism defends against)

| Threat | Defence |
| --- | --- |
| Verifier learns personal data | Nothing personal is in the proof; XML never leaves the device |
| Underage user forges an age proof | Circuit constrains `is_valid === 1`; no witness exists for a false claim |
| Valid proof reused (replay / double-spend) | Nullifier registry, keyed on `(claim_type, nullifier)`, first-use-wins |
| Valid proof answers a *different* question | Semantic gate checks signals against the verifier's `expected` block |
| Two verifiers link a citizen across services | Nullifier binds `verifier_id`, so it differs per verifier |
| Verifier backdates/forwards "today" to shift an age | Server pins the proof's `current_*` date to its own clock (±1 day) |
| Forged proof with off-curve points | Verifier rejects points failing the curve/subgroup check |
| Malleable public signal ≥ field order | Verifier rejects signals outside the scalar field |
| Silent tampering of the audit log | Hash-chained events; `verify_chain()` detects any edit |
| **Client lies that the XML was UIDAI-signed** | **Not defended in the prototype — see UIDAI_INTEGRATION.md** |

The last row is the known gap. Everything above it is implemented and tested.

## Why Groth16 / BN128

Groth16 gives the smallest proofs (~800 bytes) and cheapest verification (a few
pairings) of the practical SNARKs — the right trade for "millions of citizens
generate proofs, institutions verify at scale." BN128 is the curve with mature
tooling across circom, snarkjs and py_ecc, and native precompiles on common
chains should on-chain verification ever be wanted. The cost is a per-circuit
trusted setup (see TRUSTED_SETUP.md).
