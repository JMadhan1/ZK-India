# ZK-India / EXECUTION_PLAN.md — handoff status

Source of truth for scope: `EXECUTION_PLAN.md` (7-day plan to close the
`signature_valid` stub on all five circuits, spike the offline-XML channel,
and produce proving-system/trusted-setup/comparison docs).

## ✅ Done and verified (code + logic level, no circuit compile needed)

- **Days 2–4**: all five circuits' `signature_valid` stubs closed with real
  in-circuit EdDSA-Poseidon issuer-credential checks — confirmed by
  repo-wide grep, zero occurrences remain in `circuits/src/`.
  - `citizenship_proof`: commitment = Poseidon(secret) only.
  - `location_proof`: commitment binds state/district/pincode + secret —
    tested that a genuine signature over one state fails if replayed
    against a tampered state/district/pincode.
  - `compound_proof`: commitment binds dob+state+district + secret.
  - `pan_proof`: commitment binds pan_hash + secret — this ALSO removed the
    separate self-asserted `pan_linked` bit, not just `signature_valid`.
  - New generic templates `IssuerCredentialCheckN(N)` and
    `IssuerCredentialCheckSecretOnly()` added to
    `circuits/src/helpers/issuerCredential.circom`.
- SDK (`sdk/src/prover.js`), backend trust-level resolution
  (`backend/services/proof_verifier.py`), issuer-credential issuing script
  (`scripts/issuer/issue_credential.mjs`), and all test files updated to
  match.
- **17 tests actually run and passing** on the crypto logic itself (no
  circom needed): 9 SDK tests (`sdk/test/`), 7 issuer-credential tests
  (`scripts/issuer/issuerCredential.test.mjs`, including the tampered-state/
  district/pincode/DOB/PAN attacks), plus 4 backend issuer-registry tests.
  Backend pytest is now **30/30** (was 22/30 before the re-key — the 8
  failures were exactly the ones needing fresh circuit keys; see the RESOLVED
  section below).
- **Days 6–7 docs**, all written with real citations (Anon Aadhaar's
  published 1.1M-constraint figure, circom-rsa-verify's 536K benchmark, the
  actual Devcon SEA 2024 Halo2/Noir talk):
  - `docs/XML_SIGNATURE_SPIKE.md`
  - `docs/PROVING_SYSTEM_EVALUATION.md`
  - `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`
  - `docs/COMPARISON_ANON_AADHAAR.md`
- `README.md`, `docs/UIDAI_INTEGRATION.md`, `test-data/README.md` updated to
  say precisely "issuer-verified, not UIDAI-verified."
- Full file-by-file diff and command-level test output: `IMPLEMENTATION_NOTES.md`.

## ✅ RESOLVED — re-keyed and fully green (2026-07-24)

All 5 circuits are re-keyed and the **entire suite passes**:
`bash scripts/run_tests.sh` → **34/34 circuit tests, 9/9 SDK tests, 30/30
backend pytest, "All suites passed."**

**The real root cause was NOT OneDrive.** The earlier OneDrive/bind-mount
theory was a red herring — it only slowed the (cheap) circom *compile* step.
The actual blocker: **`circuits/keys/pot16_final.ptau` was corrupt.** The
2026-07-22 generation had been interrupted and left a truncated 33 MB file
whose section table was `0,1,2,3,4,5,6,7,12,<garbage>` — it had section 12
but was **missing the phase-2 Lagrange sections 13/14/15**. `snarkjs`'s
`groth16 setup` passes its `!sections[12]` "is it prepared" check, then spins
forever trying to read the missing/garbage sections. Every setup — even a
trivial 1-constraint circuit — hung on it, which is exactly why it looked
like a compute/size problem. (Diagnosis path: single-threaded curve ops
benchmarked fast, threaded MSM benchmarked fast, but `newZKey` never emitted
its first log line → the stall was in ptau parsing, before any real math.)

**The fix**: regenerated a valid `pot16_final.ptau` (proper
`new`→`contribute`→`prepare phase2`, now 75 MB with sections 12–15 present),
then `npm run build:circuits` completed all 5 circuits in **95 seconds**.
A clean container that `COPY`s the repo off the OneDrive path
(`scripts/_tmp_circuit_build.Dockerfile`, image `zkgate-circuit-build`) was
used only to keep the heavy step off the synced folder; on a non-OneDrive
checkout `npm run build:circuits` runs natively with no special handling.

**Bugs found and fixed while getting to green** (all were latent because the
circuit/backend tests had never actually run against real keys before):
- `circuits/test/helpers.mjs` — a block comment contained a literal `*/`
  (`IssuerCredentialCheck*/…`) that closed the comment early and made every
  circuit test file a `SyntaxError`. Reworded.
- `scripts/regenerate_fixtures.mjs` — it did `Object.assign(witness, REF)`
  (the pinned current-date) for **every** claim, but only the age/compound
  circuits declare a `current_year` input, so circom rejected the
  location/citizen/pan witnesses with "Too many values for input signal
  current_year". Now guarded with `if ("current_year" in witness)`.
- Fixture `EXPIRY` was `1783699200` (2026-07-10) — already in the past. The
  backend derives the nullifier replay-registry TTL from `expiry - now`, so a
  past value clamped it to ~1 s and made the two replay tests fail. Bumped to
  `2068070400` (2035-07-15); the circuits only fold expiry into the nullifier
  hash, never compare it to a date, so this is cryptographically neutral.
  (`conftest.py`'s `generated_at` bumped to match.)
- `scripts/run_tests.sh` — added `--test-force-exit` to the circuit-test
  invocation (snarkjs leaves worker threads alive, so the runner hung after
  every assertion passed), and switched the SDK invocation from the bare
  `node --test test/` (Node 20 only) to `node --test test/*.mjs` (works on
  Node 20 and 22+/25).

**Artifacts now on disk (uncommitted, per the "only commit when asked"
rule)**: fresh `circuits/keys/*_final.zkey` + `*_verification_key.json` +
`pot16_final.ptau`, fresh `circuits/build/*`, `frontend/public/circuits/*`
(citizen-portal wasm+zkey), and a regenerated `backend/tests/fixtures.json`.

## ⏳ Remaining (optional / needs owner sign-off)

- **Commit** the regenerated keys/build/fixtures + the four source fixes
  above (all currently uncommitted).
- **`scripts/_tmp_circuit_build.Dockerfile`**: keep or delete. Given the true
  blocker was the corrupt ptau (not OneDrive), a native `npm run
  build:circuits` works fine off a normal checkout, so the Dockerfile is no
  longer load-bearing — it's just a convenience for building inside this
  OneDrive-synced folder. Also clean up the leftover `zkbuild` container and
  `zkgate-circuit-build` image if not keeping them.
