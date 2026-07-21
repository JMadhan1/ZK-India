# Trusted Setup

Groth16 needs a per-circuit **trusted setup** that produces the proving key
(`.zkey`) and verification key. The setup generates secret randomness — "toxic
waste" — that **must be destroyed**. Anyone who keeps it can forge proofs that
verify perfectly for that circuit.

## What `scripts/build_circuits.sh` does

1. **Powers of Tau (phase 1)** — circuit-independent. Generates a fresh ceremony
   at 2^12 (4096 constraints; the largest circuit here uses ~1,125), with one
   contribution seeded from this machine's entropy.
2. **Groth16 setup (phase 2)** — per circuit. Derives each `.zkey` from the phase-1
   output plus one more contribution.
3. Exports each verification key to JSON and copies the wasm + proving keys to the
   citizen portal's static assets.

## Why the prototype's setup is NOT production-grade

It is a **single-party ceremony**. One machine generated all the randomness, and if
that one participant retained their toxic waste they could forge proofs for every
circuit in this repo. For a hackathon prototype demonstrating the protocol, that is
acceptable — the cryptography being *demonstrated* is real; only the *ceremony's
trust* is short-cut.

For production it is not acceptable.

## What production requires

A **multi-party computation (MPC) ceremony**. The security property is
"1-of-N honest": as long as *at least one* of N independent contributors destroys
their toxic waste, the setup is sound — no colluding subset short of all N can
forge. In practice:

- **Phase 1** can reuse a large public ceremony rather than generating fresh. The
  Hermez/Polygon `powersOfTau28_hez_final_*.ptau` files come from a ceremony with
  many hundreds of contributors and are the standard choice. Swap the `PTAU`
  variable in `build_circuits.sh` to point at a downloaded, hash-verified Hermez
  file and skip local phase-1 generation.
- **Phase 2** is per-circuit and must be run as its own multi-contributor ceremony
  (snarkjs supports `zkey contribute` from many parties, or `zkey beacon` to finalise
  with a public randomness beacon). Contributors should be independent parties —
  ideally a mix of the issuing authority, civil-society observers, and academics —
  each publishing an attestation of their contribution hash.
- Publish every contribution transcript so anyone can verify the chain with
  `snarkjs zkey verify`.

## Verifying what you have

```bash
# Confirm a proving key descends from the expected r1cs and ptau
snarkjs zkey verify circuits/build/ageProof/ageProof.r1cs \
    circuits/keys/pot12_final.ptau circuits/keys/age_proof_final.zkey
```

## What ships in git

Only the **verification keys** (`*_verification_key.json`) and
`signal_layout.json` are committed — they are small, public by design, and needed
by the backend to verify. The proving keys (`.zkey`), the `.ptau`, and the compiled
`.r1cs`/`.wasm` are git-ignored and regenerated with `npm run build:circuits`,
because in a real deployment they must come from the production ceremony, not from
whatever a developer ran locally.
