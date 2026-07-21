# Claims Catalogue

Every claim a citizen can prove, the circuit behind it, and — the important column
— exactly what the verifier learns versus what stays private.

| Claim | Circuit | Verifier learns | Stays private |
| --- | --- | --- | --- |
| `age_above_18` | age_proof | age ≥ 18 (boolean) | DOB, exact age, name, address, Aadhaar no. |
| `age_above_21` | age_proof | age ≥ 21 | same as above |
| `age_above_60` | age_proof | age ≥ 60 | same as above |
| `voter_eligible` | age_proof | age ≥ 18 | same as above |
| `india_citizen` | citizenship_proof | a UIDAI-signed Aadhaar exists | everything else |
| `state_resident` | location_proof | the state (only) | house, street, pincode, district, DOB, name |
| `district_resident` | location_proof | state + district | house, street, pincode, DOB, name |
| `compound_kyc` | compound_proof | valid Aadhaar + age ≥ N + state | DOB, exact age, full address, pincode, name |
| `pan_holder` | pan_proof | holds a linked PAN + a per-verifier pseudonym | the PAN number itself |

## Notes per claim

### Age (`age_above_*`, `voter_eligible`)
The circuit computes age honestly across the birthday boundary — a person born
2008-12-31 is *not* 18 on 2026-07-14 and the circuit refuses to prove it. The
verifier supplies the current date; the server pins it to its own clock (±1 day) so
a verifier can't backdate to age someone up. A single circuit serves all
thresholds; the threshold is a public input, so the same proving key covers 18, 21,
60 and any future value.

### Citizenship (`india_citizen`)
The smallest claim: it proves possession of a UIDAI-signed Aadhaar and nothing
else — its proof has exactly four public signals, leaving no room for a personal
fact to hide. Strictly this attests **residency** (what Aadhaar issues on), not
legal citizenship; the name is kept for API continuity and this distinction is the
reason it's spelled out here.

### Location (`state_resident`, `district_resident`)
A granularity ladder: country → state → district → pincode. A `required_*` field of
0 means "don't care", and the circuit reveals the citizen's state **only when a
state was actually requested** — a country-only proof discloses no geography at
all. Crucially, `proof_level` cannot lie: a proof stamped "pincode verified" while
leaving the pincode unconstrained is unprovable.

### Compound KYC (`compound_kyc`)
Three facts — valid Aadhaar, age ≥ threshold, state residency — in one proof. The
value over three separate proofs isn't just size: all three are bound to the **same
private secret**, so they are provably about one person. Three independent proofs
could be mixed and matched across people; this cannot.

### PAN (`pan_holder`)
Proves possession of a PAN linked to the Aadhaar, and emits a `pan_pseudonym` =
`Poseidon(pan, verifier_id)`. The verifier can recognise a returning PAN holder and
dedup, but cannot recover the PAN and cannot link it to the pseudonym any other
verifier sees. Contrast today's norm: handing every counterparty your actual PAN, a
permanent cross-linkable identifier. **Note:** like `signature_valid`, the
`pan_linked` bit is currently client-asserted — see
[UIDAI_INTEGRATION.md](UIDAI_INTEGRATION.md); this circuit demonstrates the privacy
construction, not a trusted PAN attestation, and reports `trust_level: demo`.

## The nullifier (applies to every claim)

Each proof emits `nullifier = Poseidon(aadhaar_secret, verifier_id, expiry)`:

- **Same** citizen + verifier + session → same nullifier → replay is detectable.
- **Different** verifier → different nullifier → no cross-verifier tracking.
- Reveals nothing about the citizen — it's a hash of a secret that never leaves the
  device.

The backend registry keys on `(claim_type, nullifier)`, so one citizen can present
different claims to the same verifier in one session while a true replay (same claim
*and* nullifier) is still refused.
