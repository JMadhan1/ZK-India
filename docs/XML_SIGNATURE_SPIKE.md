# In-Circuit Offline-eKYC XML Signature Verification — Spike

**Status: research spike, not an implementation.** This document estimates
what it would cost to verify UIDAI's real RSA-SHA256 XMLDSig signature on the
Aadhaar Offline eKYC XML **inside a Circom circuit** — Property B from
`EXECUTION_PLAN.md` §1, the channel nobody (including Anon Aadhaar) has
publicly closed. Nothing here is a working circuit. The goal is to go from
"not started" to "prototyped and estimated," honestly.

## 1. What's confirmed about the XML structure

Checked directly against `test-data/generate_test_xml.py` and
`test-data/sample_aadhaar.xml`, which were authored to match UIDAI's real
Offline eKYC element layout (though the signature itself is a placeholder —
see §1.3):

### 1.1 Algorithms

```xml
<Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  </ds:SignedInfo>
  <ds:SignatureValue>DEMO_SYNTHETIC_SIGNATURE_NOT_A_REAL_UIDAI_SIGNATURE</ds:SignatureValue>
</Signature>
```

- **Canonicalization: plain C14N 1.0** (`REC-xml-c14n-20010315`), **not**
  Exclusive C14N (`xml-exc-c14n#`). This corrects an assumption in the
  original Week-1 plan text, which guessed Exclusive C14N — worth stating
  precisely since the two have different constraint costs (Exclusive C14N
  additionally has to reason about namespace visibility/inheritance across
  the document, which plain C14N does not).
- **Signature: RSA-SHA256**, matching Anon Aadhaar's QR-channel approach and
  UIDAI's publicly documented offline-KYC signing (confirmed via UIDAI's
  published certificate download instructions already present in
  `test-data/uidai_public_key.pem`).

### 1.2 What gets signed

Per XMLDSig, `SignatureValue` is `RSA-Sign(canonicalize(SignedInfo))`, where
`SignedInfo` contains a `Reference` whose `DigestValue` is
`SHA-256(canonicalize(UidData))`. Two canonicalization passes and one RSA
operation, not one — this is a detail easy to get wrong when estimating: the
digest covers the *canonicalized* `<UidData>` subtree (`<Poi>`, `<Poa>`,
`<Pht>`), and the signature covers the *canonicalized* `<SignedInfo>`, which
itself embeds that digest.

### 1.3 A real gap in the repo's own test data

`test-data/generate_test_xml.py`'s `<Signature>` block is **incomplete**
relative to real XMLDSig: it has no `<ds:Reference>`, `<ds:DigestMethod>`,
`<ds:DigestValue>`, or `<ds:KeyInfo>` (confirmed by grep — zero matches for
any of those four elements anywhere in `test-data/`). It's sufficient as a
"this is unsigned, demo mode" placeholder, which is all it was ever meant to
be, but it means **the repo has no synthetic XML that is actually a complete,
verifiable XMLDSig envelope**, real or fake. Anyone prototyping real
verification needs to build one first — see §2.

## 2. Reproducing the mechanics outside the circuit

Per the same discipline the issuer-credential work already followed ("verify
in plaintext before verifying in-circuit" — `docs/UIDAI_INTEGRATION.md`), a
throwaway Node script (`crypto.generateKeyPairSync("rsa", {modulusLength:
2048})` standing in for UIDAI's key, since the repo has no real UIDAI-signed
sample and `test-data/uidai_public_key.pem` is an explicit placeholder)
reproduced the exact two-stage digest-then-sign construction described in
§1.2 and verified it with `crypto.verify()`:

```json
{
  "canonicalUidDataBytes": 94,
  "canonicalSignedInfoBytes": 359,
  "digest": "INqHNNxTjjKmX2d7SL4C8kiHcidoqQgRWLh2eCT5sc0=",
  "digestOk": true,
  "sigOk": true,
  "rsaModulusBits": 2048,
  "signatureBytes": 256
}
```

This confirms the byte-sequence understanding in §1.2 is correct, on a
representative (small, already-sorted, namespace-free) element. It is
**not** a general C14N implementation — the test element has no namespaces
and was constructed with attributes already in lexicographic order, so it
happens to canonicalize to itself. A real `<UidData>` subtree, and
especially the full `<Signature>`-bearing document, would exercise C14N's
actual rules (namespace inheritance, attribute reordering, whitespace and
entity normalization) which this spike deliberately did not need to.

## 3. Constraint cost estimate

Three components, each estimated from public reference numbers rather than
guessed:

| Component | Estimate | Source |
|---|---|---|
| RSA-2048 (pkcs1v15+sha256) signature verify alone | **~536,000 R1CS constraints** | [circom-rsa-verify](https://github.com/zkp-application/circom-rsa-verify) published benchmark (530,676 wires, 536,212 constraints, Montgomery CIOS modexp) |
| RSA-2048 verify **+** SHA-256 hashing of the signed payload, end to end (Anon Aadhaar's QR-based circuit) | **~1,115,080 R1CS constraints** | Published in an IIT Bombay ZK/Aadhaar age-proof paper (found via search; the QR channel needs no XML canonicalization at all — see §3.1) |
| In-circuit XML C14N (attribute sorting, namespace resolution, whitespace/entity normalization) over a multi-KB document | **No public reference implementation or benchmark exists** | Confirmed by search — this is the genuinely open problem |

**Total estimate: low millions of R1CS constraints**, dominated by whichever
of {RSA verify, C14N} turns out larger — and C14N is the one with no existing
implementation to anchor an estimate against, which is itself the headline
finding of this spike, not a detail to smooth over.

### 3.1 Why Anon Aadhaar's number (~1.1M) undersells this project's actual cost

Anon Aadhaar verifies RSA-SHA256 over the **Secure QR code**, not the XML.
Confirmed directly from their own documentation: the QR payload is "signed
data" as a flat delimited byte array — extract bytes, SHA-256, RSA-verify.
**No canonicalization step exists in their pipeline at all**, because a
byte array has no canonical-form ambiguity to resolve; XML does. Their
1.1M-constraint figure is a fair benchmark for "RSA-2048 verify + SHA-256
over a few KB of flat bytes," but it is not evidence about C14N cost,
because they never had to pay it. This is precisely the "document format
nobody has publicly closed" framing from `EXECUTION_PLAN.md` §5, restated
now with a citation instead of an assertion.

### 3.2 What a naive in-circuit C14N would have to do

Byte/string manipulation is disproportionately expensive in R1CS relative to
arithmetic, because every conditional branch a canonicalizer takes (is this
attribute alphabetically before that one? does this prefix need a xmlns
declaration inherited from an ancestor? does this text node contain a
character requiring entity-escaping?) becomes a constraint-level multiplexer
over all possibilities, evaluated for every byte position regardless of the
actual input, since a circuit has no data-dependent control flow. A
conservative expectation is that C14N alone could match or exceed the RSA
verify cost, pushing the realistic total toward **2–4M+ constraints** — this
is a range, not a computed figure, and should be treated as the thing a real
prototype needs to falsify or confirm, not as settled.

## 4. Proving-time and practicality implications

The circuits in this repo today (post the issuer-credential upgrade) range
from a few hundred constraints (`citizenship_proof`) to ~8,100 non-linear
constraints (`age_proof`, the largest, after adding the EdDSA-Poseidon
issuer-credential check — see `EXECUTION_PLAN.md` Day 1's Powers-of-Tau
bump from 2^12 to 2^16). A circuit in the low millions of constraints is
**two to three orders of magnitude larger**. Concretely, that means:

- Powers-of-Tau ceremony: would need 2^21–2^22 (2M–4M), not 2^16 — a
  materially heavier ceremony (see `docs/TRUSTED_SETUP_CEREMONY_PLAN.md`).
- Proving time: circuits in the ~1M constraint range are the ones ZK-identity
  projects (Anon Aadhaar included) already report as the practical ceiling
  for in-browser/mobile proving before it becomes a UX problem — several
  seconds to tens of seconds on a modern phone is the realistic range, and
  this project's estimate sits at or above that ceiling, not comfortably
  under it.

## 5. Go/no-go recommendation

**No-go on Circom/Groth16 for this specific channel, for now — go on
treating it as the next major project phase, not a Week-1 or Week-2
deliverable.** Reasons:

1. The RSA-verify cost alone (§3, row 1–2) is already at the edge of what
   ships comfortably to a phone; adding an unquantified, unprecedented C14N
   cost on top is not a "finish it next sprint" gap, it's a research problem.
2. This is exactly the reasoning `EXECUTION_PLAN.md` §5 already anticipated
   ("Weeks 2–4: Implement Property B for real ... starting with the smallest
   viable claim") — this spike doesn't change that timeline, it makes the
   Week-1 estimate honest instead of a guess, which was the actual Day-6
   deliverable.
3. The proving-system decision in `docs/PROVING_SYSTEM_EVALUATION.md` is
   directly relevant here: if that decision favors a Halo2/Noir-style
   universal-setup system, building the offline-XML channel on THAT system
   instead of Circom/Groth16 could plausibly be the more efficient one-time
   investment, since it avoids a second heavyweight trusted-setup ceremony
   for a circuit this size. That sequencing question is worth resolving
   before writing the first line of an in-circuit C14N implementation.

### What Week 2 (per the roadmap) should start with, concretely

Not RSA, not C14N — start with a **minimal real signed sample**. This spike
could not use a real UIDAI-signed XML (none exists in this repo, and none
should be fabricated as if genuine). The first concrete task of the next
phase is obtaining a citizen's real, consented Offline eKYC XML (masked
digits, rotating reference ID — the actual channel), running the exact
digest/sign check from §2 against it with the **real** UIDAI certificate
(`test-data/uidai_public_key.pem`'s placeholder replaced per its own
instructions), and only then starting to prototype C14N — in that order,
because a wrong assumption about the real document's exact byte layout
would invalidate everything built on top of it.
