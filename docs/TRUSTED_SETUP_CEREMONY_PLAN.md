# Trusted Setup Ceremony — Plan

**Status: a plan, not an execution.** `docs/TRUSTED_SETUP.md` already
explains *why* the current single-party ceremony isn't production-grade and
sketches the MPC requirement in general terms. This document is the
concrete version: who, in what order, publishing what, for the five circuits
that exist today. Running it for real needs actual independent participants
to recruit and schedule — that's outreach work, not something this pass can
execute, but a documented plan is itself a credibility artifact a government
or institutional reviewer will look for before trusting a "prototype" label
is temporary rather than permanent.

## Scope

All five circuits' phase-2 ceremonies (`age_proof`, `location_proof`,
`citizenship_proof`, `compound_proof`, `pan_proof`), plus adopting a public
phase-1 Powers-of-Tau file instead of generating one locally.

## Phase 1: adopt a public ceremony (no new outreach needed)

Per `docs/TRUSTED_SETUP.md`, phase 1 is circuit-independent — reuse the
Hermez/Polygon `powersOfTau28_hez_final_*.ptau`, a ceremony that already ran
with several hundred independent contributors. Concretely:

1. Download the smallest Hermez file whose power covers the largest circuit
   here (`age_proof` needs 2^16 today — see `EXECUTION_PLAN.md` Day 1).
2. Verify its hash against Hermez's published manifest before use.
3. Swap `PTAU` in `scripts/build_circuits.sh` to point at the downloaded
   file instead of running local `powersoftau new`.

This alone removes "one machine generated all of phase 1" as an attack
surface, with no scheduling dependency — it should happen before phase 2
outreach even starts.

## Phase 2: per-circuit ceremony — candidate participants

Three participant *types*, chosen so no single institutional interest
controls a majority of contributors:

1. **An academic crypto lab.** A university group with a public track record
   in applied cryptography (the same kind of institution that would
   plausibly co-author or review a paper about this system) — contributes
   technical credibility and is likely to actually audit the ceremony
   software, not just click through it.
2. **A CERT-In-empanelled auditor.** Ties the ceremony to an institution
   already recognised by the Indian government's own security-empanelment
   process — directly relevant for the government-readiness track this
   project is aiming at (STQC/CERT-In empanelment, per the roadmap).
3. **A civil-society reviewer.** A digital-rights or privacy-focused
   organisation with no institutional stake in the system being trusted —
   the participant most likely to actually publish independent commentary
   if something looks wrong, which is the point of including them.

Minimum: one of each, three total, per circuit — more if any of the three
categories has multiple willing participants. The security property is
"1-of-N honest," so more independent contributors only strengthens it; three
is a floor set by wanting each *type* represented at least once, not a
cryptographic requirement.

## Sequence

1. **Recruit and confirm participants** (outreach — not a coding task, timeline
   depends entirely on external response time).
2. **Publish the ceremony coordination plan** — which circuit's `.r1cs` each
   contribution round is over, in what order, with a fixed cutoff date per
   round, hosted somewhere append-only (a public git repo with signed commits
   is sufficient; doesn't need new infrastructure).
3. **Each contributor runs `snarkjs zkey contribute`** locally, independently,
   and publishes: their contribution hash, a brief attestation of how they
   generated their entropy, and (recommended, not required) a signature over
   the resulting `.zkey` hash from a key already publicly associated with
   them (an institutional PGP key, a known Ethereum address, etc.) — so the
   attestation can't be trivially forged after the fact by someone else
   claiming their slot.
4. **Finalise with a public randomness beacon** (`snarkjs zkey beacon`) after
   the last human contribution, so nobody — including the last contributor —
   controls the final randomness alone.
5. **Publish the full transcript**: every contribution hash in order, every
   attestation, the beacon input and output, and the final verification keys
   — everything needed for a third party to run `snarkjs zkey verify`
   themselves and confirm the chain, without trusting this project's own
   claim that it did so correctly.
6. **Repeat per circuit.** Five circuits can share the same participant pool
   and be run as five short rounds rather than five separate recruitment
   efforts, once participants are confirmed.

## What "done" looks like

- `circuits/keys/*_final.zkey` for all five circuits descend from the public
  Hermez phase-1 file and a published, independently-verifiable phase-2
  transcript — not from `scripts/build_circuits.sh`'s local single-party
  contribution (see `docs/TRUSTED_SETUP.md`'s existing verification command).
- The transcript is published somewhere durable and citable (not just
  "available on request") — e.g. a tagged release in this repo plus mirrors
  on each contributor's own infrastructure, so no single party (including
  this project) can quietly alter history.
- `README.md`'s status table can then say "multi-party ceremony: complete,
  transcript at [link]" instead of the current single-party caveat — and per
  the honesty standard the rest of this plan holds to, it should say nothing
  stronger than that until this actually happens.

## Explicitly out of scope for this document

Recruiting the actual three participants, scheduling the actual rounds, and
running the actual ceremony. Those depend on organisations agreeing to
participate, which this pass cannot make happen — flagging it as
Week-5+ work (per `EXECUTION_PLAN.md` §5) rather than pretending a plan
substitutes for execution.
