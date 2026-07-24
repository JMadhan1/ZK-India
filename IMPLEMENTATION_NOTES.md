# Implementation notes — closing the signature_valid stub on all five circuits

What changed, and what was actually built, run, and verified. As of
2026-07-24 all five circuits are re-keyed and the full suite passes (34/34
circuit, 9/9 SDK, 30/30 backend) — see "Why the build originally 'never
finished' — corrected" for how the earlier build blocker (a corrupt ptau,
**not** a CPU/OneDrive limitation) was diagnosed and fixed.

## What changed

| File | What |
| --- | --- |
| `circuits/src/helpers/issuerCredential.circom` | Added `IssuerCredentialCheckN(N)` (generic, N-attribute commitment) and `IssuerCredentialCheckSecretOnly()`, alongside the existing fixed 4-input `IssuerCredentialCheck()` that `age_proof` already used. |
| `circuits/src/citizenshipProof.circom` | `signature_valid === 1` stub replaced by `IssuerCredentialCheckSecretOnly()` — commitment = Poseidon(secret) only, no DOB/address. |
| `circuits/src/locationProof.circom` | Stub replaced by `IssuerCredentialCheckN(3)` — commitment binds `state_code, district_code, pincode, secret`, not just the secret (closes the specific "genuine signature, forged location" attack). |
| `circuits/src/compoundProof.circom` | Stub replaced by `IssuerCredentialCheckN(5)` — commitment binds `dob_year, dob_month, dob_day, state_code, district_code, secret`. |
| `circuits/src/panProof.circom` | Stub replaced by `IssuerCredentialCheckN(1)` — commitment binds `pan_hash, secret`. Also **removed** the separate self-asserted `pan_linked` bit entirely; the credential's existence now IS the linkage attestation. |
| `circuits/keys/signal_layout.json` | `n_public` bumped for all four (citizenship 4→6, location 9→11, compound 11→13, pan 5→7); `issuer_pubkey_ax/ay` appended to each. |
| `scripts/issuer/issue_credential.mjs` | Added a generic `issueCredential(prvKey, attrs, secret)` plus `issueCitizenshipCredential`, `issueLocationCredential`, `issueCompoundCredential`, `issuePanCredential` wrappers. |
| `sdk/src/prover.js` | `buildWitness()` now requires `issuerCredential` for **every** claim type, not just `age_proof`; the `signatureValid` parameter is gone. |
| `sdk/test/aadhaar.test.mjs`, `circuits/test/*.test.mjs`, `circuits/test/helpers.mjs` | Rewritten to issue real per-fixture credentials instead of a `signature_valid: 1` flag; added tampered-signature and tampered-attribute (e.g. "genuine AP signature replayed against Maharashtra") tests per circuit. |
| `backend/services/proof_verifier.py` | `_resolve_trust_level()` generalised from an `age_proof`-only special case to all five claim types uniformly. |
| `backend/tests/test_issuer_registry.py` | Replaced the now-false `test_other_circuits_still_use_the_is_demo_flag` with a test covering all five circuits' uniform trust resolution. |
| `frontend/lib/prove.ts` | Added a **demo-only** local issuer-credential signer (hardcoded, never registered, resolves to `trust_level: "demo"`) so the browser demo still produces valid witnesses — the real issuer key must never live in browser code; see the file's own header comment. |
| `scripts/e2e_demo.mjs` | Updated to obtain a real issuer credential via `scripts/issuer/issue_credential.mjs` instead of the old `signatureValid` flag. |
| `scripts/build_circuits.sh` | `PTAU_POWER` bumped 12 → 16: `age_proof`'s EdDSA-Poseidon check grew it to ~9,639 wires, which no longer fits a 2^12 ceremony. |
| `scripts/regenerate_fixtures.mjs` | New: regenerates every entry in `backend/tests/fixtures.json` against the current circuits (real Groth16 proofs, not hand-edited). `npm run regenerate:fixtures`. |
| `README.md`, `docs/UIDAI_INTEGRATION.md`, `test-data/README.md` | Updated to state precisely: **issuer-verified, not UIDAI-verified** — see those files for why that distinction is deliberate. |
| `docs/XML_SIGNATURE_SPIKE.md`, `docs/PROVING_SYSTEM_EVALUATION.md`, `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`, `docs/COMPARISON_ANON_AADHAAR.md` | New — see each file; not summarised here. |

Confirmed by repo-wide grep: **zero occurrences of `signal input signature_valid` remain anywhere in `circuits/src/`.**

## What was actually run and verified in this sandbox

This sandbox has `circom` 2.2.3, Node, and Python, and all of those succeeded.
What did NOT succeed is `snarkjs`'s Groth16 trusted-setup step for
circuits of this size — see the next section. Everything that doesn't depend
on a compiled `.zkey` was run for real:

- All 5 circuits **compile cleanly** with circom (confirmed: `age_proof`
  8,110 non-linear + 1,551 linear constraints; the other four each in the
  low hundreds before their issuer-credential additions).
- All 5 circuits are **re-keyed and verified** (2026-07-24). `npm run
  build:circuits` compiled every circuit and ran the 2^16 Groth16 setup for
  all five in **~95 seconds** total once the ptau below was fixed.
- `bash scripts/run_tests.sh` is **fully green**: 34/34 circuit tests, 9/9
  SDK tests, 30/30 backend pytest.

## Why the build originally "never finished" — corrected

**The earlier diagnosis in this section (CPU throttling / OneDrive I/O) was
wrong.** The true cause was a **corrupt `circuits/keys/pot16_final.ptau`**.
The 2026-07-22 generation had been interrupted and left a truncated 33.5 MB
file whose section table was `0,1,2,3,4,5,6,7,12,<garbage>` — it had the
phase-2 section 12 but was **missing sections 13/14/15** (the tauG2 /
alphaTau / betaTau Lagrange tables) and ended in a garbage section id.

`snarkjs groth16 setup` passes its `!sections[12]` "is it prepared?" check,
then hangs indefinitely trying to read the missing/garbage sections. This is
why *every* setup — including a trivial 1-constraint test circuit — hung, and
why it looked like a compute-size problem. (Confirmed by benchmarking:
single-threaded curve ops and threaded MSM both ran in milliseconds, but
`newZKey` never emitted its first log line — the stall was in ptau parsing,
before any real arithmetic.)

**The fix**: regenerate the ptau properly
(`powersoftau new → contribute → prepare phase2`). A valid pot16 is **~75 MB**
with sections 12–15 all present; the setup then completes in seconds per
circuit. On a checkout that is *not* inside a OneDrive-synced folder,
`npm run build:circuits` runs natively with no special handling.

## Reproducing / regenerating from scratch

```bash
# If circuits/keys/pot16_final.ptau is ever missing or corrupt, delete it and
# build_circuits.sh will regenerate a fresh ceremony automatically.
npm run build:circuits              # compiles all 5, runs 2^16 setup, exports
                                    # keys + copies wasm/zkey to frontend/public
node scripts/regenerate_fixtures.mjs  # rebuilds backend/tests/fixtures.json
bash scripts/run_tests.sh           # circuits + SDK + backend, all green
```

Note: `circuits/keys/*_final.zkey`, `circuits/keys/*.ptau`,
`circuits/build/*`, and `frontend/public/circuits/*` are **gitignored**
(large, regenerable). Only the small `*_verification_key.json` and
`signal_layout.json` — which the backend actually needs — are tracked, and
those were updated in this pass. Anyone cloning fresh must run
`npm run build:circuits` to produce the proving keys locally.
