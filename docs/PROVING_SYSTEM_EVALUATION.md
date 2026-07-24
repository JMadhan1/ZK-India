# Proving System Evaluation — Circom/Groth16 vs. Halo2/Noir

**Question:** should the *next* circuit built in this repo (the offline-XML
signature verification scoped in `docs/XML_SIGNATURE_SPIKE.md`) stay on
Circom/Groth16, or move to a universal/updatable-setup system? This is
Property C from `EXECUTION_PLAN.md` §1 — a decision, not an implementation.

## Why this is even a live question

Anon Aadhaar — the closest prior art, and the project whose lineage this
repo's issuer-credential pattern already follows — is itself moving off
Circom. At Devcon 7 SEA (Bangkok, November 2024), PSE engineer Hridam Basu
presented ["Anon-Aadhaar Protocol using Halo2 and
Noir"](https://archive.devcon.org/devcon-7/anon-aadhaar-protocol-using-halo2-and-noir/),
a comparative benchmark of Circom, Halo2, and Noir backends for the same
protocol. That a team who already shipped a working Circom/Groth16 system in
production chose to spend engineering effort re-benchmarking on Halo2/Noir is
itself signal: they hit something in Circom/Groth16 worth moving away from,
not a greenfield preference.

## What Groth16 (this repo's current system) actually costs

- **Per-circuit trusted setup.** Every new circuit — including the
  offline-XML one — needs its own Powers-of-Tau-derived `.zkey` and its own
  ceremony (see `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`). Five circuits, five
  ceremonies to run and publish, and a sixth if the XML circuit ships.
- **No composability.** Each circuit's setup is independent; there is no way
  to amortize the ceremony cost across circuits or to update one circuit's
  setup without redoing that circuit's ceremony from scratch.
- **What it's good at.** Small proofs (~800 bytes, three group elements) and
  fast verification (one pairing check) — which is exactly why Row D of this
  project (the backend verification service) is cheap to operate today. This
  is a real advantage worth not throwing away for circuits that are already
  built and working.

## What a universal-setup system (Halo2, or Noir on a PLONK-family backend) buys

- **One ceremony, many circuits.** A universal/updatable SRS (as used by
  PLONK-family systems, which Halo2 and Noir's typical backends build on)
  is generated once and reused for every circuit built afterward — including
  ones not yet designed. For a project planning to add the offline-XML
  circuit, then likely more claim types over time, this converts "N
  ceremonies" into "1 ceremony, plus incremental updates."
- **Updatability.** New participants can extend the setup's security after
  the fact ("perpetual powers of tau" style), rather than the setup being
  frozen the moment the last contributor destroys their toxic waste.
- **Cost.** Larger proofs and slower verification than Groth16, generally —
  the tradeoff is setup flexibility for per-proof overhead. For a
  million-constraint-class circuit like the offline-XML one, this tradeoff
  is far more likely to be worth it than for the small circuits already
  shipped here.

## Recommendation

**Stay on Circom/Groth16 for the five circuits already shipped. Build the
offline-XML circuit (Property B, Weeks 2–4 per the roadmap) on a
universal-setup system instead of extending Groth16 to it.** Reasoning:

1. **Don't re-ceremony what already works.** The five existing circuits are
   small (hundreds to ~8,100 constraints), their Groth16 ceremonies are cheap
   to run for real (see `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`), and migrating
   them to a new proving system now would trade a working, tested asset for
   re-verification risk with no corresponding benefit — nothing about their
   size or use case needs what a universal setup buys.
2. **The offline-XML circuit is exactly the case where a universal setup
   pays for itself.** `docs/XML_SIGNATURE_SPIKE.md` estimates it in the low
   millions of constraints — a scale where a from-scratch multi-party Groth16
   ceremony (candidate participants: an academic crypto lab, a CERT-In-
   empanelled auditor, a civil-society reviewer — see
   `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`) is a heavier, slower-to-organize
   undertaking than reusing an existing public universal SRS.
3. **This mirrors, not copies, Anon Aadhaar's direction.** They're
   re-benchmarking their *entire* protocol on Halo2/Noir; this repo's
   recommendation is narrower — new circuit, new system; existing circuits,
   existing system — because unlike Anon Aadhaar this project doesn't yet
   have years of production traffic on the Groth16 circuits that would make
   a full migration worth its own risk.
4. **Halo2 over Noir, if forced to choose between the two now**, on
   maturity grounds: Halo2 has a longer track record of production ZK
   identity/rollup deployments to draw operational lessons from; Noir's
   ecosystem (and its typical backend pairing) is younger. This is a
   preference, not a decision that needs to be locked in before Week 2 —
   revisit it against whatever the actual XML-circuit prototyping surfaces
   about tooling maturity, since that will be better evidence than this
   document has access to today.

## What would change this recommendation

- If the offline-XML spike (`docs/XML_SIGNATURE_SPIKE.md`) comes back
  smaller than estimated (e.g. C14N turns out cheap in practice) such that
  the whole circuit fits comfortably under ~1M constraints, Groth16 becomes
  more competitive again and this decision should be revisited.
- If a second and third new circuit are added in quick succession after the
  XML one, the "amortize one ceremony across many circuits" argument gets
  strictly stronger, reinforcing rather than reversing this recommendation.
