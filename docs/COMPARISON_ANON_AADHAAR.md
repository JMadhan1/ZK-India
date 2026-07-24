# ZKGate India vs. Anon Aadhaar — where this project stands, honestly

This is the outward-facing version of the table in `EXECUTION_PLAN.md` §1,
now reflecting state **after** the work described in that plan, not before
it. Intended to be attached to a GitHub issue or message to the Anon Aadhaar
team directly — every claim below is checkable against this repo's source,
the same discipline `EXECUTION_PLAN.md` itself was held to.

Anon Aadhaar (Ethereum Foundation / PSE) is the closest prior art. It is not
production-ready either — their own docs say so — and nothing here is a
claim of superiority across the board. It's a claim about four specific,
checkable properties.

| # | Property | Anon Aadhaar | ZKGate India |
|---|---|---|---|
| A | In-circuit verification of a real signature over the citizen's attested attributes, no self-asserted trust bit | ✅ RSA-SHA256 over the printed/QR Secure QR code, verified in-circuit against UIDAI's public key directly | ✅ EdDSA-Poseidon issuer-credential verified in-circuit, uniformly across all five claim circuits (age, location, citizenship, compound KYC, PAN) — see `circuits/src/helpers/issuerCredential.circom` |
| B | Same, but over the offline eKYC XML (OTP-gated, masked Aadhaar digits, rotating reference ID — a channel Anon Aadhaar does not use) | ❌ Not attempted — confirmed directly from their own documentation, which describes only the QR/byte-array channel | 🔶 Spiked and estimated, not implemented — `docs/XML_SIGNATURE_SPIKE.md` reproduces the exact digest/sign mechanics outside the circuit and estimates the in-circuit cost at low millions of constraints, with real citations, not guesses |
| C | No per-circuit trusted-setup ceremony (universal/updatable setup) | 🔶 Actively researched — Halo2/Noir, presented at Devcon SEA 2024 by PSE's Hridam Basu, with a Circom/Halo2/Noir comparative benchmark | 🔶 Evaluated, decision made for the next circuit only — `docs/PROVING_SYSTEM_EVALUATION.md` recommends staying on Groth16 for the five shipped circuits (small, cheap to re-ceremony) and moving to a universal-setup system specifically for the offline-XML circuit, when built |
| D | A deployable verification **service** (not just circuits + SDK) | ❌ Ships circuits/SDK only | ✅ Backend verification service, semantic gate (crypto validity ≠ claim validity — see `backend/services/proof_verifier.py`), nullifier registry, hash-chained audit log, issuer registry with trust-level resolution — all with a passing test suite |

## What changed this week, specifically

Before this pass, only `age_proof` had closed the trusted-issuer gap; the
other four circuits (`citizenship_proof`, `location_proof`, `compound_proof`,
`pan_proof`) still contained a raw `signal input signature_valid; ...
signature_valid === 1;` stub — a bit the citizen's own client set, unchecked
by any math. As of this pass:

- **Zero occurrences of the `signature_valid` stub remain anywhere in
  `circuits/src/`** (confirmed by repo-wide grep, the same check
  `EXECUTION_PLAN.md` Day 4 specifies as its definition of done).
- Every one of the five circuits now verifies, in-circuit, a real
  EdDSA-Poseidon signature from a named issuer key, over a Poseidon
  commitment to the *specific attributes that circuit's claim depends on* —
  not just the secret. This distinction is load-bearing: `location_proof`
  and `compound_proof`'s commitments bind state/district(/pincode/DOB), not
  only the secret, specifically so that a genuine signature over one
  location can't be replayed against a forged one (see the tampered-state
  tests in `circuits/test/locationProof.test.mjs`). `pan_proof` went
  further and eliminated a second, separate stub (`pan_linked`) at the same
  time, rather than leaving a smaller stub in the larger one's place.
- `backend/services/proof_verifier.py`'s `trust_level` resolution is now
  uniformly driven by the issuer registry for all five claim types, not a
  caller-supplied flag for four of them and real logic for one.

## The one true, checkable claim this project can now make that Anon Aadhaar cannot

> Every claim type in this repo uses a real, tested, issuer-verified
> signature — zero self-asserted stubs — and here is our evidence-based path
> to full UIDAI in-circuit verification over the offline-XML channel, a
> document format nobody has publicly closed.

That is Property A (fully closed, all five circuits, not just one) combined
with Property B (spiked with real numbers, not asserted). It is deliberately
not a claim about Property C (where Anon Aadhaar is ahead in research
maturity, and this document says so) or about years of production traffic
(which Anon Aadhaar has and this project does not).

## What this project is NOT claiming

- **Not** claiming UIDAI-verified proofs. The circuits verify a registered
  *issuer's* signature, not UIDAI's signature directly — see
  `docs/UIDAI_INTEGRATION.md`, which uses the words "issuer-verified," not
  "UIDAI-verified," deliberately.
- **Not** claiming production readiness. The trusted-setup ceremony is
  planned (`docs/TRUSTED_SETUP_CEREMONY_PLAN.md`) but not executed; the
  offline-XML channel is estimated but not built.
- **Not** claiming to be ahead of Anon Aadhaar on proving-system research —
  they are actively benchmarking Halo2/Noir in public; this project has
  evaluated the question and made a narrower, near-term recommendation.

## Why this is worth sending to the Anon Aadhaar team

Per `EXECUTION_PLAN.md` §5: only once Property B has real, working code
(even partial) does a first concrete contact make sense — a GitHub issue or
message referencing their own Devcon SEA Halo2/Noir talk, using this
document as the artifact. **That condition is not yet met** — this pass
closed Property A and spiked Property B; it did not build the offline-XML
circuit. This document is accurate to send as a status update or to invite
early feedback on the proving-system reasoning in
`docs/PROVING_SYSTEM_EVALUATION.md`, but per the plan's own sequencing, the
first-contact moment is still ahead, not now.
