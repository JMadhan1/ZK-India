# Circuits

Five Circom circuits, all Groth16 over BN128.

| Source | Artifact name | Public signals | What it proves |
| --- | --- | --- | --- |
| `src/ageProof.circom` | `age_proof` | 8 | age ≥ threshold, without revealing DOB |
| `src/locationProof.circom` | `location_proof` | 9 | residency at country/state/district/pincode granularity |
| `src/citizenshipProof.circom` | `citizenship_proof` | 4 | possession of a UIDAI-signed Aadhaar |
| `src/compoundProof.circom` | `compound_proof` | 11 | citizen + age + state, bound to one person |
| `src/panProof.circom` | `pan_proof` | 5 | linked PAN + a per-verifier pseudonym |

Shared helpers in `src/helpers/`: `dateUtils.circom` (age across the birthday
boundary + date range checks), `nullifier.circom` (the Poseidon replay guard).

## The one idea to take away

These circuits **constrain** their claims rather than **reporting** them. Instead
of outputting `is_valid ∈ {0,1}` for the verifier to check, each asserts
`is_valid === 1`. Consequence: a false claim has no satisfying witness, so snarkjs
cannot even build a proof for it. "The proof exists" ⇒ "the claim is true." A
verifier cannot forget to check a flag, because there is no flag to forget.

The tests lean on this: `expectUnprovable()` asserts that witness generation
*fails* for every false claim (minor proving 18, wrong state, forged signature,
future DOB, a `proof_level` that overstates what was checked, …).

## Build

```bash
npm run build:circuits      # from the repo root
```

Compiles each circuit, runs the Powers of Tau + Groth16 setup, exports
verification keys, and copies wasm + proving keys to `frontend/public/circuits/`.
See [../docs/TRUSTED_SETUP.md](../docs/TRUSTED_SETUP.md) — the prototype's setup is
single-party and not production-grade.

## Test

```bash
node --test circuits/test/ageProof.test.mjs \
             circuits/test/locationProof.test.mjs \
             circuits/test/compoundProof.test.mjs
```

29 tests. They generate real proofs and verify them, and assert the public-signal
layout matches [`keys/signal_layout.json`](keys/signal_layout.json) — the contract
the backend and SDK also read.
