# Execution Plan — Closing the Gap With (and Beyond) Anon Aadhaar

This file is the single source of truth for what is actually missing in this
repository, why it matters, and the atomic, day-by-day steps to close it —
starting from the codebase exactly as it stands today, not from an aspirational
description of it. Every claim below was checked directly against source files
in this repo before being written down.

> **Read this before believing the status tables in `README.md`.** Some of
> them describe intent, not verified fact. This document only states what was
> actually confirmed by reading the code.

---

## 1. What "greater than Anon Aadhaar" actually means

Anon Aadhaar (Ethereum Foundation / PSE) is the closest prior art. It is
**not** production-ready either (their own docs say so), but it has one
property this repo does not yet have: **in-circuit verification of a real
UIDAI signature, with zero trusted intermediary**, for the document channel it
targets (the printed Aadhaar QR code).

"Greater than Anon Aadhaar" is not a vibe — it decomposes into four concrete,
checkable properties:

| # | Property | Anon Aadhaar | This repo, today |
|---|---|---|---|
| A | In-circuit verification of a **real UIDAI signature**, no trusted issuer | ✅ (RSA-SHA256 over the printed QR) | ⚠️ Partial — only `age_proof`, and it verifies **our own reference issuer's** signature, not UIDAI's (see §2) |
| B | Same, but over the **offline eKYC XML** (OTP-gated, masked Aadhaar digits, rotating reference ID — a channel Anon Aadhaar does not use) | ❌ Not attempted | ❌ Not started — **this is the open wedge, nobody has shipped it** |
| C | No per-circuit trusted-setup ceremony (universal/updatable setup) | 🔶 Actively researched (Halo2/Noir, presented at Devcon SEA 2024) | ❌ Not started — still Circom + Groth16 + single-party ceremony |
| D | A deployable verification **service** (not just circuits + SDK) | ❌ They ship circuits/SDK only | ✅ Built — backend, semantic gate, nullifier registry, audit chain |

Row D is real and already an advantage. Rows A–C are the actual work. This
plan's Week 1 goal is: **close row A fully (all circuits, not just one),
and produce a credible, evidence-backed spike on row B and a written decision
on row C.** Row B done properly is a multi-week effort in its own right (see
§5) — Week 1 gets it from "not started" to "prototyped and estimated," which
is the honest, achievable target.

---

## 2. Verified current state (checked against source, not docs)

- **Build status is unverified end-to-end.** This dev environment has no
  `circom` compiler. `circuits/src/ageProof.circom` was changed (issuer-credential
  upgrade) but never recompiled here. `circuits/keys/age_proof_verification_key.json`
  and `backend/tests/fixtures.json` are stale — generated from the old 8-signal
  circuit while `circuits/keys/signal_layout.json` now expects 10. **Nothing
  claimed as "done" for `age_proof` has actually been proven to run.**
- **Only `age_proof` closed the signature-attestation gap**, via
  `circuits/src/helpers/issuerCredential.circom` — an EdDSA-Poseidon check
  against a signature from `backend/services/issuer_registry.py`'s registered
  key(s). This is a **trusted-issuer** model (Option 2 in `docs/UIDAI_INTEGRATION.md`),
  not direct UIDAI verification.
- **Four circuits still contain the raw stub**, confirmed by direct grep of
  `circuits/src/`:
  - `citizenshipProof.circom:32` — `signature_valid === 1;`
  - `locationProof.circom:51` — `signature_valid === 1;`
  - `compoundProof.circom:56` — `signature_valid === 1;`
  - `panProof.circom:50` — `signature_valid === 1;`
- **Proving stack is Circom + snarkjs only** (`circuits/package.json`) — Groth16
  over BN128, single-party trusted setup (`docs/TRUSTED_SETUP.md` already flags
  this as not production-grade). No Halo2/Noir/universal-setup work exists in
  this repo at all.
- **The backend service layer is real and the strongest asset here** — semantic
  gate, nullifier registry, hash-chained audit log, issuer registry with
  trust-level resolution, all with passing unit tests that don't depend on
  circom output (`backend/tests/test_issuer_registry.py`).

---

## 3. Week 1 — atomic execution plan

Each task lists: **what**, **files touched**, **definition of done**. Do them
in order — later days depend on earlier ones building cleanly.

### Day 1 — Get the build honest (foundation for everything else)

1. Install `circom` 2.x and confirm `circom --version` runs.
2. `npm install` at repo root; create/refresh `.venv` and
   `pip install -r backend/requirements.txt`.
3. Run `npm run build:circuits` (→ `scripts/build_circuits.sh`). Fix whatever
   breaks — this is the first real compile of the issuer-credential version of
   `ageProof.circom`.
4. Regenerate `backend/tests/fixtures.json`'s `age_proof` entries against the
   newly built circuit (method: `scripts/e2e_demo.mjs` or however the existing
   fixtures were originally produced — check git history for the pattern).
5. Run `bash scripts/run_tests.sh` end to end.
   - **Definition of done:** circuits, SDK, and backend test suites all pass
     against freshly built artifacts — zero stale fixtures, zero skipped
     layers. Commit the regenerated keys/fixtures.

### Day 2 — Close the gap on `citizenship_proof` (smallest circuit first)

1. In `circuits/src/citizenshipProof.circom`, replace the
   `signal input signature_valid; ... signature_valid === 1;` block with a
   call to `circuits/src/helpers/issuerCredential.circom`, following the exact
   pattern used in `ageProof.circom`. `india_citizen` needs the least — just
   proof of a genuine issuer-signed commitment to the secret, no DOB/state
   attributes required.
2. Add two public inputs (`issuer_pubkey_ax`, `issuer_pubkey_ay`), mirroring
   `ageProof.circom`'s change; bump `citizenship_proof.n_public` in
   `circuits/keys/signal_layout.json`.
3. Extend `scripts/issuer/issue_credential.mjs` to issue citizenship-scoped
   commitments (or confirm the existing one is generic enough already).
4. Update `sdk/src/prover.js`'s `buildWitness()` for `citizenship_proof` to
   require the issuer credential, matching the `age_proof` error-on-missing
   pattern.
5. Update/add tests in `sdk/test/aadhaar.test.mjs` and
   `backend/tests/test_issuer_registry.py` for the citizenship path.
   - **Definition of done:** `citizenshipProof.circom` has no
     `signature_valid` stub left; full test suite green.

### Day 3 — Close the gap on `location_proof`

Same pattern as Day 2, applied to `circuits/src/locationProof.circom`. This
one is more involved because location claims carry real attributes
(state/district) that must be bound into the same commitment the issuer
signs — make sure the commitment includes state/district/pincode, not just
the secret, or a forged location becomes possible even with a valid signature.
- **Definition of done:** no `signature_valid` stub in `locationProof.circom`;
  a test proving a *tampered* state value fails even with a genuine issuer
  signature (this is the specific attack the naive version of this change
  would miss).

### Day 4 — Close the gap on `compound_proof` and `pan_proof`

1. `compoundProof.circom` combines age + state + Aadhaar validity — the
   commitment the issuer signs must cover all three attributes bound to one
   secret, preserving the "provably one person" property called out in
   `docs/CLAIMS.md`.
2. `panProof.circom` is the trickiest: it needs the issuer to attest
   `pan_linked` truthfully, which means the reference issuer
   (`scripts/issuer/issue_credential.mjs`) needs a real (even if synthetic for
   now) PAN-linkage input to sign over — don't let this become a second stub
   wearing the first stub's clothes.
   - **Definition of done:** zero occurrences of `signal input signature_valid`
     anywhere under `circuits/src/` (confirm with a repo-wide grep). Every
     circuit's `trust_level` in `backend/services/proof_verifier.py` is now
     driven by `_resolve_trust_level()` against the issuer registry, not a
     caller-supplied flag, for all five claim types.

### Day 5 — Full rebuild, full regression, honest status update

1. `npm run build:circuits` for all five circuits from scratch; regenerate
   every verification key and every fixture.
2. `bash scripts/run_tests.sh` — all green, no stale artifacts anywhere.
3. Update `README.md`'s status table and `docs/UIDAI_INTEGRATION.md` to state,
   accurately, that all five circuits now use the issuer-credential model
   (Option 2) — **do not** describe this as "UIDAI-verified"; it is
   issuer-verified. Say exactly that, in those words, in the docs. This
   precision is itself part of what makes the project credible to reviewers.
   - **Definition of done:** Property A from §1 is fully closed and *honestly
     documented* as what it is — a uniform, tested, real issuer-credential
     model across all claims. Row D (the backend) already stood; now the
     circuit layer is uniformly real, not real-in-one-place-stub-elsewhere.

### Day 6 — Spike: in-circuit offline-XML signature verification (Property B)

This is research, not a finished feature — say so in the output, don't
overclaim.

1. Inspect `test-data/uidai_public_key.pem` and `test-data/generate_test_xml.py`
   to confirm the exact structure of a real offline eKYC XML's `<Signature>`
   block: algorithm (expected RSA-SHA256), canonicalization method (expected
   Exclusive XML Canonicalization, `http://www.w3.org/2001/10/xml-exc-c14n#`),
   and what exactly gets signed (the `<SignedInfo>` digest over
   `<UidData>`/`<Poi>`/`<Poa>` etc.).
2. **Outside the circuit first**, in Node or Python, reproduce the signature
   verification against a real (or realistic synthetic) signed XML using the
   published UIDAI certificate, to confirm you understand the exact byte
   sequence being signed before trying to constrain it. This is the same
   discipline the repo already used for the issuer-credential work — verify in
   plaintext before verifying in-circuit.
3. Estimate the constraint count for RSA-2048-SHA256 verification plus
   canonicalization in Circom (ballpark from public reference circuits such as
   `circom-rsa-verify`), and compare it against Anon Aadhaar's published
   benchmarks for their QR-based equivalent.
4. Write findings to a new `docs/XML_SIGNATURE_SPIKE.md`: what's confirmed
   about the XML structure, what a Circom implementation would cost in
   constraints/proving time, and a go/no-go recommendation for Circom vs. a
   universal-setup system (see Day 7).
   - **Definition of done:** a written, evidence-based spike document exists —
     not a working circuit yet, but no longer a guess either.

### Day 7 — Proving-system decision, trusted-setup transparency, comparison doc

1. Write `docs/PROVING_SYSTEM_EVALUATION.md`: a short, specific evaluation of
   whether to follow Anon Aadhaar's own direction (Halo2/Noir, universal
   setup) for the next circuit built, referencing their Devcon SEA 2024 talk
   directly. State a recommendation, not just options.
2. Write `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`: even without executing it yet,
   a concrete plan for a multi-party ceremony (candidate participant types:
   an academic crypto lab, a CERT-In-empanelled auditor, a civil-society
   reviewer) — a documented plan is itself a credibility artifact per the
   earlier discussion of what a government reviewer looks for.
3. Write `docs/COMPARISON_ANON_AADHAAR.md`: the real, outward-facing version of
   the table in §1, now with rows A–D reflecting the state *after* this week's
   work, not before it. This is the document you'd actually attach to a
   GitHub issue or a message to their team.
   - **Definition of done:** three new docs exist, the README's status table
     matches reality, and there is one specific, true, checkable claim you can
     make that Anon Aadhaar cannot: *"every claim type in this repo uses a real,
     tested, issuer-verified signature — zero self-asserted stubs — and here is
     our evidence-based path to full UIDAI in-circuit verification over the
     offline-XML channel, a document format nobody has publicly closed."*

---

## 4. What Week 1 deliberately does NOT finish (and why)

Be explicit about this with anyone you show this plan to — overclaiming here
is exactly the credibility risk flagged earlier.

- **Property B (in-circuit offline-XML UIDAI verification) is not finished
  after Week 1** — it's spiked and estimated. The repo's own docs already
  called this "a project of its own"; treating it as a one-week deliverable
  would repeat the mistake being fixed. Weeks 2–4+ (below) are for building it
  for real.
- **Property C (universal trusted setup) is a decision, not an implementation,**
  after Week 1.
- **A real multi-party trusted-setup ceremony is not executed** — only planned.
  Running it for real requires actual independent participants, which is a
  scheduling/outreach task, not a coding task.

## 5. Beyond Week 1 — the roadmap this plan sets up

1. **Weeks 2–4:** Implement Property B for real — in-circuit RSA-SHA256 +
   canonicalization over the offline eKYC XML, starting with the smallest
   viable claim (likely `citizenship_proof`, since `docs/CLAIMS.md` already
   notes it has the fewest public signals).
2. **Weeks 3–5 (parallel):** Execute the Day 7 proving-system decision — if it
   favors a universal-setup system, build one circuit on it as a proof of
   concept and benchmark against the Circom/Groth16 version.
3. **Week 5+:** Run the real multi-party trusted-setup ceremony per the
   Day 7 plan; publish transcripts.
4. **Ongoing from here:** the government-readiness track from the earlier
   conversation — DPDP-by-design documentation, tracking the next MeitY-NeGD
   DPDP Innovation Challenge cycle, one real pilot integration with a verifier,
   STQC/CERT-In empanelment.
5. **Only once Property B has real, working code** (even partial): open the
   first concrete, specific contact with the Anon Aadhaar team — a GitHub
   issue/PR or a direct message referencing their Devcon SEA Halo2/Noir talk —
   using `docs/COMPARISON_ANON_AADHAAR.md` as the artifact, not a pitch.
