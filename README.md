# ZKGate India

**India's first indigenous Zero-Knowledge Identity Layer.**

Prove a fact about yourself — that you are over 18, that you live in a particular
state, that you hold a valid Aadhaar — to a bank, a government portal, or a shop,
**without disclosing any personal data**. No name, no date of birth, no address,
no Aadhaar number leaves your device. Only a ~800-byte cryptographic proof does.

> Built for the TechGig *Sovereign Technology for India* hackathon.

---

## The idea in one screen

Today, proving you are an adult to buy a SIM means handing over a photocopy of a
document that also reveals your name, exact date of birth, address, photo and a
permanent national identifier — to a counterparty who now has to store and secure
all of it, and often doesn't.

ZKGate replaces the photocopy with a **zero-knowledge proof**. Your Aadhaar
offline eKYC XML is parsed **in your own browser**. A proof is generated **on your
device** that answers exactly one question — "age ≥ 18?" — and nothing else. The
verifier checks the proof's mathematics and learns only the answer.

```
   Citizen's device                         Verifier's server
   ────────────────                         ─────────────────
   Aadhaar XML  ──parse──►  fields
                            │
                            ├─ build witness (DOB stays here)
                            │
                            ▼
                     Groth16 proof ───────►  verify pairing  ──►  { age_above_18: true }
                     (~800 bytes)            + check it answers
                                             the asked question
                                             + reject replays
```

The XML never leaves the browser. There is no upload endpoint on the server that
would even accept it.

---

## What's in the box

| Directory | What it is | Status |
| --- | --- | --- |
| `circuits/` | 5 Circom circuits (age, location, citizenship, compound KYC, PAN) + Groth16 setup | **29 tests passing** |
| `backend/` | FastAPI verification API with a real Python Groth16 verifier, nullifier replay-guard, tamper-evident audit chain | **26 tests passing** |
| `sdk/` | JavaScript SDK: parse Aadhaar XML, derive secret, build witness, generate & submit proofs | **8 tests passing** |
| `frontend/` | Next.js citizen portal — in-browser proof generation | builds clean |
| `verifier-portal/` | Next.js verifier portal — request & verify proofs | builds clean |
| `test-data/` | Synthetic Aadhaar XMLs and fixtures (no real identities) | — |
| `docs/` | Architecture, claims catalogue, the UIDAI integration gap, trusted-setup notes | — |

Every layer verifies **real cryptography**, not a mock. The backend's Python
verifier is cross-checked against snarkjs, and the JS and Python geography
encoders are proven byte-identical so a proof built in the browser verifies on the
server.

---

## Quick start

Prerequisites: **Node ≥ 20**, **Python ≥ 3.11**, **circom 2.x**, and (optional)
Docker. `snarkjs` is installed as a dependency.

```bash
# 1. Install JS deps (root workspace) and Python deps
npm install
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt   # Windows
# .venv/bin/pip install -r backend/requirements.txt      # macOS/Linux

# 2. Build the circuits (compile + trusted setup + copy artifacts to the portal)
npm run build:circuits

# 3. Run everything
npm run dev            # frontend :3000, verifier :3001, backend :8000
```

Then open **http://localhost:3000**, click *Load test citizen*, pick a claim, and
generate a proof. Send it to the demo bank and watch it verify — then send it again
and watch the replay get rejected.

### See the whole pipeline in one command

With the backend running (`npm run dev:backend`):

```bash
node scripts/e2e_demo.mjs
```

```
✓ Proof generated in 390ms (8 public signals)
  Public signals contain no DOB: ✓ confirmed
✓ VALID. Claims: {"age_above_18":true,"age_threshold_proven":18}
✓ Replay refused: "proof already used (replay); request a fresh proof"
✓ Semantic gate refused it: "proof establishes age>=18, claim needs age>=21"
✓ End-to-end pipeline behaves correctly.
```

### Run the tests

```bash
bash scripts/run_tests.sh        # circuits + SDK + backend
```

---

## Two design decisions worth knowing

**1. Circuits _constrain_ their claims — they don't _report_ them.** The naive age
circuit outputs `is_valid = 0` for a minor and lets the verifier check the flag.
That's a footgun: any verifier who forgets the check is wide open, and an underage
person still holds a "valid" proof. Here the circuit asserts `is_valid === 1`, so a
minor **cannot generate a proof at all**. "The proof verifies" and "the claim is
true" become the same statement. (See the header comment in
[`circuits/src/ageProof.circom`](circuits/src/ageProof.circom).)

**2. Verification is two gates.** A cryptographically valid proof can still answer
the wrong question — an `age ≥ 18` proof does not establish `age ≥ 21`. The backend
verifies the pairing **and** checks the public signals match what the verifier
asked, then rejects mismatches. Both gates are tested.

---

## The one honest caveat

This prototype proves the **zero-knowledge layer** end to end with real
cryptography. The single piece it stubs is the **UIDAI signature attestation**: the
citizen's client asserts `signature_valid = 1` rather than the circuit proving the
RSA-SHA256 XMLDSig against UIDAI's key *inside* the proof. Every demo proof is
tagged `trust_level: "demo"` and the server never reports it as attested. Closing
this gap is the main production work item and is written up in
[`docs/UIDAI_INTEGRATION.md`](docs/UIDAI_INTEGRATION.md).

The trusted setup here is a single-party ceremony, fine for a prototype and not for
production; see [`docs/TRUSTED_SETUP.md`](docs/TRUSTED_SETUP.md).

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit, data flow, threat model
- [`docs/CLAIMS.md`](docs/CLAIMS.md) — every claim, what it reveals, what it hides
- [`docs/UIDAI_INTEGRATION.md`](docs/UIDAI_INTEGRATION.md) — the demo-vs-real signature gap and how to close it
- [`docs/TRUSTED_SETUP.md`](docs/TRUSTED_SETUP.md) — the ceremony and its security
- API reference: run the backend and open **http://localhost:8000/docs**

## Licence

MIT (prototype).
